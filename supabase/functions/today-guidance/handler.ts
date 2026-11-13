import { z } from 'zod';

import type { TodayGuidanceRequest } from '../../../apps/mobile/src/guidance/today-guidance-core.ts';
import { projectAssessedHeatSteps } from './assessed-heat-step.ts';

const CommandSchema = z.object({
  requestId: z.string().uuid(),
  goalId: z.literal('basic_wash'),
  currentCondition: z.unknown().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
}).strict();

const AssessmentSchema = z.object({
  assessmentId: z.string().uuid(),
  publicationId: z.string().uuid(),
  publicationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  sourceFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  status: z.enum(['content_pending', 'needs_input', 'restricted', 'lower_heat', 'no_heat', 'appropriate', 'unavailable']),
  stale: z.boolean(),
  input: z.object({ preparedInput: z.object({
    goal: z.object({ id: z.literal('basic_wash') }).passthrough(),
    availableMinutes: z.number().int().nonnegative().nullable(),
    currentCondition: z.unknown(),
  }).passthrough() }).passthrough(),
}).passthrough();
const PreparedMatchSchema = z.object({
  goal: z.object({ id: z.literal('basic_wash') }).passthrough(),
  availableMinutes: z.number().int().nonnegative().nullable(),
  currentCondition: z.unknown(),
}).passthrough();
const GeneratedStepSchema = z.object({
  stepId: z.string().min(1), position: z.number().int().positive(), action: z.string().min(1),
  productId: z.string().nullable(), productVersionId: z.string().nullable(),
  toolId: z.string().nullable(), toolVersionId: z.string().nullable(),
  waitSeconds: z.number().int().nonnegative().nullable(), rinse: z.boolean().nullable(),
  reasons: z.array(z.string()),
  heatActionRef: z.object({ publicationId: z.string().uuid(),
    publicationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict().optional(),
}).strict();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

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
  /** The owner-scoped RPC derives its owner from the verified user's JWT. */
  readonly loadAssessment?: (token: string, assessmentId: string) => Promise<unknown>;
  /** Service-only read of the exact current published rule and its content digest. */
  readonly loadHeatPublication?: (publicationId: string, digest: string) => Promise<unknown>;
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
    let assessment: z.output<typeof AssessmentSchema> | null = null;
    if (command.assessmentId) {
      if (!dependencies.loadAssessment) return json({ error: 'source-unavailable' }, 503);
      try {
        assessment = AssessmentSchema.parse(await dependencies.loadAssessment(token, command.assessmentId));
      } catch { return json({ error: 'assessment-unavailable' }, 409); }
      if (assessment.assessmentId !== command.assessmentId || assessment.stale
          || !['lower_heat', 'no_heat', 'appropriate'].includes(assessment.status)) {
        return json({ error: 'assessment-unavailable' }, 409);
      }
    }
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
    let result = parsed.data;
    const hasHeatAction = Array.isArray(result.decision.steps) && result.decision.steps.some(step =>
      typeof step === 'object' && step !== null
      && ((step as Record<string, unknown>).action === 'heat'
        || (step as Record<string, unknown>).heatActionRef != null));
    if (hasHeatAction && assessment === null) {
      return json({ status: 'content_pending' });
    }
    if (assessment) {
      const prepared = PreparedMatchSchema.safeParse(result.prepared);
      const saved = assessment.input.preparedInput;
      if (!prepared.success || saved.currentCondition === null
          || prepared.data.goal.id !== saved.goal.id
          || prepared.data.availableMinutes !== saved.availableMinutes
          || canonical(prepared.data.currentCondition) !== canonical(saved.currentCondition)) {
        return json({ error: 'assessment-condition-changed' }, 409);
      }
      if (assessment.status === 'no_heat') {
        if (!Array.isArray(result.decision.steps)
            || result.decision.steps.some(step => typeof step !== 'object' || step === null
              || !['apply', 'wait', 'rinse', 'leave_in'].includes(String((step as Record<string, unknown>).action))
              || (step as Record<string, unknown>).toolId != null
              || (step as Record<string, unknown>).toolVersionId != null)) {
          return json({ status: 'content_pending' });
        }
      } else {
        // A lower-heat verdict still needs a bound explicit owner choice.
        if (assessment.status === 'lower_heat') return json({ status: 'content_pending' });
        if (!hasHeatAction || !dependencies.loadHeatPublication) return json({ status: 'content_pending' });
        const parsedSteps = z.array(GeneratedStepSchema).safeParse(result.decision.steps);
        if (!parsedSteps.success) return json({ status: 'content_pending' });
        const loaded = z.object({ publication: z.unknown(),
          publicationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict().safeParse(
          await dependencies.loadHeatPublication(assessment.publicationId, assessment.publicationDigest));
        if (!loaded.success) return json({ status: 'content_pending' });
        const steps = projectAssessedHeatSteps({ steps: parsedSteps.data, assessment,
          publication: loaded.data.publication, publicationDigest: loaded.data.publicationDigest });
        if (steps === null) return json({ status: 'content_pending' });
        result = { ...result, decision: { ...result.decision, steps } };
      }
      result = { ...result, decision: { ...result.decision, heatAssessmentBinding: {
        assessmentId: assessment.assessmentId,
        sourceFingerprint: assessment.sourceFingerprint,
        publicationId: assessment.publicationId,
        publicationDigest: assessment.publicationDigest,
      } } };
    }
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
