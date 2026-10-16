import type { DeletionWorkerClient, Result } from './core.ts';

/** Minimal client surface for the retention pass: scheduler RPC only. */
export type RetentionWorkerClient = Pick<DeletionWorkerClient, 'rpc'>;

export type RetentionCounts = {
  exportsPurged: number;
  executionsPurged: number;
  eventsPurged: number;
  operationsPurged: number;
  consentsPurged: number;
};

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Invalid retention receipt.');
  }
  return value;
}

function parseExecutionReceipt(data: unknown): {
  executionsPurged: number;
  eventsPurged: number;
  operationsPurged: number;
} {
  if (typeof data !== 'object' || data === null) throw new Error('Invalid retention receipt.');
  const receipt = data as Record<string, unknown>;
  return {
    executionsPurged: parseCount(receipt.executions),
    eventsPurged: parseCount(receipt.events),
    operationsPurged: parseCount(receipt.operations),
  };
}

/**
 * One deterministic retention pass: expired export documents first, then
 * expired terminal executions, then expired superseded/deleted-owner
 * consent history. The consent purge is independent of the execution
 * purge — the order is fixed (exports, executions, consent) and documented
 * here so receipts stay comparable run over run. Deletion records are
 * retained by the legal rule (restore detection + append-only audit
 * trail), so no deletion RPC is called here. Throws fixed messages only;
 * provider detail never leaves.
 */
export async function processRetentionCleanup(
  client: RetentionWorkerClient,
  asOfIso: string = new Date().toISOString(),
): Promise<RetentionCounts> {
  const exported: Result = await client.rpc('export_retention_cleanup', {});
  if (exported.error) throw new Error('Retention cleanup failed.');
  const executions: Result = await client.rpc('protocol_execution_retention_cleanup', {});
  if (executions.error) throw new Error('Retention cleanup failed.');
  let partial: Omit<RetentionCounts, 'consentsPurged'>;
  try {
    partial = {
      exportsPurged: parseCount(exported.data),
      ...parseExecutionReceipt(executions.data),
    };
  } catch {
    throw new Error('Retention cleanup failed.');
  }
  const consents: Result = await client.rpc('consent_retention_cleanup', { p_as_of: asOfIso });
  if (consents.error) throw new Error('Retention cleanup failed.');
  try {
    return { ...partial, consentsPurged: parseCount(consents.data) };
  } catch {
    throw new Error('Retention cleanup failed.');
  }
}
