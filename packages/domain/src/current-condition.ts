/**
 * Temporary current-condition check-in contracts (HP-06, SF-01).
 *
 * A check-in records cosmetic self-reports for one routine only. It is
 * session-only: it never changes the Passport, carries no persistence flag,
 * and it carries no free-text symptom, severity or diagnosis fields: concerns
 * are cosmetic labels, nothing more. There is deliberately no free-text
 * interpretation here — anything outside the vocabularies below is rejected.
 */

import { z } from 'zod';

import { ServiceZoneSchema } from './services.ts';

/**
 * Cosmetic concern vocabulary. Every entry is something a person can notice and
 * tap: none names a diagnosis, a disease or a medical finding, and a concern is
 * never a severity. `buildup` covers product buildup or a heavy, coated feel;
 * `scalp-discomfort` is the person's own report of how their scalp feels, not an
 * assessment of it; `chemical-processing-concern` and `heat-concern` say the
 * person is worried about the effect of chemical processing or heat on their
 * hair today, and nothing about what happened.
 */
export const CurrentConditionConcernSchema = z.enum([
  'dryness',
  'frizz',
  'tangling',
  'breakage',
  'stiffness',
  'dullness',
  'buildup',
  'scalp-dryness',
  'scalp-oiliness',
  'scalp-discomfort',
  'reported-damage',
  'chemical-processing-concern',
  'heat-concern',
  'none',
  'unknown',
]);

export type CurrentConditionConcern = z.output<typeof CurrentConditionConcernSchema>;

/** Where on the head/strand a concern was noticed; shared with service zones. */
export const CurrentConditionZoneSchema = ServiceZoneSchema;

export type CurrentConditionZone = z.output<typeof CurrentConditionZoneSchema>;

const IsoOffsetTimestampSchema = z.iso.datetime({ offset: true });

const ConcernsSchema = z
  .array(CurrentConditionConcernSchema)
  .min(1)
  .superRefine((concerns, context) => {
    if (new Set(concerns).size !== concerns.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current-condition concerns must be unique',
      });
    }
    // `none` and `unknown` each stand alone: either one alongside anything
    // else (including each other) is a contradictory answer, not a subset.
    const exclusive = concerns.filter(concern => concern === 'none' || concern === 'unknown');
    if (exclusive.length > 0 && concerns.length > 1) {
      context.addIssue({
        code: 'custom',
        message: "'none' and 'unknown' are exclusive: they cannot combine with other concerns",
      });
    }
  })
  // Canonical order keeps downstream runs deterministic regardless of the
  // order concerns were tapped in. A fresh array, so the caller's input is
  // never reordered in place.
  .transform(concerns => [...concerns].sort());

const ZonesSchema = z
  .array(CurrentConditionZoneSchema)
  .min(1)
  // Six regions times six segments bounds the zone space, mirroring services.
  .max(36)
  .superRefine((zones, context) => {
    const keys = zones.map(({ region, segment }) => `${region}:${segment}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current-condition zones must be unique',
      });
    }
  })
  .transform(zones =>
    [...zones].sort((left, right) =>
      `${left.region}:${left.segment}`.localeCompare(`${right.region}:${right.segment}`),
    ),
  );

/**
 * A concern attached to one reported zone. `none` and `unknown` describe the
 * whole check-in, so neither can be attached to a zone. Each entry is sorted
 * canonically so tap order never changes the answer.
 */
const ZoneConcernSchema = z
  .object({
    zone: CurrentConditionZoneSchema,
    concerns: z
      .array(CurrentConditionConcernSchema)
      .min(1)
      .superRefine((concerns, context) => {
        if (new Set(concerns).size !== concerns.length) {
          context.addIssue({ code: 'custom', message: 'Zone concerns must be unique' });
        }
        if (concerns.some(concern => concern === 'none' || concern === 'unknown')) {
          context.addIssue({
            code: 'custom',
            message: "'none' and 'unknown' are exclusive check-in answers: they cannot be attached to a zone",
          });
        }
      })
      .transform(concerns => [...concerns].sort()),
  })
  .strict();

const ZoneConcernsSchema = z
  .array(ZoneConcernSchema)
  .min(1)
  .max(36)
  .superRefine((entries, context) => {
    const keys = entries.map(({ zone }) => `${zone.region}:${zone.segment}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Zone concern zones must be unique' });
    }
  })
  .transform(entries =>
    [...entries].sort((left, right) =>
      `${left.zone.region}:${left.zone.segment}`.localeCompare(`${right.zone.region}:${right.zone.segment}`),
    ),
  );

/**
 * Goal under pursuit when the check-in was taken. Mirrors
 * GuidanceGoalIdSchema; extend both together when a new goal ships.
 */
const CurrentConditionGoalSchema = z.enum(['basic_wash']);

/**
 * Deep-freeze helper, mirroring the guidance schemas convention. Check-ins
 * cross module boundaries into guidance preparation, so a parsed value must
 * not be mutable in place.
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

export const CurrentConditionSchema = frozen(
  z
    .object({
      observedAt: IsoOffsetTimestampSchema,
      concerns: ConcernsSchema,
      goal: CurrentConditionGoalSchema,
      // Zero means no time available. The upper bound is one calendar day
      // (1440 minutes): a single routine session cannot span more than a day.
      availableMinutes: z.number().int().min(0).max(1440),
      zones: ZonesSchema.optional(),
      // Which reported concern was noticed in which reported zone. Optional: a
      // check-in may name zones without saying which concern sits where.
      zoneConcerns: ZoneConcernsSchema.optional(),
    })
    .strict()
    .superRefine((checkIn, context) => {
      // A zone-attached answer may only point at what the same check-in
      // reported. Anything else is a contradiction, never silently repaired.
      const reportedZones = new Set((checkIn.zones ?? []).map(({ region, segment }) => `${region}:${segment}`));
      const reportedConcerns = new Set<string>(checkIn.concerns);
      for (const entry of checkIn.zoneConcerns ?? []) {
        if (!reportedZones.has(`${entry.zone.region}:${entry.zone.segment}`)) {
          context.addIssue({ code: 'custom', path: ['zoneConcerns'], message: 'Zone concerns must refer to reported zones' });
        }
        if (entry.concerns.some(concern => !reportedConcerns.has(concern))) {
          context.addIssue({ code: 'custom', path: ['zoneConcerns'], message: 'Zone concerns must refer to reported concerns' });
        }
      }
    }),
);

export type CurrentConditionInput = z.output<typeof CurrentConditionSchema>;

/**
 * Validate a raw check-in into an immutable `CurrentConditionInput`.
 *
 * Pure: never mutates its argument and returns a frozen value built from new
 * objects. `observedAt` must carry an explicit offset and must not be later
 * than the injected `now` — callers (and all tests) pass `now` explicitly so
 * no wall-clock read hides inside validation.
 */
export function normalizeCurrentCondition(input: unknown, now: Date = new Date()): CurrentConditionInput {
  const parsed = CurrentConditionSchema.parse(input);
  if (Date.parse(parsed.observedAt) > now.getTime()) {
    throw new RangeError('Current-condition observedAt must not be in the future');
  }
  return parsed;
}
