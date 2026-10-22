import {
  CueCheckRecordSchema,
  summarizePersonalOutcomes,
  type CueCheckGoal,
  type CueCheckObservationField,
  type CueCheckRecord,
  type CueCheckTiming,
  type PersonalOutcomeEvidence,
} from '../../../packages/domain/src/index';
import type { CueCheckReceipt } from './cue-check-api';
import { questionFor } from './cue-check-copy';

/**
 * Adapters between the server receipts Task 4.3 returns and the Task 4.1
 * domain functions. Nothing here re-implements summary logic: counts, wording
 * and the minimum sample all come from `summarizePersonalOutcomes`.
 */

const UNREADABLE_DATE = 'a date that could not be read';

/** A date and time in the device's own locale, for the owner's eyes. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNREADABLE_DATE;
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A date alone, used to tell routines apart. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNREADABLE_DATE;
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The server receipt as the domain's stored-record projection. */
export function receiptToRecord(receipt: CueCheckReceipt): CueCheckRecord {
  return CueCheckRecordSchema.parse({
    recordId: receipt.recordId,
    executionId: receipt.executionId,
    recommendationRunId: receipt.recommendationRunId,
    goal: receipt.goal,
    revision: receipt.revision,
    lifecycle: receipt.lifecycle,
    ...receipt.observation,
  });
}

export interface SummaryEntry {
  readonly wording: string;
  readonly numerator: number;
  readonly denominator: number;
}

export interface SummaryRow {
  readonly key: string;
  readonly goal: CueCheckGoal;
  readonly observation: CueCheckObservationField;
  readonly label: string;
  readonly timing: CueCheckTiming;
  readonly evidence: PersonalOutcomeEvidence;
  /** Definite comparable answers; explicit "not sure" answers are not in it. */
  readonly denominator: number;
  readonly unknownCount: number;
  readonly entries: readonly SummaryEntry[];
}

export interface SummaryGroup {
  readonly timing: CueCheckTiming;
  readonly rows: readonly SummaryRow[];
}

export type SummaryResult =
  | { readonly ok: true; readonly groups: readonly SummaryGroup[]; readonly goals: readonly CueCheckGoal[] }
  | { readonly ok: false };

/**
 * Summaries for the loaded check-ins. The domain emits one entry per answer
 * value, so below the minimum the same insufficient sentence repeats; rows
 * fold those into one line per question. Any record the domain refuses
 * fails the whole summary closed rather than producing dishonest counts.
 */
export function summarizeReceipts(items: readonly CueCheckReceipt[]): SummaryResult {
  try {
    const records = items.map(receiptToRecord);
    const goals = [...new Set(records.map(record => record.goal))];
    const rows = new Map<string, { row: Omit<SummaryRow, 'entries'>; entries: SummaryEntry[] }>();
    for (const goal of goals) {
      for (const summary of summarizePersonalOutcomes(records, { goal })) {
        const key = `${goal}:${summary.timing}:${summary.observation}`;
        let slot = rows.get(key);
        if (slot === undefined) {
          slot = {
            row: {
              key,
              goal,
              observation: summary.observation,
              label: questionFor(summary.observation).label,
              timing: summary.timing,
              evidence: summary.evidence,
              denominator: summary.denominator,
              unknownCount: summary.unknownCount,
            },
            entries: [],
          };
          rows.set(key, slot);
        }
        if (summary.evidence === 'sufficient') {
          slot.entries.push({ wording: summary.wording, numerator: summary.numerator, denominator: summary.denominator });
        } else if (slot.entries.length === 0) {
          slot.entries.push({ wording: summary.wording, numerator: summary.numerator, denominator: summary.denominator });
        }
      }
    }
    const groups: SummaryGroup[] = [];
    for (const timing of ['immediate', 'delayed'] as const) {
      const timed = [...rows.values()].filter(slot => slot.row.timing === timing).map(slot => ({ ...slot.row, entries: slot.entries }));
      if (timed.length > 0) groups.push({ timing, rows: timed });
    }
    return { ok: true, groups, goals };
  } catch {
    return { ok: false };
  }
}
