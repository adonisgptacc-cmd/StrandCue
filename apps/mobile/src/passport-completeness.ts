import { currentDateOnly, effectiveDateToIntervalUnchecked, type EffectiveDate } from '../../../packages/domain/src/index';

/** Goal-scoped completeness for the Hair Passport: for every goal the owner
 * has chosen, the facts that goal's plan leans on, and which of those facts
 * the record still lacks. There is deliberately no percentage, score or
 * progress fraction anywhere in these answers — completeness reads as a
 * plain list per goal, and "Not sure" is an honest missing fact, not a
 * penalty. The same module renders the one coherent length line, including
 * the readable legacy centimetre entry that older records still carry. */

export type GoalId =
  | 'shine'
  | 'length-retention'
  | 'definition'
  | 'moisture-retention'
  | 'reduced-frizz'
  | 'manageability'
  | 'volume';

export const GOAL_LABELS: Readonly<Record<GoalId, string>> = {
  shine: 'Shine',
  'length-retention': 'Keeping length',
  definition: 'Definition',
  'moisture-retention': 'Keeping moisture',
  'reduced-frizz': 'Less frizz',
  manageability: 'Easier management',
  volume: 'Volume',
};

/** The recorded facts each goal's guidance leans on. Goals 'none' and
 * 'unknown' have no foundation list: they are answers, not plans. */
const GOAL_FOUNDATIONS: Readonly<Record<GoalId, readonly string[]>> = {
  shine: ['naturalPattern', 'strandDiameter', 'porosity'],
  'length-retention': ['length', 'strandDiameter', 'damageObservation'],
  definition: ['strandDiameter', 'naturalPattern', 'density'],
  'moisture-retention': ['porosity', 'damageObservation', 'environmentSensitivities'],
  'reduced-frizz': ['porosity', 'damageObservation', 'environmentSensitivities'],
  manageability: ['naturalPattern', 'porosity', 'stylingFrequency'],
  volume: ['strandDiameter', 'density', 'naturalPattern'],
};

const FACT_QUESTIONS: Readonly<Record<string, string>> = {
  naturalPattern: 'your natural pattern (straight, wavy, curly, coily or mixed)',
  strandDiameter: 'how fine or coarse a single strand feels',
  density: 'how much hair you have per area (low, medium or high)',
  porosity: 'how your hair takes on and holds water',
  damageObservation: 'what breakage, dryness or roughness you can see or feel',
  environmentSensitivities: 'how your hair responds to things like humidity',
  stylingFrequency: 'how often you style your hair',
  length: 'your current length, self-measured',
};

/** A recorded fact informs a plan when it exists and is not the "not sure"
 * answer; a definite 'none' observation counts as a real answer. Structured
 * objects (a measurement) always count. */
export function isRecordedFact(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((entry) => entry !== 'unknown');
  if (typeof value === 'string') return value !== 'unknown';
  return true;
}

/** Whether the record holds a length fact: a structured measurement, or a
 * legacy centimetre number the record still carries - including one the
 * projection can only report as an ambiguous field. */
export function hasRecordedLength(projection: {
  readonly values: Record<string, unknown>;
  readonly ambiguousFields?: Record<string, unknown>;
}): boolean {
  const values = projection.values;
  const measurement = values.lengthMeasurement;
  if (measurement !== null && measurement !== undefined && typeof measurement === 'object'
    && typeof (measurement as {value?: unknown}).value === 'number') return true;
  return legacyLength({values, ambiguousFields: projection.ambiguousFields ?? {}}).recorded;
}

export type LengthDisplay = {current: string | null; legacyNote: string | null};

export type LegacyLengthFact = {
  /** true when the record still holds a legacy centimetre length */
  readonly recorded: boolean;
  /** the number when the record places the length, null when it cannot */
  readonly value: number | null;
  /** true when the projection reports the length as an ambiguous field */
  readonly ambiguous: boolean;
  /** why the projection cannot place the length, when it cannot */
  readonly reason: 'uncertain-as-of' | 'overlapping-effective-intervals' | null;
  /** every length number the ambiguous field holds */
  readonly candidates: readonly number[];
};

function ambiguousLengthField(field: unknown): {reason: LegacyLengthFact['reason']; candidates: number[]} {
  if (field === null || typeof field !== 'object') return {reason: null, candidates: []};
  const raw = field as {reason?: unknown; candidates?: unknown};
  const reason = raw.reason === 'uncertain-as-of' || raw.reason === 'overlapping-effective-intervals' ? raw.reason : null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
      .map(candidate => (candidate !== null && typeof candidate === 'object' ? (candidate as {value?: unknown}).value : undefined))
      .filter((value): value is number => typeof value === 'number')
    : [];
  return {reason, candidates};
}

