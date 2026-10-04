import { z } from 'zod';

import { supabase } from './client';

export const ConsentPurposeSchema = z.enum([
  'hair_passport_processing',
  'marketing_email',
  'community_outcomes',
  'product_analytics',
]);
export type ConsentPurpose = z.output<typeof ConsentPurposeSchema>;

export const optionalPurposes = ['marketing_email', 'community_outcomes', 'product_analytics'] as const satisfies readonly ConsentPurpose[];

const ConsentReceiptSchema = z.object({
  purpose: ConsentPurposeSchema,
  granted: z.boolean(),
  recordedAt: z.iso.datetime({ offset: true }),
}).strict();

const ConsentListSchema = z.object({
  hair_passport_processing: z.boolean().optional(),
  marketing_email: z.boolean().optional(),
  community_outcomes: z.boolean().optional(),
  product_analytics: z.boolean().optional(),
}).strict();

export type ConsentReceipt = z.output<typeof ConsentReceiptSchema>;
export type ConsentList = z.output<typeof ConsentListSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Consent is unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function setConsent(operationId: string, purpose: ConsentPurpose, granted: boolean): Promise<ConsentReceipt> {
  const request = z.object({
    operationId: z.string().uuid(),
    purpose: ConsentPurposeSchema,
    granted: z.boolean(),
  }).strict().parse({ operationId, purpose, granted });
  const data = await callRpc('consent_set', {
    p_operation_id: request.operationId,
    p_purpose: request.purpose,
    p_granted: request.granted,
  });
  return ConsentReceiptSchema.parse(data);
}

export async function listConsents(): Promise<ConsentList> {
  const data = await callRpc('consent_list', {});
  return ConsentListSchema.parse(data);
}

export function consentPurposeLabel(purpose: ConsentPurpose): string {
  switch (purpose) {
    case 'hair_passport_processing': return 'Hair record processing (required)';
    case 'marketing_email': return 'Product updates by email (optional)';
    case 'community_outcomes': return 'Anonymous community outcomes (optional)';
    case 'product_analytics': return 'Anonymous usage analytics (optional)';
  }
}

export function consentErrorMessage(message: string): string {
  if (message.includes('required-purpose')) return 'Hair record processing is required while your account exists. To stop it, delete your account instead.';
  if (message.includes('unknown-purpose')) return 'That consent option is not recognised. Reload settings and try again.';
  return 'Consent could not be saved. Check your connection and try again.';
}
