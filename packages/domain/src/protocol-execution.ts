/**
 * Protocol execution and deviation contracts (TD-05–TD-08).
 *
 * An execution records what actually happened while following one immutable
 * recommendation run. It references that run by ID (`recommendationRunId`)
 * and copies the run's stable step identities (`stepId`, `position`) plus
 * the planned step content into its own steps. The stored decision is never
 * rewritten, mutated, or reinterpreted: starting an execution deep-copies
 * the steps, and every transition builds new frozen objects.
 *
 * The module is deliberately history-only. Starting, viewing, or generating
 * records emits no activity, wash, or heat events, and this module imports
 * none of those writers. Confirmed step actions are execution history, not
 * new observations.
 *
 * All transition functions are pure and immutable: they never mutate their
 * inputs and never read the wall clock. Every timestamp is injected by the
 * caller (`startedAt`, `at`).
 */

import { z } from 'zod';

import type { ProtocolDecision } from './recommendations/index.ts';

const nonEmptyString = z.string().trim().min(1);
const uuidString = z.string().uuid();

const IsoOffsetTimestampSchema = z.iso.datetime({ offset: true });

/**
 * Deep-freeze helper, mirroring the current-condition and guidance schema
 * conventions. Executions cross module boundaries into stored history, so a
 * parsed or transitioned value must not be mutable in place.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

function frozen<S extends z.ZodType>(schema: S): S {
  return schema.transform(value => deepFreeze(value)) as unknown as S;
}

export const ExecutionStatusSchema = z.enum(['in_progress', 'paused', 'completed', 'abandoned']);

export type ExecutionStatus = z.output<typeof ExecutionStatusSchema>;

export const ExecutionStepStateSchema = z.enum([
  'pending',
  'confirmed',
  'skipped',
  'substituted',
  'modified',
]);

export type ExecutionStepState = z.output<typeof ExecutionStepStateSchema>;

/**
 * The copied plan reference for one step. `stepId` and `position` are the
 * stable identities taken from the recommendation run; the remaining fields
 * are the planned content as decided, kept so a later substitution or
 * modification can never obscure what the plan originally said.
 */
export const PlannedStepSchema = z
  .object({
    stepId: nonEmptyString,
    position: z.number().int().positive(),
    action: nonEmptyString,
    productId: nonEmptyString.nullable(),
    productVersionId: nonEmptyString.nullable(),
    toolId: nonEmptyString.nullable(),
    toolVersionId: nonEmptyString.nullable(),
    waitSeconds: z.number().int().nonnegative().nullable(),
    rinse: z.boolean().nullable(),
    reasons: z.array(nonEmptyString),
  })
  .strict();

export type PlannedStep = z.output<typeof PlannedStepSchema>;

/**
 * What the client may name for a substitution: one owned shelf-item id
 * (user_products.id). Free-form product/version ids plus self-asserted
 * `owned: true` are rejected at parse time — ownership is verified
 * server-side at command time, never claimed by the caller (SC-004).
 */
export const ShelfItemReferenceSchema = z
  .object({
    shelfItemId: uuidString,
  })
  .strict();

export type ShelfItemReference = z.output<typeof ShelfItemReferenceSchema>;

/**
 * What the server persists for a verified substitution: the shelf item plus
 * the catalogue identities resolved from it at command time. `owned: true`
 * here is verified proof from the owner-shelf lookup, never a
 * carried-through caller claim. `availability` records the availability the
 * shelf row actually holds — `available`, `low`, `empty` or the legacy
 * `out_of_stock`; archived items never reach this shape.
 */
export const VerifiedSubstituteReplacementSchema = z
  .object({
    shelfItemId: uuidString,
    productId: nonEmptyString,
    productVersionId: nonEmptyString,
    availability: z.enum(['available', 'low', 'empty', 'out_of_stock']),
    owned: z.literal(true),
  })
  .strict();

export type VerifiedSubstituteReplacement = z.output<typeof VerifiedSubstituteReplacementSchema>;

