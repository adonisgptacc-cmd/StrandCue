import { z } from 'zod';

import {
  CorrectServiceCommandSchema,
  CreateServiceCommandSchema,
  EffectiveDateSchema,
  ObserveServiceCommandSchema,
  ServiceFactsSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

const ServiceIdSchema = z.string().uuid();
const RecordedAtSchema = z.iso.datetime({ offset: true, precision: 6 })
  .refine(value => value.endsWith('Z'), 'Expected a UTC timestamp');
const EffectStatusSchema = z.enum(['present', 'not-present', 'unknown']);
const ObservationSourceSchema = z.enum(['user-reported', 'user-estimated']);

export const ServiceObservationRecordSchema = z.object({
  id: ServiceIdSchema,
  serviceId: ServiceIdSchema,
  observedOn: EffectiveDateSchema,
  effectStatus: EffectStatusSchema,
  source: ObservationSourceSchema,
  recordedAt: RecordedAtSchema,
}).strict();

export const ServiceRevisionSchema = z.object({
  id: ServiceIdSchema,
  serviceId: ServiceIdSchema,
  sequence: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative(),
  kind: z.enum(['baseline', 'correction']),
  facts: ServiceFactsSchema,
  correctsId: ServiceIdSchema.nullable(),
  reason: z.string().nullable(),
  recordedAt: RecordedAtSchema,
}).strict().superRefine((revision, context) => {
  const hasCorrectionMetadata = revision.correctsId !== null && revision.reason !== null;
  if (revision.kind === 'baseline' && (revision.correctsId !== null || revision.reason !== null)) {
    context.addIssue({ code: 'custom', message: 'Baseline revisions cannot include correction metadata' });
  }
  if (revision.kind === 'correction' && !hasCorrectionMetadata) {
    context.addIssue({ code: 'custom', message: 'Correction revisions require correction metadata' });
  }
});

export const ServiceSummarySchema = z.object({
  serviceId: ServiceIdSchema,
  revision: z.number().int().positive(),
  revisionId: ServiceIdSchema,
  facts: ServiceFactsSchema,
  currentObservation: ServiceObservationRecordSchema.nullable(),
  currentPresence: EffectStatusSchema,
}).strict();

export const ServiceDetailSchema = ServiceSummarySchema.extend({
  revisions: z.array(ServiceRevisionSchema),
  observations: z.array(ServiceObservationRecordSchema),
}).strict();

export const ServiceCursorSchema = z.object({
  asOf: z.iso.date(),
  effectiveStart: z.iso.date(),
  recordedAt: RecordedAtSchema,
  serviceId: ServiceIdSchema,
}).strict();

export const ServiceListSchema = z.object({
  items: z.array(ServiceSummarySchema).max(100),
  nextCursor: ServiceCursorSchema.nullable(),
}).strict();

const ServiceMutationReceiptSchema = z.object({
  serviceId: ServiceIdSchema,
  revision: z.number().int().positive(),
  revisionId: ServiceIdSchema,
}).strict();

const ServiceObservationReceiptSchema = ServiceMutationReceiptSchema.extend({
  observationId: ServiceIdSchema,
}).strict();

const ListServicesRequestSchema = z.object({
  asOf: z.iso.date(),
  limit: z.number().int().min(1).max(100),
  cursor: ServiceCursorSchema.nullable(),
}).strict();

export type ServiceObservationRecord = z.output<typeof ServiceObservationRecordSchema>;
export type ServiceRevision = z.output<typeof ServiceRevisionSchema>;
export type ServiceSummary = z.output<typeof ServiceSummarySchema>;
export type ServiceDetail = z.output<typeof ServiceDetailSchema>;
export type ServiceCursor = z.output<typeof ServiceCursorSchema>;
export type ServiceList = z.output<typeof ServiceListSchema>;
export type ServiceMutationReceipt = z.output<typeof ServiceMutationReceiptSchema>;
export type ServiceObservationReceipt = z.output<typeof ServiceObservationReceiptSchema>;

type LoadServicesOptions = Readonly<{ limit?: number; cursor?: ServiceCursor | null }>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Chemical services are unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function loadServices(asOf: string, options: LoadServicesOptions = {}): Promise<ServiceList> {
  const request = ListServicesRequestSchema.parse({
    asOf,
    limit: options.limit ?? 25,
    cursor: options.cursor ?? null,
  });
  const data = await callRpc('list_services', {
    p_as_of: request.asOf,
    p_limit: request.limit,
    p_cursor: request.cursor,
  });
  return ServiceListSchema.parse(data);
}

export async function loadService(serviceId: string): Promise<ServiceDetail | null> {
  const parsedServiceId = ServiceIdSchema.parse(serviceId);
  const data = await callRpc('get_service', {
    p_service_id: parsedServiceId,
    p_include_audit: true,
  });
  return ServiceDetailSchema.nullable().parse(data);
}

export async function recordService(command: unknown): Promise<ServiceMutationReceipt> {
  const parsed = CreateServiceCommandSchema.parse(command);
  const data = await callRpc('record_service', {
    p_operation_id: parsed.operationId,
    p_service_id: parsed.serviceId,
    p_facts: parsed.facts,
    p_initial_observation: parsed.initialObservation ?? null,
  });
  return ServiceMutationReceiptSchema.parse(data);
}

export async function correctService(command: unknown): Promise<ServiceMutationReceipt> {
  const parsed = CorrectServiceCommandSchema.parse(command);
  const data = await callRpc('correct_service', {
    p_operation_id: parsed.operationId,
    p_service_id: parsed.serviceId,
    p_expected_revision: parsed.expectedRevision,
    p_corrects_id: parsed.correctsId,
    p_reason: parsed.reason,
    p_facts: parsed.facts,
  });
  return ServiceMutationReceiptSchema.parse(data);
}

export async function observeService(command: unknown): Promise<ServiceObservationReceipt> {
  const parsed = ObserveServiceCommandSchema.parse(command);
  const data = await callRpc('observe_service', {
    p_operation_id: parsed.operationId,
    p_service_id: parsed.serviceId,
    p_observed_on: parsed.observation.observedOn,
    p_effect_status: parsed.observation.effectStatus,
  });
  return ServiceObservationReceiptSchema.parse(data);
}
