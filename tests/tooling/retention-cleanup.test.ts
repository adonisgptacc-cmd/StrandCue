import { describe, expect, it, vi } from 'vitest';
import { processRetentionCleanup } from '../../workers/account-deletion/src/retention.ts';
import { runScheduledRetention } from '../../workers/account-deletion/src/index.ts';

type RpcResponse = { data: unknown; error: { code?: string; message?: string; status?: number } | null };

function client(schedule: RpcResponse[]) {
  const rpc = vi.fn();
  for (const response of schedule) rpc.mockResolvedValueOnce(response);
  return { rpc };
}

const env = {
  STRANDCUE_SUPABASE_URL: 'https://project.supabase.co',
  STRANDCUE_SUPABASE_SERVICE_KEY: 'service-role-key-with-enough-characters',
};

describe('deterministic retention cleanup worker', () => {
  it('purges expired exports then expired executions and reports counts', async () => {
    const rpcClient = client([
      { data: 2, error: null },
      { data: { executions: 1, events: 3, operations: 4 }, error: null },
    ]);
    const result = await processRetentionCleanup(rpcClient);
    expect(result).toEqual({
      exportsPurged: 2,
      executionsPurged: 1,
      eventsPurged: 3,
      operationsPurged: 4,
    });
    expect(rpcClient.rpc).toHaveBeenNthCalledWith(1, 'export_retention_cleanup', {});
    expect(rpcClient.rpc).toHaveBeenNthCalledWith(2, 'protocol_execution_retention_cleanup', {});
  });

  it('fails closed without leaking provider detail when export cleanup errors', async () => {
    const rpcClient = client([{ data: null, error: null }]);
    rpcClient.rpc.mockReset().mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'row-level security refusal with secret context' },
    });
    await expect(processRetentionCleanup(rpcClient)).rejects.toThrow('Retention cleanup failed.');
    expect(rpcClient.rpc).toHaveBeenCalledTimes(1);
  });

  it('fails closed when execution cleanup errors after exports', async () => {
    const rpcClient = client([
      { data: 1, error: null },
      { data: null, error: { code: 'P0001', message: 'private database detail' } },
    ]);
    await expect(processRetentionCleanup(rpcClient)).rejects.toThrow('Retention cleanup failed.');
    expect(rpcClient.rpc).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed cleanup receipts instead of reporting them', async () => {
    const rpcClient = client([
      { data: 1, error: null },
      { data: { executions: 'many' }, error: null },
    ]);
    await expect(processRetentionCleanup(rpcClient)).rejects.toThrow('Retention cleanup failed.');
  });

  it('rejects non-integer and negative counts', async () => {
    const fractional = client([
      { data: 1.5, error: null },
      { data: { executions: 0, events: 0, operations: 0 }, error: null },
    ]);
    await expect(processRetentionCleanup(fractional)).rejects.toThrow('Retention cleanup failed.');
    const negative = client([
      { data: 0, error: null },
      { data: { executions: -1, events: 0, operations: 0 }, error: null },
    ]);
    await expect(processRetentionCleanup(negative)).rejects.toThrow('Retention cleanup failed.');
    const missing = client([
      { data: 0, error: null },
      { data: null, error: null },
    ]);
    await expect(processRetentionCleanup(missing)).rejects.toThrow('Retention cleanup failed.');
  });
});

describe('private scheduled retention worker', () => {
  it('emits a redacted operational metric with purge counts', async () => {
    const rpcClient = client([
      { data: 2, error: null },
      { data: { executions: 1, events: 3, operations: 4 }, error: null },
    ]);
    const processRetention = vi.fn().mockResolvedValue({
      exportsPurged: 2, executionsPurged: 1, eventsPurged: 3, operationsPurged: 4,
    });
    const log = vi.fn();
    await expect(
      runScheduledRetention(env, {
        createClient: () => rpcClient, processRetention, log, now: () => 42,
      }),
    ).resolves.toEqual({
      exportsPurged: 2, executionsPurged: 1, eventsPurged: 3, operationsPurged: 4,
    });
    expect(processRetention).toHaveBeenCalledExactlyOnceWith(rpcClient);
    expect(log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run',
      outcome: 'completed',
      exportsPurged: 2,
      executionsPurged: 1,
      eventsPurged: 3,
      operationsPurged: 4,
      durationMs: 0,
    });
  });

  it('reports a fixed failure metric and preserves scheduler failure status', async () => {
    const log = vi.fn();
    const providerError = new Error('private provider response containing secret material');
    const processRetention = vi.fn().mockRejectedValue(providerError);
    await expect(
      runScheduledRetention(env, {
        createClient: () => client([]), processRetention, log, now: () => 42,
      }),
    ).rejects.toThrow('Retention cleanup worker failed.');
    expect(log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run',
      outcome: 'failed',
      exportsPurged: 0,
      executionsPurged: 0,
      eventsPurged: 0,
      operationsPurged: 0,
      durationMs: 0,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(providerError.message);
  });

  it('rejects insecure endpoints before creating a privileged client', async () => {
    const createClient = vi.fn();
    await expect(
      runScheduledRetention({ ...env, STRANDCUE_SUPABASE_URL: 'http://example.com' }, {
        createClient, processRetention: vi.fn(), log: vi.fn(), now: () => 42,
      }),
    ).rejects.toThrow('Secure Supabase URL required');
    expect(createClient).not.toHaveBeenCalled();
  });
});