const SkipDeviationSchema = z
  .object({
    kind: z.literal('skip'),
    reason: nonEmptyString,
  })
  .strict();

const SubstituteDeviationSchema = z
  .object({
    kind: z.literal('substitute'),
    reason: nonEmptyString,
    // The optimistic preview carries only the shelf-item reference; the
    // server persists the verified shape. Both parse so previews validate.
    replacement: z.union([ShelfItemReferenceSchema, VerifiedSubstituteReplacementSchema]),
  })
  .strict();

const ModifyDeviationSchema = z
  .object({
    kind: z.literal('modify'),
    reason: nonEmptyString,
    detail: nonEmptyString,
  })
  .strict();

export const ExecutionDeviationSchema = z.discriminatedUnion('kind', [
  SkipDeviationSchema,
  SubstituteDeviationSchema,
  ModifyDeviationSchema,
]);

export type ExecutionDeviation = z.output<typeof ExecutionDeviationSchema>;

export const ExecutionStepSchema = z
  .object({
    stepId: nonEmptyString,
    position: z.number().int().positive(),
    planned: PlannedStepSchema,
    state: ExecutionStepStateSchema,
    confirmedAt: IsoOffsetTimestampSchema.nullable(),
    deviation: ExecutionDeviationSchema.nullable(),
  })
  .strict()
  .superRefine((step, context) => {
    if (step.stepId !== step.planned.stepId) {
      context.addIssue({
        code: 'custom',
        path: ['planned', 'stepId'],
        message: 'Execution step identity must match its copied plan reference',
      });
    }
    if (step.position !== step.planned.position) {
      context.addIssue({
        code: 'custom',
        path: ['planned', 'position'],
        message: 'Execution step position must match its copied plan reference',
      });
    }
    if (step.state === 'confirmed' && step.confirmedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedAt'],
        message: 'A confirmed step records when it was confirmed',
      });
    }
    if (step.state !== 'confirmed' && step.confirmedAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedAt'],
        message: 'Only a confirmed step carries a confirmation timestamp',
      });
    }
    const deviated = step.state === 'skipped' || step.state === 'substituted' || step.state === 'modified';
    if (deviated && step.deviation === null) {
      context.addIssue({
        code: 'custom',
        path: ['deviation'],
        message: 'A deviated step records its deviation',
      });
    }
    if (!deviated && step.deviation !== null) {
      context.addIssue({
        code: 'custom',
        path: ['deviation'],
        message: 'Only a deviated step carries a deviation record',
      });
    }
  });

export type ExecutionStep = z.output<typeof ExecutionStepSchema>;

export const ProtocolExecutionSchema = frozen(
  z
    .object({
      executionId: nonEmptyString,
      recommendationRunId: nonEmptyString,
      startedAt: IsoOffsetTimestampSchema,
      updatedAt: IsoOffsetTimestampSchema,
      status: ExecutionStatusSchema,
      steps: z.array(ExecutionStepSchema).min(1),
      finishedAt: IsoOffsetTimestampSchema.nullable(),
      closeReason: nonEmptyString.nullable(),
    })
    .strict()
    .superRefine((execution, context) => {
      const stepIds = execution.steps.map(step => step.stepId);
      if (new Set(stepIds).size !== stepIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['steps'],
          message: 'Execution steps carry each stable step identity exactly once',
        });
      }
      const finished = execution.status === 'completed' || execution.status === 'abandoned';
      if (finished && execution.finishedAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['finishedAt'],
          message: 'A finished execution records when it finished',
        });
      }
      if (!finished && execution.finishedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['finishedAt'],
          message: 'Only a finished execution carries a finish timestamp',
        });
      }
    }),
);

export type ProtocolExecution = z.output<typeof ProtocolExecutionSchema>;

const CompleteStepCommandSchema = z
  .object({
    kind: z.literal('complete-step'),
    stepId: nonEmptyString,
  })
  .strict();

const SkipStepCommandSchema = z
  .object({
    kind: z.literal('skip-step'),
    stepId: nonEmptyString,
    reason: nonEmptyString,
  })
  .strict();

