import { z } from 'zod';
import { EngineDecisionSchema, EngineInputSchema } from '../contracts.ts';

/**
 * A historical decision together with the exact canonical input and the pinned
 * ruleset that produced it.
 *
 * A replay case is read-only evidence. A replay run never rewrites the stored
 * input or the stored decision; it only produces a separate comparison report.
 */
export const ReplayCaseSchema = z.object({
  caseId: z.string().min(1),
  input: EngineInputSchema,
  decision: EngineDecisionSchema,
}).strict().readonly();

export type ReplayCase = z.infer<typeof ReplayCaseSchema>;
