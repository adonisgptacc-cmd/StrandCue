import { z } from 'zod';

import {
  CueCheckGoalSchema,
  CueCheckInputSchema,
  CueCheckTimestampSchema,
  CueCheckTimingSchema,
  deepFreeze,
} from '../../../packages/domain/src/index';
import { supabase } from './client';
import { CueCheckError, mapServerMessage, type CueCheckErrorCode } from './cue-check-errors';

/**
 * Owner-scoped client boundary for private Cue Checks (CC-01..CC-03).
 *
 * The caller supplies only the owner's own words and the identifiers of the
 * record they are acting on. The owner, the recommendation run, the goal, the
 * lifecycle, the confirmed steps, the execution status and every timestamp
 * are derived by the server from the trusted stored execution; strict command
 * schemas reject any attempt to send them. Every response is parsed through
 * strict schemas, so an unexpected shape fails closed instead of being
 * trusted. Notes and explicit `unknown` answers are passed through exactly as
 * recorded and nothing here interprets, summarizes or promotes an
 * observation. Only the five Cue Check RPCs are called; the tables are never
 * read or written directly.
 */

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(500);
const expectedRevision = z.number().int().positive();

export const CueCheckCursorSchema = z
  .object({ receivedAt: CueCheckTimestampSchema, id: uuid })
  .strict();
export type CueCheckCursor = z.output<typeof CueCheckCursorSchema>;

const RecordCueCheckCommandSchema = z
  .object({ operationId: uuid, executionId: uuid, observation: CueCheckInputSchema })
  .strict();

const CorrectCueCheckCommandSchema = z
  .object({
    operationId: uuid,
    recordId: uuid,
    expectedRevision,
    observation: CueCheckInputSchema,
    reason,
  })
  .strict();

const VoidCueCheckCommandSchema = z
  .object({ operationId: uuid, recordId: uuid, expectedRevision, reason })
  .strict();

const ListCueChecksQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    cursor: CueCheckCursorSchema.nullable().optional(),
  })
  .strict();

/** One server-confirmed step, copied from the trusted execution. */
const ConfirmedStepSchema = z
  .object({
    stepId: z.string().min(1),
    position: z.number().int().positive(),
    confirmedAt: CueCheckTimestampSchema,
    action: z.string(),
    productId: z.string().nullable(),
    productVersionId: z.string().nullable(),
    toolId: z.string().nullable(),
    toolVersionId: z.string().nullable(),
  })
  .strict();

/**
 * One stored Cue Check as the server returns it to its owner. Separate from
 * the domain's input schema: it carries the server-derived bindings and
 * receipt timestamps a client may never supply.
 */
const receiptShape = {
  recordId: uuid,
  executionId: uuid,
  recommendationRunId: uuid,
  goal: CueCheckGoalSchema,
  timing: CueCheckTimingSchema,
  lifecycle: z.enum(['active', 'voided']),
  revision: z.number().int().positive(),
  observedAt: CueCheckTimestampSchema,
  receivedAt: CueCheckTimestampSchema,
  observation: CueCheckInputSchema,
  confirmedSteps: z.array(ConfirmedStepSchema),
  executionStatus: z.enum(['completed', 'abandoned']),
  createdAt: CueCheckTimestampSchema,
  updatedAt: CueCheckTimestampSchema,
} as const;

/**
 * The top-level facts are projections of the stored observation; a
 * disagreement means the response cannot be trusted.
 */
function refineReceipt(
  record: { observedAt: string; receivedAt: string; timing: string; observation: { observedAt: string; timing: string } },
  context: z.RefinementCtx,
): void {
  if (record.observedAt !== record.observation.observedAt || record.timing !== record.observation.timing) {
    context.addIssue({ code: 'custom', path: [], message: 'Receipt disagrees with its observation' });
  }
  if (Date.parse(record.observedAt) > Date.parse(record.receivedAt)) {
    context.addIssue({ code: 'custom', path: ['receivedAt'], message: 'Receipt predates its observation' });
  }
}

/**
 * One stored Cue Check as the server returns it to its owner. Separate from
 * the domain's input schema: it carries the server-derived bindings and
 * receipt timestamps a client may never supply.
 */