/** The legacy centimetre length a record still holds. The projection
 * reports a length it cannot place in time, or two lengths that conflict,
 * as an ambiguous field rather than as a current value; the record still
 * holds that length, so a new structured measurement has to retire it. */
export function legacyLength(projection: {
  readonly values: Record<string, unknown>;
  readonly ambiguousFields?: Record<string, unknown>;
}): LegacyLengthFact {
  const current = projection.values.lengthCm;
  if (typeof current === 'number') {
    return {recorded: true, value: current, ambiguous: false, reason: null, candidates: [current]};
  }
  const {reason, candidates} = ambiguousLengthField((projection.ambiguousFields ?? {}).lengthCm);
  if (candidates.length === 0) {
    return {recorded: false, value: null, ambiguous: false, reason: null, candidates: []};
  }
  const distinct = [...new Set(candidates)];
  return {recorded: true, value: distinct.length === 1 ? distinct[0] : null, ambiguous: true, reason, candidates: distinct};
}

/** Whether the stored history still holds a legacy centimetre number. The
 * database guard reads the stored facts rather than the projection, so the
 * client checks the history the same way: a legacy number in a revision no
 * correction has replaced is a length the record still holds, even when
 * the projection cannot place it in time. */
export function historyHoldsLegacyLength(
  revisions: readonly StoredRevision[],
  supersededRevisionIds: readonly string[] = [],
  replacedByThisAppend: string | undefined = undefined,
): boolean {
  return legacyLengthIntervals(revisions, supersededRevisionIds, replacedByThisAppend).length > 0;
}

/** A stored revision, as the record history carries it. */
export type StoredRevision = {
  readonly id: string;
  readonly effectiveDate: EffectiveDate;
  readonly patch: Record<string, unknown>;
};

/** A legacy length fact with the interval it covers. The database guard
 * refuses a retirement that does not follow the earlier entry, because the
 * earlier entry would stay the record's current length next to the new
 * measurement, so the screen checks the same condition before it saves. */
export type LegacyLengthInterval = {
  /** the earlier entry's last day, null when the record cannot place it in time */
  readonly end: string | null;
  /** the revision that carries the earlier entry */
  readonly revisionId: string;
};

export function legacyLengthIntervals(
  revisions: readonly StoredRevision[],
  supersededRevisionIds: readonly string[] = [],
  replacedByThisAppend: string | undefined = undefined,
): LegacyLengthInterval[] {
  const active = revisions.filter(revision => !supersededRevisionIds.includes(revision.id));
  // The stored history is server data, so an entry the domain would refuse
  // (a future or impossible date) must not crash the screen: it is read as
  // an entry the record cannot place in time.
  const intervalOf = (revision: (typeof active)[number]) => {
    if (revision.effectiveDate.precision === 'unknown' || revision.effectiveDate.value === null) {
      return {start: null, end: null};
    }
    // Stored history is read as it is: a date the domain would refuse for a
    // new fact (a future year, an impossible day) still tells the client
    // when that earlier entry ends.
    return effectiveDateToIntervalUnchecked(revision.effectiveDate);
  };
  return active
    .filter(revision => typeof revision.patch.lengthCm === 'number')
    // The entry this append corrects is replaced by that append, so it is
    // not an earlier entry the record still holds.
    .filter(revision => revision.id !== replacedByThisAppend)
    .map(revision => ({revision, interval: intervalOf(revision)}))
    // A later length fact that follows this entry replaces it, the same way
    // the projection and the database guard read it - except the entry this
    // append corrects, which the append supersedes and which therefore
    // cannot be the fact that replaces the earlier length.
    .filter(entry => !active.some(other =>
      other.id !== entry.revision.id
      && other.id !== replacedByThisAppend
      && other.patch.lengthCm !== undefined
      && intervalOf(other).end !== null
      && entry.interval.end !== null
      && intervalOf(other).start !== null
      && entry.interval.end < intervalOf(other).start!))
    .map(entry => ({revisionId: entry.revision.id, end: entry.interval.end}));
}

/** The notice for an earlier entry the record's projection cannot show - a
 * legacy length dated in the future, for instance, which the projection
 * leaves out because it cannot place it in time. The stored history still
 * holds it, and only correcting that entry replaces it. */
