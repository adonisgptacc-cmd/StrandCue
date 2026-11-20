import { z } from 'zod';

import {
  GuidanceActivityCursorSchema,
  GuidanceActivityHistoryPageSchema,
  type GuidanceActivityCursor,
  type GuidanceActivityHistoryPage,
} from '../../../../packages/domain/src/guidance/index.ts';
import { supabase } from '../client';

const RequestSchema = z.object({
  effectiveAsOf: z.iso.date(),
  recordedAsOf: z.iso.datetime({ offset: true }),
  limit: z.number().int().positive(),
  cursor: GuidanceActivityCursorSchema.nullable(),
}).strict();

const OptionsSchema = z.object({
  limit: z.number().int().positive().optional(),
  cursor: GuidanceActivityCursorSchema.nullable().optional(),
}).strict();

export async function listGuidanceActivityHistories(
  effectiveAsOf: string,
  recordedAsOf: string,
  options: { limit?: number; cursor?: GuidanceActivityCursor | null } = {},
): Promise<GuidanceActivityHistoryPage> {
  const parsedOptions = OptionsSchema.parse(options);
  const request = RequestSchema.parse({
    effectiveAsOf,
    recordedAsOf,
    limit: parsedOptions.limit ?? 100,
    cursor: parsedOptions.cursor ?? null,
  });
  if (!supabase) throw new Error('Activities are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('list_guidance_activity_histories', {
    p_effective_as_of: request.effectiveAsOf,
    p_recorded_as_of: request.recordedAsOf,
    p_limit: Math.min(request.limit, 100),
    p_cursor: request.cursor,
  });
  if (error) throw error;
  return GuidanceActivityHistoryPageSchema.parse(data);
}
