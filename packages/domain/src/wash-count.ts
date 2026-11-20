/**
 * Pure, deterministic wash counting by named unit (Task I5.2).
 *
 * Counts elapsed washes or shampoo sessions after a confirmed treatment
 * application, using only active canonical care events produced by the
 * I5.1 care-event boundary. Unknown facts stay unknown: instead of
 * inventing a count the result is `needs_input` with a structured
 * missing-fact record naming exactly what is missing. No clock, no
 * network, no database, no product claims.
 *
 * Inputs are never mutated and the output is deeply frozen and
 * byte-deterministic for equivalent inputs in any input order.
 */

import { z } from 'zod';

import { CareEventSchema, type CareEvent, CareEventDateSchema, compareCareEvents } from './care-events.ts';
import { DateOnlySchema } from './dates.ts';
import { frozen, nonEmptyString } from './guidance/schemas.ts';

// ---------------------------------------------------------------------------
// Public schemas and types
// ---------------------------------------------------------------------------

export const WashCountUnitSchema = z.enum(['wash', 'shampoo-session']);
export type WashCountUnit = z.output<typeof WashCountUnitSchema>;

export const WashCountRangeSchema = z
  .object({
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative(),
  })
  .strict()
  .refine(range => range.minimum <= range.maximum, {
    message: 'The lower bound must not exceed the upper bound',
    path: ['maximum'],
  });
export type WashCountRange = z.output<typeof WashCountRangeSchema>;

export const WashCountRuleSchema = frozen(
  z
    .object({
      /** Explicit rule identifier used for deterministic auditing. */
      ruleId: nonEmptyString,
      unit: WashCountUnitSchema,
      /** Whether the wash containing the treatment application counts. */
      applicationWashCounts: z.boolean(),
      /** Selects one application event when more than one is active. */
      applicationEventId: nonEmptyString.optional(),
      /** Optional reviewed manufacturer range, preserved exactly. */
      range: WashCountRangeSchema.optional(),
    })
    .strict()
);
export type WashCountRule = z.output<typeof WashCountRuleSchema>;

export const AsOfSchema = z.string().refine(value => {
  // An explicit validated input: an offset-aware instant or a calendar day.
  // The current clock is never used.
  return z.iso.datetime({ offset: true }).safeParse(value).success || DateOnlySchema.safeParse(value).success;
}, 'Expected an ISO datetime with offset or a calendar date');
export type AsOf = z.output<typeof AsOfSchema>;

export const MissingFactCodeSchema = z.enum([
  'missing-treatment-application',
  'multiple-treatment-applications',
  'application-date-unknown',
  'wash-date-unknown',
  'date-precision-too-coarse',
  'event-after-asof',
  'shampoo-use-unknown',
  'application-wash-relationship-unknown',
  'invalid-or-unsupported-event-facts',
]);
export type MissingFactCode = z.output<typeof MissingFactCodeSchema>;

export const MissingFactSchema = frozen(
  z.object({
    code: MissingFactCodeSchema,
    eventId: nonEmptyString.optional(),
    explanation: nonEmptyString,
  }).strict()
);
export type MissingFact = z.output<typeof MissingFactSchema>;

export const EventReferenceSchema = frozen(
  z.object({
    eventId: nonEmptyString,
    kind: z.enum(['wash', 'application', 'heat']),
    date: CareEventDateSchema,
  }).strict()
);
export type EventReference = z.output<typeof EventReferenceSchema>;

export const WashCountResultSchema = frozen(
  z
    .object({
      unit: WashCountUnitSchema,
      count: z.number().int().nonnegative().optional(),
      range: WashCountRangeSchema.optional(),
      status: z.enum(['counted', 'needs_input']),
      missing: z.array(MissingFactSchema),
      eventsUsed: z.array(EventReferenceSchema),
      application: EventReferenceSchema.nullable(),
      asOf: z.string(),
    })
    .strict()
    .superRefine((result, context) => {
      if (result.status === 'counted' && result.count === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['count'],
          message: 'A counted result must include a non-negative count',
        });
      }
      if (result.status === 'needs_input' && result.count !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['count'],
          message: 'A needs_input result must not present a count as final',
        });
      }
    })
);
export type WashCountResult = z.output<typeof WashCountResultSchema>;

// ---------------------------------------------------------------------------
// Boundary validation
// ---------------------------------------------------------------------------

