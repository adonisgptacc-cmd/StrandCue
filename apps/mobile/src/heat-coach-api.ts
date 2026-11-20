import { z } from 'zod';

import { HeatCoachDecisionSchema, HeatCoachInputSchema, HeatCoachStateSchema } from '../../../packages/domain/src/heat-coach';
import { ZoneSchema } from '../../../packages/domain/src/activity';
import { CurrentConditionConcernSchema, CurrentConditionZoneSchema } from '../../../packages/domain/src/current-condition';
import { ToolSettingTemperatureSchema } from '../../../packages/domain/src/tools';
import { supabase } from './client';
import { HeatCoachError, mapHeatCoachServerMessage } from './heat-coach-errors';

const uuid = z.string().uuid();
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const instant = z.iso.datetime({ offset: true });
const condition = z.object({
  observedAt: instant,
  concerns: z.array(CurrentConditionConcernSchema).min(1).max(15),
  explicitNone: z.boolean(),
  zones: z.array(CurrentConditionZoneSchema).max(36),
  zoneConcerns: z.array(z.object({
    zone: CurrentConditionZoneSchema,
    concerns: z.array(CurrentConditionConcernSchema).min(1).max(15),
  }).strict()).max(36),
}).strict().superRefine((value, context) => {
  const concerns = new Set(value.concerns);
  if (concerns.size !== value.concerns.length || value.explicitNone !== (value.concerns.length === 1 && value.concerns[0] === 'none')
    || (concerns.has('none') || concerns.has('unknown')) && value.concerns.length !== 1) {
    context.addIssue({ code: 'custom', path: ['concerns'], message: 'Contradictory concerns' });
  }
  const zoneKey = (zone: { region: string; segment: string }) => `${zone.region}:${zone.segment}`;
  const zones = new Set(value.zones.map(zoneKey));
  if (zones.size !== value.zones.length) context.addIssue({ code: 'custom', path: ['zones'], message: 'Duplicate zones' });
  const attached = new Set<string>();
  for (const entry of value.zoneConcerns) {
    const key = zoneKey(entry.zone);
    if (!zones.has(key) || attached.has(key) || new Set(entry.concerns).size !== entry.concerns.length
      || entry.concerns.some(concern => concern === 'none' || concern === 'unknown' || !concerns.has(concern))) {
      context.addIssue({ code: 'custom', path: ['zoneConcerns'], message: 'Unmatched zone concerns' });
    }
    attached.add(key);
  }
});
const knownUnknown = <T extends z.ZodType>(value: T) => z.discriminatedUnion('state', [
  z.object({ state: z.literal('known'), value }).strict(),
  z.object({ state: z.literal('unknown') }).strict(),
]);
const intent = z.object({
  method: knownUnknown(z.enum(['direct-contact', 'heated-air', 'hooded', 'steam', 'unheated'])),
  toolOwnerItemId: uuid.nullable().optional(),
  productOwnerItemId: uuid.nullable().optional(),
  temperature: knownUnknown(ToolSettingTemperatureSchema),
  setting: knownUnknown(z.string().min(1).max(60).refine(value => value.trim().length > 0)),
  passes: knownUnknown(z.number().int().min(0).max(100)),
  durationMinutes: knownUnknown(z.number().int().min(0).max(1440)),
  zones: z.array(ZoneSchema.strict()).max(36),
  availableMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  currentCondition: condition.nullable().optional(),
}).strict();
const createCommand = z.object({ operationId: uuid, publicationId: uuid, publicationDigest: digest, intent }).strict();
const cursor = z.object({ createdAt: instant, assessmentId: uuid }).strict();
const listQuery = z.object({ limit: z.number().int().min(1).max(100), cursor: cursor.nullable().optional() }).strict();
const revisionRow = z.object({ id: uuid, revision: z.number().int().nonnegative() }).strict();
const versionRow = revisionRow.extend({ versionId: uuid.nullable() }).strict();
const sourceRevisions = z.object({
  passport: z.object({ revision: z.number().int().nonnegative(), passportId: uuid }).strict().nullable(),
  services: z.array(revisionRow), products: z.array(versionRow),
  tools: z.array(versionRow), activities: z.array(revisionRow),
}).strict();