const SubstituteStepCommandSchema = z
  .object({
    kind: z.literal('substitute-step'),
    stepId: nonEmptyString,
    reason: nonEmptyString,
    replacement: ShelfItemReferenceSchema,
  })
  .strict();

const ModifyStepCommandSchema = z
  .object({
    kind: z.literal('modify-step'),
    stepId: nonEmptyString,
    reason: nonEmptyString,
    detail: nonEmptyString,
  })
  .strict();

const PauseCommandSchema = z
  .object({
    kind: z.literal('pause'),
  })
  .strict();

const ResumeCommandSchema = z
  .object({
    kind: z.literal('resume'),
  })
  .strict();

const AbandonCommandSchema = z
  .object({
    kind: z.literal('abandon'),
    reason: nonEmptyString,
  })
  .strict();

const CompleteCommandSchema = z
  .object({
    kind: z.literal('complete'),
  })
  .strict();

/**
 * The plan's command list, exactly: start is `startProtocolExecution`;
 * every other command flows through `applyExecutionCommand`.
 */
export const ExecutionCommandSchema = z.discriminatedUnion('kind', [
  CompleteStepCommandSchema,
  SkipStepCommandSchema,
  SubstituteStepCommandSchema,
  ModifyStepCommandSchema,
  PauseCommandSchema,
  ResumeCommandSchema,
  AbandonCommandSchema,
  CompleteCommandSchema,
]);

export type ExecutionCommand = z.output<typeof ExecutionCommandSchema>;

export type ProtocolExecutionErrorCode =
  | 'not-ready-decision'
  | 'empty-plan'
  | 'duplicate-step-identity'
  | 'unknown-step'
  | 'step-already-resolved'
  | 'execution-not-active'
  | 'execution-terminal'
  | 'invalid-status-transition'
  | 'pending-steps-remain'
  | 'missing-timestamp';

export class ProtocolExecutionError extends Error {
  readonly code: ProtocolExecutionErrorCode;

  constructor(code: ProtocolExecutionErrorCode, message: string) {
    super(message);
    this.name = 'ProtocolExecutionError';
    this.code = code;
  }
}

/**
 * One confirmed actual event: the execution history that partial and
 * abandoned executions preserve. Only `confirmed` steps appear here — a
 * skipped, substituted, or modified step is a deviation record on its
 * `ExecutionStep`, never an implied occurrence.
 */
export const ExecutionEventSchema = frozen(
  z
    .object({
      stepId: nonEmptyString,
      position: z.number().int().positive(),
      confirmedAt: IsoOffsetTimestampSchema,
    })
    .strict(),
);

export type ExecutionEvent = z.output<typeof ExecutionEventSchema>;

export interface StartExecutionArgs {
  readonly executionId: string;
  readonly decision: ProtocolDecision;
  readonly startedAt: string;
}

export interface ApplyCommandOptions {
  /** Injected clock: every transition stamps `at` instead of reading the wall clock. */
  readonly at?: string;
}

function requireTimestamp(at: string | undefined): string {
  if (at === undefined) {
    throw new ProtocolExecutionError(
      'missing-timestamp',
      'Execution transitions require an injected timestamp (`at`); the wall clock is never read',
    );
  }
  return IsoOffsetTimestampSchema.parse(at);
}

function copyPlannedStep(step: ProtocolDecision['steps'][number]): PlannedStep {
  return PlannedStepSchema.parse({
    stepId: step.stepId,
    position: step.position,
    action: step.action,
    productId: step.productId,
    productVersionId: step.productVersionId,
    toolId: step.toolId,
    toolVersionId: step.toolVersionId,
    waitSeconds: step.waitSeconds,
    rinse: step.rinse,
    reasons: [...step.reasons],
  });
}

/**
 * Start tracking an execution against one immutable recommendation run.
 *
 * Only a `ready` decision with at least one step can be executed. The run's
 * stable step identities (`stepId`, `position`) and planned content are
 * deep-copied into the execution; the passed-in decision object is never
 * mutated. Starting records nothing beyond the execution itself.
 */
