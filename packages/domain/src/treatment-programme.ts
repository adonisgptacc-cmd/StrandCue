/**
 * Pure, deterministic treatment-programme state and due-status evaluation (Task I5.3).
 *
 * Combines one owner's treatment-programme enrolment facts, the canonical
 * care-event ledger from I5.1, named-unit wash counting from I5.2, an explicit
 * schema-validated programme rule, and an explicit `asOf` value. Returns the
 * programme state and due status without inventing a schedule, product
 * capability, resumption rule, treatment result, or medical claim.
 *
 * No wall clock, no randomness, no network, no environment variables, no
 * database, no filesystem. Inputs are never mutated; output is deeply frozen
 * and byte-deterministic for equivalent inputs in any order.
 */

import { z } from 'zod';

import {
  CareEventSchema,
  type CareEvent,
  CareEventDateSchema,
  compareCareEvents,
} from './care-events.ts';
import {
  AsOfSchema,
  EventReferenceSchema,
  type EventReference,
  type WashCountRange,
  WashCountRangeSchema,
  WashCountUnitSchema,
  countWashes,
  type WashCountRule,
  type WashCountUnit,
} from './wash-count.ts';
import { frozen, nonEmptyString } from './guidance/schemas.ts';

// ---------------------------------------------------------------------------
// Public schemas and types
// ---------------------------------------------------------------------------

export const ProgrammeStateSchema = z.enum([
  'not_started',
  'initial',
  'reassessment',
  'maintenance',
  'paused',
  'completed',
]);
export type ProgrammeState = z.output<typeof ProgrammeStateSchema>;

export const ProgrammeDueStatusSchema = z.enum([
  'not_due',
  'eligible',
  'due',
  'needs_input',
]);
export type ProgrammeDueStatus = z.output<typeof ProgrammeDueStatusSchema>;

export const ProgrammeMissingFactCodeSchema = z.enum([
  // Inherited from I5.2 wash counting.
  'missing-treatment-application',
  'multiple-treatment-applications',
  'application-date-unknown',
  'wash-date-unknown',
  'date-precision-too-coarse',
  'event-after-asof',
  'shampoo-use-unknown',
  'application-wash-relationship-unknown',
  'invalid-or-unsupported-event-facts',
  // Treatment-programme gates.
  'product-unverified',
  'product-version-missing',
  'product-rule-mismatch',
  'product-version-mismatch',
  'application-product-unknown',
  'application-product-mismatch',
  'application-before-enrolment',
  'application-start-date-unknown',
  'rule-draft',
  'rule-withdrawn',
  'rule-id-mismatch',
  'rule-version-mismatch',
  'rule-publication-mismatch',
  'missing-transition-policy',
  'maintenance-transition-missing',
  'maintenance-transition-mismatch',
  'interruption-without-resumption',
  'resumption-version-mismatch',
  'resumption-date-invalid',
  'snapshot-mismatch',
  'snapshot-invalid',
]);
export type ProgrammeMissingFactCode = z.output<typeof ProgrammeMissingFactCodeSchema>;

export const ProgrammeMissingFactSchema = frozen(
  z.object({
    code: ProgrammeMissingFactCodeSchema,
    eventId: nonEmptyString.optional(),
    explanation: nonEmptyString,
  }).strict()
);
export type ProgrammeMissingFact = z.output<typeof ProgrammeMissingFactSchema>;

const boundedIdentity = nonEmptyString.max(200);

export const RulePublicationBindingSchema = frozen(
  z.object({
    artifactId: boundedIdentity,
    artifactVersion: boundedIdentity,
    contentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/, 'Expected a lowercase sha256 digest'),
  }).strict(),
);
export type RulePublicationBinding = z.output<typeof RulePublicationBindingSchema>;

function referenceOrderKey(reference: EventReference): string {
  const date = reference.date.value ?? '';
  return `${reference.date.precision}\u0000${date}\u0000${reference.kind}\u0000${reference.eventId}`;
}

