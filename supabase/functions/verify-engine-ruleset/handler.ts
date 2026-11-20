import { z } from 'zod';

import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.ts';
import { CompiledRulesetSchema } from '../../../packages/engine/src/contracts.ts';
import { ENGINE_EVALUATOR_VERSION } from '../../../packages/engine/src/pipeline/state.ts';

const PacketDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CommandSchema = z.object({
  publicationId: z.string().uuid(),
  packetDigest: PacketDigestSchema,
}).strict();
const DraftSchema = z.object({
  publicationId: z.string().uuid(),
  packetDigest: PacketDigestSchema,
  contentHash: PacketDigestSchema,
  parentContentHash: PacketDigestSchema.nullable(),
  packet: z.unknown(),
}).strict();

export interface VerifyEngineRulesetDependencies {
  authenticate(token: string): Promise<{ readonly id: string } | null>;
  loadDraft(token: string, publicationId: string, packetDigest: string): Promise<unknown>;
  recordVerification(input: {
    readonly publicationId: string;
    readonly packetDigest: string;
    readonly contentHash: string;
    readonly evaluatorVersion: string;
  }): Promise<void>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function bearer(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

export async function handleVerifyEngineRulesetRequest(
  request: Request,
  dependencies: VerifyEngineRulesetDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
  const token = bearer(request);
  if (token === null) return json({ error: 'authentication-required' }, 401);

  let user: { readonly id: string } | null;
  try {
    user = await dependencies.authenticate(token);
  } catch {
    return json({ error: 'authentication-required' }, 401);
  }
  if (!user || !z.string().uuid().safeParse(user.id).success) {
    return json({ error: 'authentication-required' }, 401);
  }
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    return json({ error: 'invalid-command' }, 400);
  }

  let command: z.output<typeof CommandSchema>;
  try {
    const body = await request.text();
    if (body.length > 4096) return json({ error: 'invalid-command' }, 400);
    command = CommandSchema.parse(JSON.parse(body));
  } catch {
    return json({ error: 'invalid-command' }, 400);
  }

  let rawDraft: unknown;
  try {
    rawDraft = await dependencies.loadDraft(token, command.publicationId, command.packetDigest);
  } catch {
    return json({ error: 'verification-source-unavailable' }, 503);
  }
  const draftResult = DraftSchema.safeParse(rawDraft);
  if (!draftResult.success || draftResult.data.publicationId !== command.publicationId
      || draftResult.data.packetDigest !== command.packetDigest) {
    return json({ error: 'draft-unavailable' }, 409);
  }
  const packetResult = CompiledRulesetSchema.safeParse(draftResult.data.packet);
  if (!packetResult.success || packetResult.data.ref.contentHash !== draftResult.data.contentHash) {
    return json({ error: 'draft-invalid' }, 409);
  }

  let computedHash: string;
  try {
    computedHash = canonicalRulesetContentHash(packetResult.data);
  } catch {
    return json({ error: 'draft-invalid' }, 409);
  }
  if (computedHash !== draftResult.data.contentHash) {
    return json({ error: 'content-hash-mismatch' }, 409);
  }

  try {
    await dependencies.recordVerification({
      publicationId: command.publicationId,
      packetDigest: command.packetDigest,
      contentHash: computedHash,
      evaluatorVersion: packetResult.data.ref.evaluatorVersion,
    });
  } catch {
    return json({ error: 'verification-write-unavailable' }, 503);
  }
  return json({ status: 'verified', publicationId: command.publicationId,
    packetDigest: command.packetDigest, contentHash: computedHash });
}
