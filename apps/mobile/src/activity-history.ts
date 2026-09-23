export type UnifiedHistorySource = 'passport' | 'service' | 'activity';

export interface UnifiedHistoryEffectiveDate {
  precision: string;
  value: string | null;
}

export interface UnifiedHistoryInput {
  id: string;
  source: UnifiedHistorySource;
  kind: string;
  title: string;
  effectiveDate: UnifiedHistoryEffectiveDate;
  recordedAt: string;
  superseded?: boolean;
  supersedesId?: string;
  voided?: boolean;
  reason?: string | null;
}

export interface UnifiedHistoryEntry extends UnifiedHistoryInput {
  superseded: boolean;
  voided: boolean;
}

export type ActivityEditorMode = 'add' | 'correction' | 'void';

export function activityEditorCopy(mode: ActivityEditorMode) {
  return {
    add: { title: 'Record an activity', submit: 'Save activity' },
    correction: { title: 'Correct this activity entry', submit: 'Save correction' },
    void: { title: 'Void this activity entry', submit: 'Void activity' },
  }[mode];
}

export function activityView(loading: boolean, items: readonly unknown[], detail: unknown) {
  return detail ? 'detail' : items.length ? 'list' : loading ? 'loading' : 'empty';
}

export function appendActivityPage<T extends { id: string }>(previous: readonly T[], page: readonly T[]): T[] {
  return [...previous, ...page.filter(item => !previous.some(existing => existing.id === item.id))];
}

export function activityDateLabel(date: UnifiedHistoryEffectiveDate): string {
  if (date.precision === 'unknown' || date.value === null) return 'Date unknown';
  if (date.precision === 'day' || date.precision === 'exact_day') return date.value;
  return `Approximately ${date.value}`;
}

// Sort key for the unified timeline. Approximate month/year precision sorts
// at the end of its period so precisely dated events in the same period come
// first; unknown dates sort last. Deterministic across clients.
function effectiveSortKey(date: UnifiedHistoryEffectiveDate): string | null {
  if (date.precision === 'unknown' || date.value === null) return null;
  if (date.precision === 'month' || date.precision === 'exact_month') return `${date.value}-99`;
  if (date.precision === 'year' || date.precision === 'exact_year') return `${date.value}-99-99`;
  return date.value;
}

export function composeUnifiedHistory(
  entries: readonly UnifiedHistoryInput[],
  options: { includeAudit?: boolean } = {},
): UnifiedHistoryEntry[] {
  const normalized: UnifiedHistoryEntry[] = entries.map(entry => ({
    ...entry,
    superseded: entry.superseded ?? false,
    voided: entry.voided ?? entry.kind === 'void',
  }));
  const visible = options.includeAudit
    ? normalized
    : normalized.filter(entry => !entry.superseded && !entry.voided);
  return [...visible].sort((left, right) => {
    const leftKey = effectiveSortKey(left.effectiveDate);
    const rightKey = effectiveSortKey(right.effectiveDate);
    if (leftKey === null && rightKey === null) return left.recordedAt < right.recordedAt ? -1 : left.recordedAt > right.recordedAt ? 1 : 0;
    if (leftKey === null) return 1;
    if (rightKey === null) return -1;
    if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
    // Same effective date: newest first so a correction or void reads before
    // the entry it supersedes; id breaks remaining ties deterministically.
    if (left.recordedAt !== right.recordedAt) return left.recordedAt > right.recordedAt ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}