export const CompletedSnapshotSchema = frozen(
  z
    .object({
      enrolmentId: nonEmptyString,
      productId: nonEmptyString,
      productVersionId: nonEmptyString,
      ruleId: nonEmptyString,
      ruleVersion: nonEmptyString,
      rulePublication: RulePublicationBindingSchema,
      state: z.literal('completed'),
      dueStatus: ProgrammeDueStatusSchema,
      unit: WashCountUnitSchema,
      count: z.number().int().nonnegative(),
      range: WashCountRangeSchema.optional(),
      eventsUsed: z.array(EventReferenceSchema),
      application: EventReferenceSchema,
      asOf: AsOfSchema,
      completedAt: z.iso.datetime({ offset: true }),
    })
    .strict()
    .superRefine((snapshot, context) => {
      if (snapshot.application.kind !== 'application') {
        context.addIssue({ code: 'custom', path: ['application', 'kind'], message: 'The completed snapshot application must be an application event' });
      }
      if (!snapshot.eventsUsed.some(event => JSON.stringify(event) === JSON.stringify(snapshot.application))) {
        context.addIssue({ code: 'custom', path: ['eventsUsed'], message: 'The completed snapshot must include its application reference' });
      }
      const ids = snapshot.eventsUsed.map(event => event.eventId);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', path: ['eventsUsed'], message: 'Completed snapshot event references must be unique' });
      }
      const applicationMatches = snapshot.eventsUsed.filter(event => event.eventId === snapshot.application.eventId && event.kind === 'application');
      if (applicationMatches.length !== 1) {
        context.addIssue({ code: 'custom', path: ['application'], message: 'Completed snapshot must contain exactly one matching application reference' });
      }
      const keys = snapshot.eventsUsed.map(referenceOrderKey);
      if (keys.some((key, index) => index > 0 && keys[index - 1]! > key)) {
        context.addIssue({ code: 'custom', path: ['eventsUsed'], message: 'Completed snapshot event references must be in canonical order' });
      }
      if (Date.parse(snapshot.completedAt) > Date.parse(snapshot.asOf)) {
        context.addIssue({ code: 'custom', path: ['completedAt'], message: 'Completion cannot be after the snapshot as-of time' });
      }
      if (snapshot.application.date.precision !== 'exact') {
        context.addIssue({ code: 'custom', path: ['application', 'date'], message: 'The completed snapshot application must have an exact confirmed time' });
      } else if (Date.parse(snapshot.completedAt) < Date.parse(snapshot.application.date.value)) {
        context.addIssue({ code: 'custom', path: ['completedAt'], message: 'Completion cannot be earlier than the confirmed application' });
      }
    })
);
export type CompletedSnapshot = z.output<typeof CompletedSnapshotSchema>;

export const ProgrammeEnrolmentSchema = frozen(
  z
    .object({
      /** Stable enrolment identity. */
      enrolmentId: nonEmptyString,
      /** Exact product identity. */
      productId: nonEmptyString,
      /** Exact product-version identity. */
      productVersionId: nonEmptyString,
      /** Product-verification status. Unverified or unknown fails closed. */
      productVerificationStatus: z.enum(['verified', 'unverified', 'unknown']),
      /** Rule identity used when the programme was enrolled. */
      ruleId: nonEmptyString,
      /** Rule version used when the programme was enrolled. */
      ruleVersion: nonEmptyString,
      /** Exact reviewed publication artifact the enrolment was created from. */
      rulePublication: RulePublicationBindingSchema,
      /** Recorded lifecycle state. */
      state: ProgrammeStateSchema,
      /** Enrolment/start date with precision. */
      startDate: CareEventDateSchema,
      /** Selected treatment application event, if recorded. */
      selectedApplicationEventId: nonEmptyString.optional(),
      /** Paused state and pause date/reason code. */
      paused: z
        .object({
          pausedAt: CareEventDateSchema,
          pauseReasonCode: nonEmptyString,
        })
        .optional(),
      /** Resumed state and approved resumption record, if present. */
      resumed: z
        .object({
          resumptionRuleId: nonEmptyString,
          resumptionRuleVersion: nonEmptyString,
          resumedAt: CareEventDateSchema,
        })
        .optional(),
      /** Explicit reviewed transition into maintenance; lifecycle state alone is insufficient. */
      maintenanceTransition: z.object({
        ruleId: boundedIdentity,
        ruleVersion: boundedIdentity,
        transitionedAt: CareEventDateSchema,
      }).strict().optional(),
      /** Completed state and immutable completed snapshot. */
      completed: z.object({ snapshot: CompletedSnapshotSchema }).optional(),
      /** Append-only revision/version for deterministic validation. */
      revision: z.number().int().positive(),
    })
    .strict()
    .superRefine((enrolment, context) => {
      if ((enrolment.state === 'completed') !== (enrolment.completed !== undefined)) {
        context.addIssue({ code: 'custom', path: ['completed'], message: 'Completed state and snapshot must be recorded together' });
      }
      if (enrolment.state === 'paused' && enrolment.paused === undefined) {
        context.addIssue({ code: 'custom', path: ['paused'], message: 'Paused state requires a pause record' });
      }
      if (enrolment.paused !== undefined && enrolment.resumed === undefined && enrolment.state !== 'paused') {
        context.addIssue({ code: 'custom', path: ['state'], message: 'An unresolved pause requires paused state' });
      }
      if (enrolment.state === 'paused' && enrolment.resumed !== undefined) {
        context.addIssue({ code: 'custom', path: ['state'], message: 'A resumed enrolment cannot remain in paused state' });
      }
      if (enrolment.resumed !== undefined && enrolment.paused === undefined) {
        context.addIssue({ code: 'custom', path: ['resumed'], message: 'A resumption requires an earlier pause record' });
      }
      if (enrolment.state === 'maintenance' && enrolment.maintenanceTransition === undefined) {
        context.addIssue({ code: 'custom', path: ['maintenanceTransition'], message: 'Maintenance state requires an explicit transition record' });
      }
      if (enrolment.state !== 'maintenance' && enrolment.maintenanceTransition !== undefined) {
        context.addIssue({ code: 'custom', path: ['maintenanceTransition'], message: 'A maintenance transition belongs only to maintenance state' });
      }
      if (enrolment.completed !== undefined && (enrolment.paused !== undefined || enrolment.resumed !== undefined || enrolment.maintenanceTransition !== undefined)) {
        context.addIssue({ code: 'custom', path: ['state'], message: 'A completed enrolment cannot also carry active lifecycle transitions' });
      }
    })
);
export type ProgrammeEnrolment = z.output<typeof ProgrammeEnrolmentSchema>;