export function startProtocolExecution(args: StartExecutionArgs): ProtocolExecution {
  const executionId = nonEmptyString.parse(args.executionId);
  const startedAt = IsoOffsetTimestampSchema.parse(args.startedAt);
  if (args.decision.status !== 'ready') {
    throw new ProtocolExecutionError(
      'not-ready-decision',
      `Only a ready recommendation run can be executed, got '${args.decision.status}'`,
    );
  }
  if (args.decision.steps.length === 0) {
    throw new ProtocolExecutionError('empty-plan', 'A recommendation run without steps cannot be executed');
  }
  const seen = new Set<string>();
  for (const step of args.decision.steps) {
    const key = `${step.stepId}\u0000${step.position}`;
    if (seen.has(key)) {
      throw new ProtocolExecutionError(
        'duplicate-step-identity',
        `Recommendation run repeats stable step identity '${step.stepId}' at position ${step.position}`,
      );
    }
    seen.add(key);
  }
  return ProtocolExecutionSchema.parse({
    executionId,
    recommendationRunId: args.decision.requestId,
    startedAt,
    updatedAt: startedAt,
    status: 'in_progress',
    steps: args.decision.steps.map(step => {
      const planned = copyPlannedStep(step);
      return {
        stepId: planned.stepId,
        position: planned.position,
        planned,
        state: 'pending',
        confirmedAt: null,
        deviation: null,
      };
    }),
    finishedAt: null,
    closeReason: null,
  });
}

function findStepIndex(execution: ProtocolExecution, stepId: string): number {
  const index = execution.steps.findIndex(step => step.stepId === stepId);
  if (index === -1) {
    throw new ProtocolExecutionError(
      'unknown-step',
      `Execution '${execution.executionId}' has no step '${stepId}'`,
    );
  }
  return index;
}

function requireActiveForStep(execution: ProtocolExecution): void {
  if (execution.status === 'completed' || execution.status === 'abandoned') {
    throw new ProtocolExecutionError(
      'execution-terminal',
      `Execution '${execution.executionId}' is ${execution.status}; no further commands apply`,
    );
  }
  if (execution.status !== 'in_progress') {
    throw new ProtocolExecutionError(
      'execution-not-active',
      `Step commands apply only while in progress, not while ${execution.status}`,
    );
  }
}

function resolveStep(
  execution: ProtocolExecution,
  stepId: string,
  state: ExecutionStepState,
  confirmedAt: string | null,
  deviation: ExecutionDeviation | null,
  at: string,
): ProtocolExecution {
  requireActiveForStep(execution);
  const index = findStepIndex(execution, stepId);
  const current = execution.steps[index] as ExecutionStep;
  if (current.state !== 'pending') {
    throw new ProtocolExecutionError(
      'step-already-resolved',
      `Step '${stepId}' is already ${current.state}; a step is confirmed at most once`,
    );
  }
  const steps = execution.steps.map((step, position) =>
    position === index ? { ...step, state, confirmedAt, deviation } : step,
  );
  return ProtocolExecutionSchema.parse({ ...execution, steps, updatedAt: at });
}

/**
 * Apply one plan command to an execution, returning a new frozen execution.
 * The input execution is never mutated.
 *
 * Allowed transitions:
 * - `complete-step` / `skip-step` / `substitute-step` / `modify-step`:
 *   `in_progress` only, and only on a `pending` step.
 * - `pause`: `in_progress` → `paused`.
 * - `resume`: `paused` → `in_progress`.
 * - `abandon`: `in_progress` | `paused` → `abandoned` (history preserved).
 * - `complete`: `in_progress` → `completed`, only when no step is pending.
 *
 * `completed` and `abandoned` are terminal: every further command is
 * rejected. Confirmed step actions stay execution history only; this
 * function emits no activity, wash, or heat events.
 */