export function historyLegacyNotice(intervals: readonly LegacyLengthInterval[]): string | null {
  if (intervals.length === 0) return null;
  const future = intervals.some(entry => entry.end !== null && entry.end > currentDateOnly());
  return future
    ? 'An earlier entry kept a centimetre length dated in the future. It stays readable in your history; correcting that entry in History is how you replace it.'
    : 'An earlier entry kept a centimetre length this record cannot place in time. It stays readable in your history; correcting that entry in History is how you replace it.';
}

/** The plain sentence that tells the owner what the earlier entry is and
 * what the save does with it. It never promises a retirement the record
 * cannot perform: an earlier entry that cannot be placed in time stays
 * visible until it is corrected in History. */
export function legacyLengthNotice(fact: LegacyLengthFact, mode: 'read' | 'save' = 'save'): string | null {
  if (!fact.recorded) return null;
  const numbers = fact.candidates.map(candidate => `${candidate} centimetres`);
  const parts: string[] = [];
  if (fact.ambiguous && numbers.length > 1) {
    parts.push(`Two earlier entries record different lengths (${numbers.join(' and ')}), so this record cannot say which is current.`);
    parts.push('They stay readable in your history.');
  } else {
    const earlier = fact.value !== null ? `An earlier entry kept ${fact.value} centimetres` : 'An earlier entry kept a centimetre length';
    const when = fact.ambiguous
      ? (fact.reason === 'overlapping-effective-intervals'
          ? ', and this record cannot say which entry is current'
          : ', and this record cannot say when it applied')
      : ', written before this screen changed';
    parts.push(`${earlier}${when}.`);
    parts.push('It stays readable in your history.');
  }
  if (mode === 'save') {
    parts.push('Your new length is recorded in the same save, so the record keeps one current length.');
  }
  if (fact.ambiguous) {
    parts.push('Correcting that earlier entry in History, with the length that replaces it, clears it for good.');
  }
  return parts.join(' ');
}

/** One human sentence for the measured length, and — when the record still
 * carries a legacy centimetre number — one note that keeps it readable
 * without claiming two current lengths. */
export function describeLength(values: Record<string, unknown>): LengthDisplay {
  let current: string | null = null;
  const measurement = values.lengthMeasurement;
  if (measurement !== null && measurement !== undefined && typeof measurement === 'object'
    && typeof (measurement as {value?: unknown}).value === 'number') {
    const m = measurement as {value: number; unit: string; precision?: string; measuredOn?: string | null};
    const parts = [`${m.value} ${m.unit === 'in' ? 'inches' : 'centimetres'}`];
    if (m.precision === 'exact') parts.push('measured exactly');
    if (m.precision === 'approximate') parts.push('measured approximately');
    if (typeof m.measuredOn === 'string') parts.push(`on ${m.measuredOn}`);
    current = parts.join(', ');
  }
  let legacyNote: string | null = null;
  if (typeof values.lengthCm === 'number') {
    if (current === null) {
      // The legacy centimetre number is still this person's current length;
      // say so plainly without a second contradictory line.
      current = `${values.lengthCm} centimetres, recorded before this screen changed`;
    } else {
      legacyNote = `An earlier entry kept ${values.lengthCm} centimetres; your latest measurement above takes over.`;
    }
  }
  return {current, legacyNote};
}

export type GoalGap = {goal: GoalId; label: string; missing: string[]};

/** Per chosen goal, the missing foundation facts as plain questions. No
 * universal completeness percentage: each goal speaks for itself. */
export function goalGaps(projection: {
  readonly values: Record<string, unknown>;
  readonly ambiguousFields?: Record<string, unknown>;
}): GoalGap[] {
  const values = projection.values;
  const chosen = Array.isArray(values.goals)
    ? values.goals.filter((goal): goal is GoalId => typeof goal === 'string' && goal in GOAL_LABELS)
    : [];
  const gaps: GoalGap[] = [];
  for (const goal of chosen) {
    if (gaps.some((entry) => entry.goal === goal)) continue;
    const missing = GOAL_FOUNDATIONS[goal]
      .filter((fact) => fact === 'length' ? !hasRecordedLength(projection) : !isRecordedFact(values[fact]))
      .map((fact) => FACT_QUESTIONS[fact]);
    gaps.push({goal, label: GOAL_LABELS[goal], missing});
  }
  return gaps;
}