export const ProgrammeRuleSchema = frozen(
  z
    .object({
      /** Stable rule identifier used for deterministic auditing. */
      ruleId: nonEmptyString,
      /** Rule version. */
      ruleVersion: nonEmptyString,
      /** Exact supported product identity. */
      productId: nonEmptyString,
      /** Exact supported product-version identity. */
      productVersionId: nonEmptyString,
      /** Named count unit. */
      unit: WashCountUnitSchema,
      /** Application-wash counting policy. */
      applicationWashCounts: z.boolean(),
      /** Optional reviewed manufacturer range, preserved exactly. */
      range: WashCountRangeSchema.optional(),
      /** State-transition policy. */
      transitionPolicy: z
        .object({
          /** Washes below which the initial phase is active. */
          initialPhaseLimit: z.number().int().nonnegative(),
          /** Washes at or above which reassessment is appropriate. */
          reassessmentThreshold: z.number().int().nonnegative(),
          /** Washes at or above which maintenance is eligible (requires explicit transition). */
          maintenanceThreshold: z.number().int().nonnegative().optional(),
        })
        .strict()
        .superRefine((policy, context) => {
          if (policy.initialPhaseLimit >= policy.reassessmentThreshold) {
            context.addIssue({ code: 'custom', path: ['reassessmentThreshold'], message: 'Reassessment threshold must be above the last initial-phase count' });
          }
          if (policy.maintenanceThreshold !== undefined && policy.maintenanceThreshold < policy.reassessmentThreshold) {
            context.addIssue({ code: 'custom', path: ['maintenanceThreshold'], message: 'Maintenance threshold must not be below the reassessment threshold' });
          }
        }),
      /** Interruption policy; conservative default requires an approved resumption. */
      interruptionPolicy: z.enum(['requires_resumption']).optional(),
      /** Optional approved resumption rule. */
      resumptionRule: z
        .object({
          ruleId: nonEmptyString,
          ruleVersion: nonEmptyString,
          policy: z.enum(['resume_from_pause']),
        })
        .strict()
        .optional(),
      /** Publication/review status; draft or withdrawn refuses evaluation. */
      publicationStatus: z.enum(['draft', 'published', 'withdrawn']),
      /** Exact reviewed artifact binding; I5.4 must load this through an authenticated server join. */
      publication: RulePublicationBindingSchema.optional(),
    })
    .strict()
    .superRefine((rule, context) => {
      if (rule.publicationStatus === 'published' && rule.publication === undefined) {
        context.addIssue({ code: 'custom', path: ['publication'], message: 'A published rule requires its reviewed publication binding' });
      }
    })
);
export type ProgrammeRule = z.output<typeof ProgrammeRuleSchema>;

