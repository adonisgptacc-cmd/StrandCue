import { z } from 'zod';

import type { TodayGuidanceRequest } from '../../../apps/mobile/src/guidance/today-guidance-core.ts';

const CommandSchema = z.object({
  requestId: z.string().uuid(),
  goalId: z.literal('basic_wash'),
  currentCondition: z.unknown().optional(),
}).strict();

const ReadyResultSchema = z.object({
  status: z.literal('ready'),
  requestId: z.string().uuid(),
  asOf: z.iso.datetime({ offset: true }),
  engineVersion: z.string().min(1).max(40),
  bundleId: z.string().min(1).max(120),
  bundleVersion: z.string().min(1).max(40),
  inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  input: z.record(z.string(), z.unknown()),
  decision: z.record(z.string(), z.unknown()),
}).passthrough();

const TrustedReceiptSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.literal('ready'),
}).passthrough();

export type ReadyResult = z.output<typeof ReadyResultSchema>;

export interface TodayEdgeDependencies {
  /** Must verify the bearer token against Supabase Auth, not decode it locally. */
  readonly authenticate: (token: string) => Promise<{ id: string } | null>;
  /** Owner-scoped database quota, called once per valid request. */
  readonly reserveRequest: (token: string) => Promise<void>;
  /** Reads only under that user's JWT; the RPC derives its own owner. */
  readonly readRevision: (token: string) => Promise<number>;
  /** Uses owner-scoped source readers and the checked-in reviewed bundle. */
  readonly generate: (request: TodayGuidanceRequest, token: string) => Promise<unknown>;
  /** Privileged service-only RPC; owner comes solely from authenticate. */
  readonly persistReady: (ownerId: string, result: ReadyResult, revision: number) => Promise<unknown>;
  readonly now: () => Date;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = /^Bearer ([^\s]{1,8192})$/.exec(header ?? '');
  return match?.[1] ?? null;
}

/** The only user-facing entry point for server-evaluated Today guidance. */
export async function handleTodayGuidanceRequest(
  request: Request,
  dependencies: TodayEdgeDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
  const token = bearer(request);
  if (token === null) return json({ error: 'authentication-required' }, 401);

  let user: { id: string } | null;
  try {
    user = await dependencies.authenticate(token);
  } catch {
    return json({ error: 'authentication-required' }, 401);
  }
  if (user === null || !z.string().uuid().safeParse(user.id).success) {
    return json({ error: 'authentication-required' }, 401);
  }

  let command: z.output<typeof CommandSchema>;
  try {
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      return json({ error: 'invalid-command' }, 400);
    }
    const body = await request.text();
    if (body.length > 32768) return json({ error: 'invalid-command' }, 400);
    command = CommandSchema.parse(JSON.parse(body));
  } catch {
    return json({ error: 'invalid-command' }, 400);
  }

  const asOf = dependencies.now().toISOString();
  const generatedRequest: TodayGuidanceRequest = {
    ownerId: user.id,
    goalId: command.goalId,
    requestId: command.requestId,
    asOf,
    loadedAt: asOf,
    ...(command.currentCondition === undefined ? {} : { currentCondition: command.currentCondition }),
  };

  try {
    await dependencies.reserveRequest(token);
    const before = await dependencies.readRevision(token);
    const generated = await dependencies.generate(generatedRequest, token);
    const after = await dependencies.readRevision(token);
    if (!Number.isSafeInteger(before) || before < 0 || before !== after) {
      return json({ error: 'source-changed' }, 409);
    }
    if (typeof generated !== 'object' || generated === null || !('status' in generated)) {
      return json({ error: 'source-unavailable' }, 503);
    }
    if (generated.status !== 'ready') {
      if (generated.status === 'content_pending') return json({ status: 'content_pending' });
      if (generated.status === 'needs_setup' || generated.status === 'needs_input'
          || generated.status === 'rule_conflict' || generated.status === 'unsupported') {
        const { prepared: _prepared, ...publicResult } = generated as Record<string, unknown>;
        return json(publicResult);
      }
      return json({ error: 'source-unavailable' }, 503);
    }
    const parsed = ReadyResultSchema.safeParse(generated);
    if (!parsed.success || parsed.data.requestId !== command.requestId
        || parsed.data.asOf !== asOf) return json({ error: 'source-unavailable' }, 503);
    const result = parsed.data;
    const receipt = TrustedReceiptSchema.parse(await dependencies.persistReady(user.id, result, before));
    if (receipt.requestId !== result.requestId
        || receipt.inputFingerprint !== result.inputFingerprint) {
      return json({ error: 'source-unavailable' }, 503);
    }
    const { prepared: _prepared, ...publicResult } = result;
    return json({ ...publicResult, receipt });
  } catch (error) {
    if (error instanceof Error && error.message === 'guidance-rate-limited') {
      return json({ error: 'rate-limited' }, 429);
    }
    if (error instanceof Error && error.message === 'source-changed') {
      return json({ error: 'source-changed' }, 409);
    }
    return json({ error: 'source-unavailable' }, 503);
  }
}