export const HeatCoachReceiptSchema = z.object({
  assessmentId: uuid, publicationId: uuid, publicationDigest: digest,
  input: HeatCoachInputSchema, result: HeatCoachDecisionSchema,
  status: HeatCoachStateSchema, sourceRevisions, sourceFingerprint: digest,
  createdAt: instant, revision: z.literal(1), stale: z.boolean(),
}).strict().refine(row => row.status === row.result.state);
export const HeatCoachPageSchema = z.object({ items: z.array(HeatCoachReceiptSchema), nextCursor: cursor.nullable() }).strict()
  .superRefine((page, context) => {
    const keys = page.items.map(item => `${item.createdAt}:${item.assessmentId}`);
    if (new Set(page.items.map(item => item.assessmentId)).size !== page.items.length
      || keys.some((key, index) => index > 0 && key >= keys[index - 1]!)
      || (page.nextCursor !== null && (page.items.length === 0
        || page.nextCursor.createdAt !== page.items.at(-1)!.createdAt
        || page.nextCursor.assessmentId !== page.items.at(-1)!.assessmentId))) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Invalid assessment page order' });
    }
  });
export type HeatCoachReceipt = z.output<typeof HeatCoachReceiptSchema>;
export type HeatCoachPage = z.output<typeof HeatCoachPageSchema>;
export type HeatCoachIntent = z.output<typeof intent>;
export const HeatCoachPublicationIdentitySchema = z.object({
  publicationId: uuid, publicationDigest: digest,
}).strict();
export type HeatCoachPublicationIdentity = z.output<typeof HeatCoachPublicationIdentitySchema>;
export const HeatCoachReviewedCopySchema = z.object({
  assessmentId: uuid, publicationId: uuid, publicationDigest: digest,
  copy: z.array(z.object({
    copyKey: z.string().regex(/^heat\.[a-z0-9_.-]{1,100}$/u),
    text: z.string().min(1).refine(value => value.trim().length > 0),
  }).strict()),
}).strict().superRefine((value, context) => {
  if (value.copy.some((row, index) => index > 0 && row.copyKey <= value.copy[index - 1]!.copyKey)) {
    context.addIssue({ code: 'custom', path: ['copy'], message: 'Copy keys must be unique and ordered' });
  }
});
export type HeatCoachReviewedCopy = z.output<typeof HeatCoachReviewedCopySchema>;

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  if (!supabase) throw new HeatCoachError('unavailable');
  let response: unknown;
  try { response = await supabase.rpc(name, args); }
  catch (error) { throw new HeatCoachError(mapHeatCoachServerMessage(error instanceof Error ? error.message : undefined)); }
  if (typeof response !== 'object' || response === null || !('data' in response) || !('error' in response)) {
    throw new HeatCoachError('malformed-response');
  }
  if (response.error) {
    const message = typeof response.error === 'object' && response.error !== null && 'message' in response.error
      ? response.error.message : undefined;
    throw new HeatCoachError(mapHeatCoachServerMessage(message));
  }
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) throw new HeatCoachError('malformed-response');
  return parsed.data;
}

export function createHeatCoachAssessment(value: unknown): Promise<HeatCoachReceipt> {
  const parsed = createCommand.safeParse(value);
  if (!parsed.success) return Promise.reject(new HeatCoachError('invalid-heat-intent'));
  const { operationId, publicationId, publicationDigest, intent: request } = parsed.data;
  return call('create_heat_coach_assessment', {
    p_operation_id: operationId, p_publication_id: publicationId,
    p_publication_digest: publicationDigest, p_intent: request,
  }, HeatCoachReceiptSchema);
}

export function getCurrentHeatCoachPublication(): Promise<HeatCoachPublicationIdentity | null> {
  return call('get_current_heat_coach_publication', {}, HeatCoachPublicationIdentitySchema.nullable());
}

export function getHeatCoachAssessment(value: unknown): Promise<HeatCoachReceipt> {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) return Promise.reject(new HeatCoachError('assessment-not-found'));
  return call('get_heat_coach_assessment', { p_id: parsed.data }, HeatCoachReceiptSchema);
}

export function listHeatCoachAssessments(value: unknown): Promise<HeatCoachPage> {
  const parsed = listQuery.safeParse(value);
  if (!parsed.success) return Promise.reject(new HeatCoachError('invalid-page'));
  return call('list_heat_coach_assessments', {
    p_limit: parsed.data.limit, p_cursor: parsed.data.cursor ?? null,
  }, HeatCoachPageSchema);
}

export async function getHeatCoachReviewedCopy(receipt: HeatCoachReceipt): Promise<HeatCoachReviewedCopy> {
  const response = await call('get_heat_coach_reviewed_copy', {
    p_assessment_id: receipt.assessmentId, p_publication_id: receipt.publicationId,
    p_publication_digest: receipt.publicationDigest,
  }, HeatCoachReviewedCopySchema);
  if (response.assessmentId !== receipt.assessmentId || response.publicationId !== receipt.publicationId
    || response.publicationDigest !== receipt.publicationDigest) throw new HeatCoachError('publication-mismatch');
  return response;
}