export const ProgrammeEvaluationSchema = frozen(
  z
    .object({
      state: ProgrammeStateSchema,
      dueStatus: ProgrammeDueStatusSchema,
      unit: WashCountUnitSchema,
      count: z.number().int().nonnegative().optional(),
      range: WashCountRangeSchema.optional(),
      eventsUsed: z.array(EventReferenceSchema),
      application: EventReferenceSchema.nullable(),
      asOf: z.string(),
      missing: z.array(ProgrammeMissingFactSchema),
      reasonCodes: z.array(nonEmptyString),
      fromCompletedSnapshot: z.boolean(),
      ruleId: nonEmptyString,
      ruleVersion: nonEmptyString,
    })
    .strict()
    .superRefine((result, context) => {
      if (result.fromCompletedSnapshot && result.count === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['count'],
          message: 'A completed snapshot evaluation must include a non-negative count',
        });
      }
      if (result.fromCompletedSnapshot && result.state !== 'completed') {
        context.addIssue({
          code: 'custom',
          path: ['state'],
          message: 'A completed snapshot evaluation must have state completed',
        });
      }
    })
);
export type ProgrammeEvaluation = z.output<typeof ProgrammeEvaluationSchema>;

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

const MAX_EVENTS = 1000;
const EventsInputSchema = z.array(CareEventSchema).max(MAX_EVENTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function programmeMissingFact(
  code: ProgrammeMissingFactCode,
  eventId: string | undefined,
  explanation: string,
): ProgrammeMissingFact {
  return ProgrammeMissingFactSchema.parse({
    code,
    ...(eventId === undefined ? {} : { eventId }),
    explanation,
  });
}

function toReference(event: CareEvent): EventReference {
  return EventReferenceSchema.parse({ eventId: event.eventId, kind: event.kind, date: event.date });
}

function isActiveApplication(event: CareEvent): event is Extract<CareEvent, { kind: 'application' }> {
  // Only confirmed execution applications establish programme start.
  // Activity-recorded applications are recorded facts, not confirmed occurrences.
  return event.kind === 'application' && event.lifecycle === 'active' && event.provenance === 'execution-confirmed';
}

function exactInstant(date: CareEvent['date']): number | null {
  return date.precision === 'exact' ? Date.parse(date.value) : null;
}

function sameRange(left: WashCountRange | undefined, right: WashCountRange | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.minimum === right.minimum && left.maximum === right.maximum;
}

function samePublication(left: RulePublicationBinding, right: RulePublicationBinding | undefined): boolean {
  return right !== undefined && left.artifactId === right.artifactId &&
    left.artifactVersion === right.artifactVersion && left.contentDigest === right.contentDigest;
}

function applicationStartOrder(applicationDate: CareEvent['date'], startDate: CareEvent['date']): 'before' | 'allowed' | 'unknown' {
  // Application-date uncertainty belongs to the I5.2 counting boundary; do
  // not replace its specific application-date-unknown result here.
  if (applicationDate.precision !== 'exact') return 'allowed';
  if (startDate.precision === 'exact') {
    return Date.parse(applicationDate.value) < Date.parse(startDate.value) ? 'before' : 'allowed';
  }
  if (startDate.precision === 'day') {
    return applicationDate.value.slice(0, 10) < startDate.value ? 'before' : 'allowed';
  }
  return 'unknown';
}

function buildEvaluation(args: {
  state: ProgrammeState;
  dueStatus: ProgrammeDueStatus;
  unit: WashCountUnit;
  count: number | undefined;
  range: WashCountRange | undefined;
  missing: readonly ProgrammeMissingFact[];
  used: readonly CareEvent[];
  usedReferences?: readonly EventReference[];
  application: CareEvent | null;
  applicationReference?: EventReference | null;
  asOf: string;
  reasonCodes: readonly string[];
  fromCompletedSnapshot: boolean;
  ruleId: string;
  ruleVersion: string;
}): ProgrammeEvaluation {
  const byDate = [...args.used].sort(compareCareEvents);
  const byCode = [...args.missing].sort((left, right) =>
    left.code !== right.code ? (left.code < right.code ? -1 : 1) : left.explanation < right.explanation ? -1 : 1
  );
  const byReason = [...args.reasonCodes].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return ProgrammeEvaluationSchema.parse({
    state: args.state,
    dueStatus: args.dueStatus,
    unit: args.unit,
    count: args.count,
    range: args.range,
    missing: byCode,
    eventsUsed: args.usedReferences === undefined ? byDate.map(toReference) : [...args.usedReferences],
    application: args.applicationReference === undefined
      ? (args.application === null ? null : toReference(args.application))
      : args.applicationReference,
    asOf: args.asOf,
    reasonCodes: byReason,
    fromCompletedSnapshot: args.fromCompletedSnapshot,
    ruleId: args.ruleId,
    ruleVersion: args.ruleVersion,
  });
}

// ---------------------------------------------------------------------------
// Product and rule verification gates
// ---------------------------------------------------------------------------

/**
 * Runs the fail-closed verification gates. Returns a needs_input evaluation
 * when any gate fails, or undefined when all gates pass so evaluation can
 * continue.
 */
function verificationGate(args: {
  enrolment: ProgrammeEnrolment;
  rule: ProgrammeRule;
  asOf: string;
}): { evaluation: ProgrammeEvaluation } | { gatePassed: true } {
  const { enrolment, rule } = args;
  const missing: ProgrammeMissingFact[] = [];
  const reasonCodes: string[] = [];

  if (enrolment.productVerificationStatus !== 'verified') {
    missing.push(
      programmeMissingFact(
        'product-unverified',
        undefined,
        'The programme product is not verified, so the programme cannot be evaluated.',
      )
    );
  } else {
    reasonCodes.push('product-verified');
  }

  if (!enrolment.productVersionId) {
    missing.push(
      programmeMissingFact(
        'product-version-missing',
        undefined,
        'The programme product version is missing, so the programme cannot be evaluated.',
      )
    );
  } else {
    reasonCodes.push('product-version-recorded');
  }

  if (enrolment.productId !== rule.productId) {
    missing.push(
      programmeMissingFact(
        'product-rule-mismatch',
        undefined,
        'The programme product does not match the rule product.',
      )
    );
  } else {
    reasonCodes.push('product-matches-rule');
  }

  if (enrolment.productVersionId !== rule.productVersionId) {
    missing.push(
      programmeMissingFact(
        'product-version-mismatch',
        undefined,
        'The programme product version does not match the rule product version.',
      )
    );
  } else {
    reasonCodes.push('product-version-matches-rule');
  }

  if (rule.publicationStatus === 'draft') {
    missing.push(
      programmeMissingFact(
        'rule-draft',
        undefined,
        'The treatment rule is draft and has not been reviewed for publication.',
      )
    );
  } else if (rule.publicationStatus === 'withdrawn') {
    missing.push(
      programmeMissingFact(
        'rule-withdrawn',
        undefined,
        'The treatment rule is withdrawn and must not be used.',
      )
    );
  } else {
    reasonCodes.push('rule-published');
  }

  if (enrolment.ruleId !== rule.ruleId) {
    missing.push(
      programmeMissingFact(
        'rule-id-mismatch',
        undefined,
        'The enrolment rule does not match the treatment rule.',
      )
    );
  } else {
    reasonCodes.push('rule-id-matches');
  }

  if (enrolment.ruleVersion !== rule.ruleVersion) {
    missing.push(
      programmeMissingFact(
        'rule-version-mismatch',
        undefined,
        'The enrolment rule version does not match the treatment rule version.',
      )
    );
  } else {
    reasonCodes.push('rule-version-matches');
  }


  if (rule.publicationStatus === 'published' && !samePublication(enrolment.rulePublication, rule.publication)) {
    missing.push(
      programmeMissingFact(
        'rule-publication-mismatch',
        undefined,
        'The enrolment does not match the exact reviewed rule publication.',
      ),
    );
  } else if (rule.publicationStatus === 'published') {
    reasonCodes.push('rule-publication-matches');
  }

  if (!rule.transitionPolicy) {
    missing.push(
      programmeMissingFact(
        'missing-transition-policy',
        undefined,
        'The treatment rule does not define a reviewed transition policy.',
      )
    );
  } else {
    reasonCodes.push('transition-policy-present');
  }

  if (missing.length > 0) {
    return {
      evaluation: buildEvaluation({
        state: 'not_started',
        dueStatus: 'needs_input',
        unit: rule.unit,
        count: undefined,
        range: rule.range,
        missing,
        used: [],
        application: null,
        asOf: args.asOf,
        reasonCodes,
        fromCompletedSnapshot: false,
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
      }),
    };
  }
  return { gatePassed: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateProgramme(
  enrolment: unknown,
  events: readonly CareEvent[],
  rule: unknown,
  asOf: unknown,
): ProgrammeEvaluation {
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    throw new RangeError(`Treatment programme evaluation accepts at most ${MAX_EVENTS} care events`);
  }
  const parsedEnrolment = ProgrammeEnrolmentSchema.parse(enrolment);
  const parsedRule = ProgrammeRuleSchema.parse(rule);
  const parsedAsOf = AsOfSchema.parse(asOf);
  const parsedEvents = EventsInputSchema.parse(events as unknown as CareEvent[]);

  // --- Verification gates (fail closed) ------------------------------------
  const gate = verificationGate({ enrolment: parsedEnrolment, rule: parsedRule, asOf: parsedAsOf });
  if ('evaluation' in gate) {
    return gate.evaluation;
  }

  // --- Completed snapshot stability (TR-06) --------------------------------
  if (parsedEnrolment.completed) {
    const snapshot = parsedEnrolment.completed.snapshot;
    const snapshotMatches =
      snapshot.enrolmentId === parsedEnrolment.enrolmentId &&
      snapshot.productId === parsedEnrolment.productId &&
      snapshot.productVersionId === parsedEnrolment.productVersionId &&
      snapshot.ruleId === parsedRule.ruleId &&
      snapshot.ruleVersion === parsedRule.ruleVersion &&
      samePublication(snapshot.rulePublication, parsedRule.publication) &&
      snapshot.unit === parsedRule.unit &&
      sameRange(snapshot.range, parsedRule.range) &&
      snapshot.application.kind === 'application' &&
      snapshot.eventsUsed.some(reference => JSON.stringify(reference) === JSON.stringify(snapshot.application));

    const completionAfterStart = applicationStartOrder(
      { precision: 'exact', value: snapshot.completedAt },
      parsedEnrolment.startDate,
    ) === 'allowed';

    if (!snapshotMatches || !completionAfterStart) {
      return buildEvaluation({
        state: 'not_started',
        dueStatus: 'needs_input',
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        missing: [
          programmeMissingFact(
            'snapshot-mismatch',
            undefined,
            'The completed snapshot does not match the enrolment or rule identity.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
        reasonCodes: [],
        fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId,
        ruleVersion: parsedRule.ruleVersion,
      });
    }

    return buildEvaluation({
      state: snapshot.state,
      dueStatus: snapshot.dueStatus,
      unit: snapshot.unit,
      count: snapshot.count,
      range: snapshot.range,
      missing: [],
      used: [],
      usedReferences: snapshot.eventsUsed,
      application: null,
      applicationReference: snapshot.application,
      asOf: snapshot.asOf,
      reasonCodes: ['completed-from-snapshot'],
      fromCompletedSnapshot: true,
      ruleId: snapshot.ruleId,
      ruleVersion: snapshot.ruleVersion,
    });
  }

  // --- Pause / interruption (TR-07) ----------------------------------------
  let evaluationEvents: readonly CareEvent[] = parsedEvents;
  if (parsedEnrolment.paused) {
    if (parsedEnrolment.resumed === undefined) {
      return buildEvaluation({
        state: 'paused',
        dueStatus: 'needs_input',
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        missing: [
          programmeMissingFact(
            'interruption-without-resumption',
            undefined,
            'The programme is paused or interrupted without an approved resumption record.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
        reasonCodes: ['paused-explicitly'],
        fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId,
        ruleVersion: parsedRule.ruleVersion,
      });
    }
    if (parsedRule.resumptionRule === undefined) {
      return buildEvaluation({
        state: 'paused',
        dueStatus: 'needs_input',
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        missing: [
          programmeMissingFact(
            'interruption-without-resumption',
            undefined,
            'The programme is paused but the rule defines no approved resumption rule.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
        reasonCodes: ['paused-explicitly'],
        fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId,
        ruleVersion: parsedRule.ruleVersion,
      });
    }
    const resumptionMismatch =
      parsedEnrolment.resumed.resumptionRuleId !== parsedRule.resumptionRule.ruleId ||
      parsedEnrolment.resumed.resumptionRuleVersion !== parsedRule.resumptionRule.ruleVersion;
    if (resumptionMismatch) {
      return buildEvaluation({
        state: 'paused',
        dueStatus: 'needs_input',
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        missing: [
          programmeMissingFact(
            'resumption-version-mismatch',
            undefined,
            'The recorded resumption rule does not match the treatment rule.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
        reasonCodes: ['paused-explicitly'],
        fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId,
        ruleVersion: parsedRule.ruleVersion,
      });
    }
    const pausedAt = exactInstant(parsedEnrolment.paused.pausedAt);
    const resumedAt = exactInstant(parsedEnrolment.resumed.resumedAt);
    const asOfInstant = Date.parse(parsedAsOf.length === 10 ? `${parsedAsOf}T00:00:00.000Z` : parsedAsOf);
    if (pausedAt === null || resumedAt === null || resumedAt <= pausedAt || resumedAt > asOfInstant) {
      return buildEvaluation({
        state: 'paused', dueStatus: 'needs_input', unit: parsedRule.unit, count: undefined,
        range: parsedRule.range,
        missing: [programmeMissingFact('resumption-date-invalid', undefined, 'The recorded resumption must be after the pause and no later than the evaluation time.')],
        used: [], application: null, asOf: parsedAsOf, reasonCodes: ['paused-explicitly'],
        fromCompletedSnapshot: false, ruleId: parsedRule.ruleId, ruleVersion: parsedRule.ruleVersion,
      });
    }
    // resume_from_pause preserves facts outside the pause interval and excludes
    // facts recorded after the pause through the exact resumption instant.
    evaluationEvents = parsedEvents.filter(event => {
      const instant = exactInstant(event.date);
      return instant === null || instant <= pausedAt || instant > resumedAt;
    });
  }

  // --- Treatment application -----------------------------------------------
  const confirmedApplications = evaluationEvents.filter(isActiveApplication);
  const unknownApplications = confirmedApplications.filter(event => event.application.product.identity === 'unknown');
  const mismatchedApplications = confirmedApplications.filter(event =>
    event.application.product.identity === 'known' &&
    (event.application.product.productId !== parsedEnrolment.productId ||
      event.application.product.productVersionId !== parsedEnrolment.productVersionId),
  );
  const applications = confirmedApplications.filter(event =>
    event.application.product.identity === 'known' &&
    event.application.product.productId === parsedEnrolment.productId &&
    event.application.product.productVersionId === parsedEnrolment.productVersionId,
  );

  let application: CareEvent | null = null;
  if (applications.length === 0) {
    const code: ProgrammeMissingFactCode = unknownApplications.length > 0
      ? 'application-product-unknown'
      : mismatchedApplications.length > 0
        ? 'application-product-mismatch'
        : 'missing-treatment-application';
    return buildEvaluation({
      state: 'not_started',
      dueStatus: 'needs_input',
      unit: parsedRule.unit,
      count: undefined,
      range: parsedRule.range,
      missing: [
        programmeMissingFact(
          code,
          undefined,
          code === 'application-product-unknown'
            ? 'The confirmed application does not record an exact product identity.'
            : code === 'application-product-mismatch'
              ? 'The confirmed application does not match the programme product and version.'
              : 'No confirmed treatment application was recorded to start the programme.',
        ),
      ],
      used: [],
      application: null,
      asOf: parsedAsOf,
      reasonCodes: [],
      fromCompletedSnapshot: false,
      ruleId: parsedRule.ruleId,
      ruleVersion: parsedRule.ruleVersion,
    });
  }

  if (applications.length > 1 || parsedEnrolment.selectedApplicationEventId !== undefined) {
    const selected =
      parsedEnrolment.selectedApplicationEventId === undefined
        ? undefined
        : applications.find(
            (event) => event.eventId === parsedEnrolment.selectedApplicationEventId,
          );
    if (selected === undefined) {
      return buildEvaluation({
        state: 'not_started',
        dueStatus: 'needs_input',
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        missing: [
          programmeMissingFact(
            'multiple-treatment-applications',
            undefined,
            parsedEnrolment.selectedApplicationEventId === undefined
              ? 'More than one confirmed treatment application was recorded; select one to evaluate from.'
              : 'The selected treatment application was not found among the confirmed applications.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
        reasonCodes: [],
        fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId,
        ruleVersion: parsedRule.ruleVersion,
      });
    }
    application = selected;
  } else {
    application = applications[0];
  }

  const startOrder = application === null ? 'unknown' : applicationStartOrder(application.date, parsedEnrolment.startDate);
  if (startOrder !== 'allowed') {
    return buildEvaluation({
      state: 'not_started', dueStatus: 'needs_input', unit: parsedRule.unit, count: undefined,
      range: parsedRule.range,
      missing: [programmeMissingFact(
        startOrder === 'before' ? 'application-before-enrolment' : 'application-start-date-unknown',
        application?.eventId,
        startOrder === 'before'
          ? 'The confirmed application is earlier than the programme enrolment.'
          : 'The programme start date is not precise enough to place the confirmed application.',
      )],
      used: [], application, asOf: parsedAsOf, reasonCodes: [], fromCompletedSnapshot: false,
      ruleId: parsedRule.ruleId, ruleVersion: parsedRule.ruleVersion,
    });
  }

  // --- Named-unit wash counting (I5.2) -------------------------------------
  const washRule: WashCountRule = {
    ruleId: parsedRule.ruleId,
    unit: parsedRule.unit,
    applicationWashCounts: parsedRule.applicationWashCounts,
    applicationEventId: application?.eventId,
    range: parsedRule.range,
  };
  const washResult = countWashes(evaluationEvents, washRule, parsedAsOf);

  if (parsedEnrolment.state === 'maintenance') {
    const transition = parsedEnrolment.maintenanceTransition;
    const threshold = parsedRule.transitionPolicy.maintenanceThreshold;
    const transitionedAt = transition === undefined ? null : exactInstant(transition.transitionedAt);
    const asOfInstant = Date.parse(parsedAsOf.length === 10 ? `${parsedAsOf}T00:00:00.000Z` : parsedAsOf);
    const transitionCount = transition?.transitionedAt.precision === 'exact'
      ? countWashes(evaluationEvents, washRule, transition.transitionedAt.value)
      : undefined;
    const transitionMatches = transition !== undefined && threshold !== undefined &&
      transition.ruleId === parsedRule.ruleId && transition.ruleVersion === parsedRule.ruleVersion &&
      transitionedAt !== null && transitionedAt <= asOfInstant &&
      transitionCount?.status === 'counted' && transitionCount.count !== undefined && transitionCount.count >= threshold;
    if (!transitionMatches) {
      return buildEvaluation({
        state: 'reassessment', dueStatus: 'needs_input', unit: parsedRule.unit, count: undefined,
        range: parsedRule.range,
        missing: [programmeMissingFact(
          transition === undefined ? 'maintenance-transition-missing' : 'maintenance-transition-mismatch',
          undefined,
          'Maintenance requires an explicit transition bound to this reviewed rule and its threshold.',
        )],
        used: [], application, asOf: parsedAsOf, reasonCodes: [], fromCompletedSnapshot: false,
        ruleId: parsedRule.ruleId, ruleVersion: parsedRule.ruleVersion,
      });
    }
  }

  // --- State determination -------------------------------------------------
  let state: ProgrammeState;
  const reasonCodes: string[] = ['application-confirmed'];

  // The enrolment lifecycle state is authoritative for maintenance and paused.
  // Paused is handled above; completed is handled by the snapshot check above.
  if (parsedEnrolment.state === 'maintenance') {
    state = 'maintenance';
    reasonCodes.push('enrolment-state-maintenance');
  } else if (washResult.status === 'needs_input') {
    // We have a confirmed application but cannot count yet.
    state = 'initial';
    reasonCodes.push('count-needs-input');
  } else {
    const count = washResult.count!;
    const { initialPhaseLimit, reassessmentThreshold } = parsedRule.transitionPolicy;

    if (count > initialPhaseLimit) {
      state = 'reassessment';
      reasonCodes.push(count >= reassessmentThreshold ? 'count-at-reassessment-threshold' : 'count-after-initial-phase');
    } else {
      state = 'initial';
      reasonCodes.push('count-within-initial-limit');
    }
  }

  // --- Due status ----------------------------------------------------------
  let dueStatus: ProgrammeDueStatus;
  if (washResult.status === 'needs_input') {
    dueStatus = 'needs_input';
  } else {
    const count = washResult.count!;
    const range = parsedRule.range;
    if (range === undefined) {
      // No reviewed range: derive due status from state.
      dueStatus = state === 'initial' ? 'not_due' : state === 'reassessment' ? 'eligible' : 'not_due';
    } else if (count < range.minimum) {
      dueStatus = 'not_due';
      reasonCodes.push('count-below-range-minimum');
    } else if (count < range.maximum) {
      dueStatus = 'eligible';
      reasonCodes.push('count-within-range');
    } else {
      dueStatus = 'due';
      reasonCodes.push('count-at-or-above-range-maximum');
    }
  }

  return buildEvaluation({
    state,
    dueStatus,
    unit: parsedRule.unit,
    count: washResult.status === 'counted' ? washResult.count : undefined,
    range: parsedRule.range,
    missing: washResult.missing,
    used: washResult.eventsUsed.length > 0 ? parsedEvents.filter((e) => washResult.eventsUsed.some((ref) => ref.eventId === e.eventId)) : [],
    application,
    asOf: parsedAsOf,
    reasonCodes,
    fromCompletedSnapshot: false,
    ruleId: parsedRule.ruleId,
    ruleVersion: parsedRule.ruleVersion,
  });
}
