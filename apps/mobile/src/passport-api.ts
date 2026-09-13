import { z } from 'zod';
import { PassportRevisionSchema, type HistoryProjection } from '../../../packages/domain/src/index';
import { supabase } from './client';

export type PassportRecord = { passportId: string; revision: number; projection: HistoryProjection; revisions: z.output<typeof PassportRevisionSchema>[] };
const recordSchema = z.object({passportId: z.string().uuid(), revision: z.number().int().nonnegative(), projection: z.object({
  asOf: z.string(), values: z.record(z.string(), z.unknown()), ambiguousFields: z.record(z.string(), z.unknown()),
  appliedRevisionIds: z.array(z.string()), supersededRevisionIds: z.array(z.string()),
}), revisions: z.array(PassportRevisionSchema)});
export async function loadPassport(asOf?: string): Promise<PassportRecord | null> {
  const {data, error} = await supabase!.rpc('get_passport', asOf ? {p_as_of: asOf} : {});
  if (error) throw error;
  return data === null ? null : recordSchema.parse(data) as PassportRecord;
}
export type SaveCommand = {
  p_operation_id: string; p_expected_revision: number; p_kind: 'baseline'|'change'|'correction';
  p_effective_date: {precision: string; value: string|null}; p_patch: Record<string, unknown>;
  p_corrects_id?: string; p_correction_reason?: string;
};
export async function savePassport(command: SaveCommand) {
  const {error} = await supabase!.rpc('mutate_passport', command);
  if (error) throw error;
}
