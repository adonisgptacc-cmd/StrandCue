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

/** Length is recorded when a structured measurement exists, or when the
 * readable legacy centimetre entry is still on the record; a mixed
 * projection with both keys counts as the one recorded length it presents. */
export function hasRecordedLength(values: Record<string, unknown>): boolean {
  const measurement = values.lengthMeasurement;
  if (measurement !== null && measurement !== undefined && typeof measurement === 'object'
    && typeof (measurement as {value?: unknown}).value === 'number') return true;
  return typeof values.lengthCm === 'number';
}

export type LengthDisplay = {current: string | null; legacyNote: string | null};

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
export function goalGaps(values: Record<string, unknown>): GoalGap[] {
  const chosen = Array.isArray(values.goals)
    ? values.goals.filter((goal): goal is GoalId => typeof goal === 'string' && goal in GOAL_LABELS)
    : [];
  const gaps: GoalGap[] = [];
  for (const goal of chosen) {
    if (gaps.some((entry) => entry.goal === goal)) continue;
    const missing = GOAL_FOUNDATIONS[goal]
      .filter((fact) => fact === 'length' ? !hasRecordedLength(values) : !isRecordedFact(values[fact]))
      .map((fact) => FACT_QUESTIONS[fact]);
    gaps.push({goal, label: GOAL_LABELS[goal], missing});
  }
  return gaps;
}
