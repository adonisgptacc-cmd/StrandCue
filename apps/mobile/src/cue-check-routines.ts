import type { ProtocolExecutionHistory } from './guidance/protocol-execution-api';
import { isTerminalStatus } from './cue-check-entry';

/**
 * The routines a Cue Check can be about, taken from the owner's own
 * server-confirmed execution history. Only identity, terminal status and the
 * finish time are read: no step, deviation or decision text is carried into
 * the Cue Check surface.
 */

export interface RoutineSummary {
  readonly executionId: string;
  readonly status: 'completed' | 'abandoned';
  readonly finishedAt: string | null;
}

function finishTime(execution: unknown): string | null {
  if (execution === null || typeof execution !== 'object') return null;
  const value = (execution as { finishedAt?: unknown }).finishedAt;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function parseRoutines(history: Pick<ProtocolExecutionHistory, 'items'>): readonly RoutineSummary[] {
  const routines: RoutineSummary[] = [];
  for (const item of history.items) {
    if (!isTerminalStatus(item.status)) continue;
    routines.push({ executionId: item.executionId, status: item.status, finishedAt: finishTime(item.execution) });
  }
  return routines;
}