const MAX_EVENTS = 1000;
const EventsInputSchema = z.array(CareEventSchema).max(MAX_EVENTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The comparable instant of a recorded date, following the same convention
 * as the I5.1 canonical ordering: exact instants keep their offset, a day
 * is the start of that calendar day, and approximate or unknown dates have
 * no comparable instant. Month/year precision is never widened to a day.
 */
function instantOf(date: CareEvent['date']): number | null {
  switch (date.precision) {
    case 'exact':
      return Date.parse(date.value);
    case 'day':
      return Date.parse(`${date.value}T00:00:00.000Z`);
    case 'approximate':
    case 'unknown':
      return null;
  }
}

function asOfInstantOf(asOf: AsOf): number {
  const parsed = z.iso.datetime({ offset: true }).safeParse(asOf);
  if (parsed.success) return Date.parse(parsed.data);
  return Date.parse(`${asOf}T00:00:00.000Z`);
}

function missingFact(code: MissingFactCode, eventId: string | undefined, explanation: string): MissingFact {
  return MissingFactSchema.parse({
    code,
    ...(eventId === undefined ? {} : { eventId }),
    explanation,
  });
}

function toReference(event: CareEvent): EventReference {
  return EventReferenceSchema.parse({ eventId: event.eventId, kind: event.kind, date: event.date });
}

function buildResult(args: {
  unit: WashCountUnit;
  count: number | undefined;
  range: WashCountRange | undefined;
  status: 'counted' | 'needs_input';
  missing: readonly MissingFact[];
  used: readonly CareEvent[];
  application: CareEvent | null;
  asOf: string;
}): WashCountResult {
  const byDate = [...args.used].sort(compareCareEvents);
  const byCode = [...args.missing].sort((left, right) =>
    left.code !== right.code ? (left.code < right.code ? -1 : 1) : left.explanation < right.explanation ? -1 : 1
  );
  return WashCountResultSchema.parse({
    unit: args.unit,
    count: args.count,
    range: args.range,
    status: args.status,
    missing: byCode,
    eventsUsed: byDate.map(toReference),
    application: args.application === null ? null : toReference(args.application),
    asOf: args.asOf,
  });
}

/**
 * Whether a wash is the wash containing the treatment application. The
 * relationship is proven only by a shared confirmed execution/run identity
 * (record id plus recommendation run id), never by sharing a calendar day
 * or by timestamp adjacency. Activity-recorded applications carry no
 * execution identity, so no wash can be proven to be their application wash.
 */
function isApplicationWash(application: CareEvent, wash: CareEvent): boolean {
  if (wash.eventId === application.eventId) return false;
  if (wash.provenance !== 'execution-confirmed') return false;
  if (application.provenance !== 'execution-confirmed') return false;
  return wash.source.recordId === application.source.recordId && wash.source.runId === application.source.runId;
}

function isActiveWash(event: CareEvent): event is Extract<CareEvent, { kind: 'wash' }> {
  return event.kind === 'wash' && event.lifecycle === 'active';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function countWashes(events: readonly CareEvent[], rule: unknown, asOf: unknown): WashCountResult {
  const parsedRule = WashCountRuleSchema.parse(rule);
  const parsedAsOf = AsOfSchema.parse(asOf);
  const parsedEvents = EventsInputSchema.parse(events as unknown as CareEvent[]);
  const asOfInstant = asOfInstantOf(parsedAsOf);

  const missing: MissingFact[] = [];

  // Duplicate event identities are idempotent when byte-identical and fail
  // closed when they conflict. Dedup happens before any application selection
  // so byte-identical duplicates never look like multiple distinct
  // applications.
  const byIdentity = new Map<string, CareEvent>();
  for (const event of parsedEvents) {
    const previous = byIdentity.get(event.eventId);
    if (previous === undefined) {
      byIdentity.set(event.eventId, event);
      continue;
    }
    if (JSON.stringify(previous) === JSON.stringify(event)) continue;
    throw new Error('Conflicting duplicate care event identities fail closed');
  }
  const uniqueEvents = [...byIdentity.values()];

  const applications = uniqueEvents.filter(
    event => event.kind === 'application' && event.lifecycle === 'active'
  );

  let application: CareEvent | null = null;
  if (applications.length === 0) {
    return buildResult({
      unit: parsedRule.unit,
      count: undefined,
      range: parsedRule.range,
      status: 'needs_input',
      missing: [
        missingFact(
          'missing-treatment-application',
          undefined,
          'No confirmed treatment application was recorded to count washes from.',
        ),
      ],
      used: [],
      application: null,
      asOf: parsedAsOf,
    });
  }
  if (applications.length > 1) {
    const selected =
      parsedRule.applicationEventId === undefined
        ? undefined
        : applications.find(event => event.eventId === parsedRule.applicationEventId);
    if (selected === undefined) {
      return buildResult({
        unit: parsedRule.unit,
        count: undefined,
        range: parsedRule.range,
        status: 'needs_input',
        missing: [
          missingFact(
            'multiple-treatment-applications',
            undefined,
            parsedRule.applicationEventId === undefined
              ? 'More than one confirmed treatment application was recorded; select one to count from.'
              : 'The selected treatment application was not found among the confirmed applications.',
          ),
        ],
        used: [],
        application: null,
        asOf: parsedAsOf,
      });
    }
    application = selected;
  } else {
    application = applications[0];
  }

  const applicationInstant = instantOf(application.date);
  if (applicationInstant === null) {
    return buildResult({
      unit: parsedRule.unit,
      count: undefined,
      range: parsedRule.range,
      status: 'needs_input',
      missing: [
        missingFact(
          'application-date-unknown',
          application.eventId,
          'The treatment application date is unknown, so washes cannot be placed before or after it.',
        ),
      ],
      used: [],
      application: null,
      asOf: parsedAsOf,
    });
  }

  const candidateWashes = uniqueEvents.filter(isActiveWash);

  let count = 0;
  const used: CareEvent[] = [];
  let needsInput = false;

  // Washes strictly after the application and not after asOf are elapsed.
  const elapsedWashes: Extract<CareEvent, { kind: 'wash' }>[] = [];
  for (const wash of candidateWashes) {
    if (isApplicationWash(application, wash)) continue; // handled by the application-wash policy below
    const instant = instantOf(wash.date);
    if (instant === null) {
      needsInput = true;
      missing.push(
        wash.date.precision === 'unknown'
          ? missingFact(
              'wash-date-unknown',
              wash.eventId,
              'This wash date is unknown, so it cannot be placed before or after the treatment or as-of date.',
            )
          : missingFact(
              'date-precision-too-coarse',
              wash.eventId,
              'This wash is recorded only to month or year precision, so it cannot be placed reliably before or after the treatment or as-of date.',
            )
      );
      continue;
    }
    if (instant > asOfInstant) continue; // future events are excluded, never counted as elapsed
    if (instant <= applicationInstant) continue; // events before the application are excluded
    elapsedWashes.push(wash);
  }

  for (const wash of elapsedWashes) {
    if (parsedRule.unit === 'shampoo-session') {
      if (wash.wash.shampooUsed === 'yes') {
        count += 1;
        used.push(wash);
      } else if (wash.wash.shampooUsed === 'unknown') {
        needsInput = true;
        missing.push(
          missingFact(
            'shampoo-use-unknown',
            wash.eventId,
            'Shampoo use is unknown for this wash, so it may or may not count as a shampoo session.',
          )
        );
      }
      // 'no' does not count.
    } else {
      count += 1;
      used.push(wash);
    }
  }

  // Application-wash policy: only the rule decides whether it counts.
  const applicationWashes = candidateWashes.filter(wash => isApplicationWash(application, wash));
  if (applicationWashes.length > 0 && applicationInstant <= asOfInstant) {
    if (parsedRule.applicationWashCounts) {
      for (const wash of applicationWashes) {
        const washInstant = instantOf(wash.date);
        if (washInstant === null || washInstant > asOfInstant) {
          if (washInstant === null) {
            needsInput = true;
            missing.push(
              missingFact(
                'wash-date-unknown',
                wash.eventId,
                'The wash containing the treatment application has an unknown date, so it cannot be placed relative to the as-of date.',
              )
            );
          }
          continue;
        }
        if (parsedRule.unit === 'shampoo-session') {
          if (wash.wash.shampooUsed === 'yes') {
            count += 1;
            used.push(wash);
          } else if (wash.wash.shampooUsed === 'unknown') {
            needsInput = true;
            missing.push(
              missingFact(
                'shampoo-use-unknown',
                wash.eventId,
                'Shampoo use is unknown for the wash containing the treatment application, so it may or may not count as a shampoo session.',
              )
            );
          }
        } else {
          count += 1;
          used.push(wash);
        }
      }
    }
    // applicationWashCounts === false: the application wash is not counted.
  }

  // The application-wash relationship cannot be established from the event
  // record, and the rule wants to count it: the count is uncertain by one.
  if (
    application.provenance !== 'execution-confirmed' &&
    parsedRule.applicationWashCounts &&
    candidateWashes.some(wash => {
      const instant = instantOf(wash.date);
      return instant !== null && instant <= asOfInstant;
    })
  ) {
    needsInput = true;
    missing.push(
      missingFact(
        'application-wash-relationship-unknown',
        undefined,
        'The treatment was not recorded in a confirmed execution session, so the wash containing it cannot be identified from the event record.',
      )
    );
  }

  if (needsInput) {
    return buildResult({
      unit: parsedRule.unit,
      count: undefined,
      range: parsedRule.range,
      status: 'needs_input',
      missing,
      used: [],
      application: null,
      asOf: parsedAsOf,
    });
  }

  return buildResult({
    unit: parsedRule.unit,
    count,
    range: parsedRule.range,
    status: 'counted',
    missing: [],
    used,
    application,
    asOf: parsedAsOf,
  });
}