export const CueCheckReceiptSchema = z
  .object(receiptShape)
  .strict()
  .superRefine(refineReceipt)
  .transform(deepFreeze);
export type CueCheckReceipt = z.output<typeof CueCheckReceiptSchema>;

const revisionState = z.enum(['active', 'voided', 'corrected']).nullable();

const CreateRevisionSchema = z
  .object({
    revisionId: uuid,
    sequence: z.literal(1),
    kind: z.literal('create'),
    observation: CueCheckInputSchema,
    correctsId: z.null(),
    correctionReason: z.null(),
    voidReason: z.null(),
    receivedAt: CueCheckTimestampSchema,
    state: revisionState,
  })
  .strict();

const CorrectRevisionSchema = z
  .object({
    revisionId: uuid,
    sequence: z.number().int().min(2),
    kind: z.literal('correct'),
    observation: CueCheckInputSchema,
    correctsId: uuid,
    correctionReason: reason,
    voidReason: z.null(),
    receivedAt: CueCheckTimestampSchema,
    state: revisionState,
  })
  .strict();

/** A void is an audit event; it never carries answers. */
const VoidRevisionSchema = z
  .object({
    revisionId: uuid,
    sequence: z.number().int().min(2),
    kind: z.literal('void'),
    observation: z.null(),
    correctsId: uuid,
    correctionReason: z.null(),
    voidReason: reason,
    receivedAt: CueCheckTimestampSchema,
    state: z.null(),
  })
  .strict();

export const CueCheckRevisionEntrySchema = z.discriminatedUnion('kind', [
  CreateRevisionSchema,
  CorrectRevisionSchema,
  VoidRevisionSchema,
]);

/** The receipt plus its append-only history, checked as one coherent whole. */
export const CueCheckDetailSchema = z
  .object({ ...receiptShape, revisions: z.array(CueCheckRevisionEntrySchema).min(1) })
  .strict()
  .superRefine(refineReceipt)
  .superRefine((detail, context) => {
    const fail = (message: string) => context.addIssue({ code: 'custom', path: ['revisions'], message });
    const { revisions } = detail;
    if (revisions.some((revision, index) => revision.sequence !== index + 1)) {
      fail('Revision sequences must be contiguous from one');
    }
    if (new Set(revisions.map(revision => revision.revisionId)).size !== revisions.length) {
      fail('Revision identities must be unique');
    }
    if (revisions.some((revision, index) => (revision.kind === 'create') !== (index === 0))) {
      fail('A history has exactly one create revision, first');
    }
    if (revisions.some((revision, index) => index > 0 && 'correctsId' in revision && revision.correctsId !== revisions[index - 1]?.revisionId)) {
      fail('A correction or void must follow the revision before it');
    }
    const head = revisions[revisions.length - 1];
    if (head === undefined || head.sequence !== detail.revision) {
      fail('The head revision must match the record revision');
    }
    if ((detail.lifecycle === 'voided') !== (head?.kind === 'void')) {
      fail('The record lifecycle must match its head revision');
    }
  });
export type CueCheckDetail = z.output<typeof CueCheckDetailSchema>;

const CueCheckPageSchema = z
  .object({ items: z.array(CueCheckReceiptSchema), nextCursor: CueCheckCursorSchema.nullable() })
  .strict()
  .superRefine((page, context) => {
    const ids = page.items.map(item => item.recordId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'A page lists each record once' });
    }
  });
export type CueCheckPage = z.output<typeof CueCheckPageSchema>;

export type RecordCueCheckCommand = z.input<typeof RecordCueCheckCommandSchema>;
export type CorrectCueCheckCommand = z.input<typeof CorrectCueCheckCommandSchema>;
export type VoidCueCheckCommand = z.input<typeof VoidCueCheckCommandSchema>;
export type ListCueChecksQuery = z.input<typeof ListCueChecksQuerySchema>;