export function applyExecutionCommand(
  execution: ProtocolExecution,
  command: ExecutionCommand,
  options: ApplyCommandOptions = {},
): ProtocolExecution {
  const parsed = ExecutionCommandSchema.parse(command);
  if (execution.status === 'completed' || execution.status === 'abandoned') {
    throw new ProtocolExecutionError(
      'execution-terminal',
      `Execution '${execution.executionId}' is ${execution.status}; no further commands apply`,
    );
  }
  const at = requireTimestamp(options.at);

  switch (parsed.kind) {
    case 'complete-step':
      return resolveStep(execution, parsed.stepId, 'confirmed', at, null, at);
    case 'skip-step':
      return resolveStep(
        execution,
        parsed.stepId,
        'skipped',
        null,
        { kind: 'skip', reason: parsed.reason },
        at,
      );
    case 'substitute-step': {
      // No ownership claim here: the preview carries only the shelf-item
      // reference, and the server verifies ownership, membership, and the
      // referenced catalogue version at command time before persisting the
      // verified replacement.
      return resolveStep(
        execution,
        parsed.stepId,
        'substituted',
        null,
        {
          kind: 'substitute',
          reason: parsed.reason,
          replacement: { shelfItemId: parsed.replacement.shelfItemId },
        },
        at,
      );
    }
    case 'modify-step':
      return resolveStep(
        execution,
        parsed.stepId,
        'modified',
        null,
        { kind: 'modify', reason: parsed.reason, detail: parsed.detail },
        at,
      );
    case 'pause': {
      if (execution.status !== 'in_progress') {
        throw new ProtocolExecutionError(
          'invalid-status-transition',
          `Cannot pause while ${execution.status}; pause applies only while in progress`,
        );
      }
      return ProtocolExecutionSchema.parse({ ...execution, status: 'paused', updatedAt: at });
    }
    case 'resume': {
      if (execution.status !== 'paused') {
        throw new ProtocolExecutionError(
          'invalid-status-transition',
          `Cannot resume while ${execution.status}; resume applies only while paused`,
        );
      }
      return ProtocolExecutionSchema.parse({ ...execution, status: 'in_progress', updatedAt: at });
    }
    case 'abandon': {
      if (execution.status !== 'in_progress' && execution.status !== 'paused') {
        throw new ProtocolExecutionError(
          'invalid-status-transition',
          `Cannot abandon while ${execution.status}`,
        );
      }
      return ProtocolExecutionSchema.parse({
        ...execution,
        status: 'abandoned',
        updatedAt: at,
        finishedAt: at,
        closeReason: parsed.reason,
      });
    }
    case 'complete': {
      if (execution.status !== 'in_progress') {
        throw new ProtocolExecutionError(
          'invalid-status-transition',
          `Cannot complete while ${execution.status}; complete applies only while in progress`,
        );
      }
      const pending = execution.steps.filter(step => step.state === 'pending');
      if (pending.length > 0) {
        throw new ProtocolExecutionError(
          'pending-steps-remain',
          `Cannot complete with ${pending.length} unconfirmed step(s): ${pending.map(step => step.stepId).join(', ')}`,
        );
      }
      return ProtocolExecutionSchema.parse({
        ...execution,
        status: 'completed',
        updatedAt: at,
        finishedAt: at,
        closeReason: null,
      });
    }
  }
}

/**
 * The confirmed actual events of an execution, in plan order. Partial and
 * abandoned executions keep exactly these events: nothing here ever implies
 * that a remaining (pending, skipped, substituted, or modified) step
 * occurred.
 */
export function executionEvents(execution: ProtocolExecution): readonly ExecutionEvent[] {
  const parsed = ProtocolExecutionSchema.parse(execution);
  return deepFreeze(
    parsed.steps
      .filter(step => step.state === 'confirmed')
      .sort((left, right) => left.position - right.position)
      .map(step =>
        ExecutionEventSchema.parse({
          stepId: step.stepId,
          position: step.position,
          confirmedAt: step.confirmedAt,
        }),
      ),
  );
}

/** Validate a stored execution value into an immutable `ProtocolExecution`. Pure. */
export function parseProtocolExecution(input: unknown): ProtocolExecution {
  return ProtocolExecutionSchema.parse(input);
}