/** The five calls the state controller needs; injected so state stays network-free. */
export interface CueCheckApi {
  readonly recordCueCheck: (command: unknown) => Promise<CueCheckReceipt>;
  readonly correctCueCheck: (command: unknown) => Promise<CueCheckReceipt>;
  readonly voidCueCheck: (command: unknown) => Promise<CueCheckReceipt>;
  readonly listCueChecks: (query: unknown) => Promise<CueCheckPage>;
  readonly getCueCheck: (recordId: unknown) => Promise<CueCheckDetail>;
}

function parseRequest<T extends z.ZodType>(
  schema: T,
  value: unknown,
  fallback: CueCheckErrorCode,
  byField: Readonly<Record<string, CueCheckErrorCode>> = {},
): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  throw new CueCheckError((typeof field === 'string' ? byField[field] : undefined) ?? fallback);
}

const MUTATION_FIELDS = { observation: 'invalid-observation', reason: 'invalid-reason' } as const;
const LIST_FIELDS = { cursor: 'invalid-cursor', limit: 'invalid-page' } as const;

/**
 * Call one RPC and parse its answer. A thrown transport failure or a
 * database error is mapped to stable copy; a payload that does not match the
 * strict schema is `malformed-response`. No server text, payload or
 * identifier is ever attached to the thrown error.
 */
async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
  parse: (data: unknown) => T,
): Promise<T> {
  if (!supabase) throw new CueCheckError('unavailable');
  let response: { data: unknown; error: { message?: unknown } | null };
  try {
    response = await supabase.rpc(name, args);
  } catch (thrown) {
    throw new CueCheckError(mapServerMessage(thrown instanceof Error ? thrown.message : undefined));
  }
  if (response.error) throw new CueCheckError(mapServerMessage(response.error.message));
  try {
    return parse(response.data);
  } catch {
    throw new CueCheckError('malformed-response');
  }
}

export async function recordCueCheck(command: unknown): Promise<CueCheckReceipt> {
  const parsed = parseRequest(RecordCueCheckCommandSchema, command, 'invalid-operation', MUTATION_FIELDS);
  return callRpc(
    'record_cue_check',
    { p_operation_id: parsed.operationId, p_execution_id: parsed.executionId, p_observation: parsed.observation },
    data => CueCheckReceiptSchema.parse(data),
  );
}

export async function correctCueCheck(command: unknown): Promise<CueCheckReceipt> {
  const parsed = parseRequest(CorrectCueCheckCommandSchema, command, 'invalid-operation', MUTATION_FIELDS);
  return callRpc(
    'correct_cue_check',
    {
      p_operation_id: parsed.operationId,
      p_record_id: parsed.recordId,
      p_expected_revision: parsed.expectedRevision,
      p_observation: parsed.observation,
      p_reason: parsed.reason,
    },
    data => CueCheckReceiptSchema.parse(data),
  );
}

export async function voidCueCheck(command: unknown): Promise<CueCheckReceipt> {
  const parsed = parseRequest(VoidCueCheckCommandSchema, command, 'invalid-operation', MUTATION_FIELDS);
  return callRpc(
    'void_cue_check',
    {
      p_operation_id: parsed.operationId,
      p_record_id: parsed.recordId,
      p_expected_revision: parsed.expectedRevision,
      p_reason: parsed.reason,
    },
    data => CueCheckReceiptSchema.parse(data),
  );
}

export async function listCueChecks(query: unknown): Promise<CueCheckPage> {
  const parsed = parseRequest(ListCueChecksQuerySchema, query, 'invalid-page', LIST_FIELDS);
  return callRpc('list_cue_checks', { p_limit: parsed.limit, p_cursor: parsed.cursor ?? null }, data => {
    const page = CueCheckPageSchema.parse(data);
    if (page.items.length > parsed.limit) throw new RangeError('page larger than requested');
    return deepFreeze(page);
  });
}

export async function getCueCheck(recordId: unknown): Promise<CueCheckDetail> {
  const id = parseRequest(uuid, recordId, 'invalid-operation');
  return callRpc('get_cue_check', { p_record_id: id }, data => {
    const detail = CueCheckDetailSchema.parse(data);
    if (detail.recordId !== id) throw new RangeError('detail for a different record');
    return deepFreeze(detail);
  });
}
