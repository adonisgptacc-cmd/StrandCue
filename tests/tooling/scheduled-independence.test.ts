import { describe, expect, it, vi } from 'vitest';
import scheduledWorker, {
  defaultDependencies,
  defaultRetentionDependencies,
  runScheduledPasses,
} from '../../workers/account-deletion/src/index.ts';

const env = {
  STRANDCUE_SUPABASE_URL: 'https://project.supabase.co',
  STRANDCUE_SUPABASE_SERVICE_KEY: 'service-role-key-with-enough-characters',
};

const counts = { exportsPurged: 2, executionsPurged: 1, eventsPurged: 3, operationsPurged: 4 };

function deletionDeps(overrides: Record<string, unknown> = {}) {
  return {
    createClient: (() => ({})) as never,
    processDeletion: vi.fn().mockResolvedValue('deleted'),
    log: vi.fn(),
    now: () => 42,
    ...overrides,
  };
}

function retentionDeps(overrides: Record<string, unknown> = {}) {
  return {
    createClient: (() => ({})) as never,
    processRetention: vi.fn().mockResolvedValue(counts),
    log: vi.fn(),
    now: () => 42,
    ...overrides,
  };
}

describe('independent scheduled deletion and retention passes', () => {
  it('runs retention when deletion rejects and emits both metrics', async () => {
    const providerError = new Error('private provider response with secret https://internal and key material');
    const d = deletionDeps({ processDeletion: vi.fn().mockRejectedValue(providerError) });
    const r = retentionDeps();
    await expect(runScheduledPasses(env, d, r)).rejects.toThrow('Scheduled workers failed.');
    expect(d.processDeletion).toHaveBeenCalledTimes(1);
    expect(r.processRetention).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledExactlyOnceWith({
      event: 'account_deletion_worker_run', outcome: 'failed', jobs: 0, durationMs: 0,
    });
    expect(r.log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run', outcome: 'completed', ...counts, durationMs: 0,
    });
  });

  it('runs deletion when retention rejects and emits both metrics', async () => {
    const providerError = new Error('private retention detail');
    const d = deletionDeps();
    const r = retentionDeps({ processRetention: vi.fn().mockRejectedValue(providerError) });
    await expect(runScheduledPasses(env, d, r)).rejects.toThrow('Scheduled workers failed.');
    expect(d.processDeletion).toHaveBeenCalledTimes(1);
    expect(r.processRetention).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledExactlyOnceWith({
      event: 'account_deletion_worker_run', outcome: 'deleted', jobs: 1, durationMs: 0,
    });
    expect(r.log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run', outcome: 'failed',
      exportsPurged: 0, executionsPurged: 0, eventsPurged: 0, operationsPurged: 0, durationMs: 0,
    });
  });

  it('completes both metrics when both passes succeed', async () => {
    const d = deletionDeps();
    const r = retentionDeps();
    await expect(runScheduledPasses(env, d, r)).resolves.toBeUndefined();
    expect(d.log).toHaveBeenCalledExactlyOnceWith({
      event: 'account_deletion_worker_run', outcome: 'deleted', jobs: 1, durationMs: 0,
    });
    expect(r.log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run', outcome: 'completed', ...counts, durationMs: 0,
    });
  });

  it('emits both failed metrics when both passes fail and rejects with a fixed string', async () => {
    const d = deletionDeps({ processDeletion: vi.fn().mockRejectedValue(new Error('secret deletion https://internal')) });
    const r = retentionDeps({ processRetention: vi.fn().mockRejectedValue(new Error('secret retention material')) });
    await expect(runScheduledPasses(env, d, r)).rejects.toThrow(/^Scheduled workers failed\.$/);
    expect(d.log).toHaveBeenCalledExactlyOnceWith({
      event: 'account_deletion_worker_run', outcome: 'failed', jobs: 0, durationMs: 0,
    });
    expect(r.log).toHaveBeenCalledExactlyOnceWith({
      event: 'retention_cleanup_run', outcome: 'failed',
      exportsPurged: 0, executionsPurged: 0, eventsPurged: 0, operationsPurged: 0, durationMs: 0,
    });
  });

  it('rejects with a fixed string that leaks no provider or credential content', async () => {
    const secret = 'super-secret-key-material-https://internal.example/x';
    const d = deletionDeps({ processDeletion: vi.fn().mockRejectedValue(new Error(secret)) });
    const r = retentionDeps();
    const outcome = await runScheduledPasses(env, d, r).then(
      () => { throw new Error('expected rejection'); },
      (error: unknown) => error,
    );
    expect((outcome as Error).message).toBe('Scheduled workers failed.');
    expect(JSON.stringify([d.log.mock.calls, r.log.mock.calls])).not.toContain(secret);
  });

  it('validates the environment once before either pass runs', async () => {
    const d = deletionDeps({ createClient: vi.fn() });
    const r = retentionDeps({ createClient: vi.fn() });
    await expect(
      runScheduledPasses({ ...env, STRANDCUE_SUPABASE_URL: 'http://example.com' }, d, r),
    ).rejects.toThrow('Secure Supabase URL required');
    expect(d.createClient).not.toHaveBeenCalled();
    expect(r.createClient).not.toHaveBeenCalled();
    expect(d.processDeletion).not.toHaveBeenCalled();
    expect(r.processRetention).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
    expect(r.log).not.toHaveBeenCalled();
  });

  it('rejects a short service key before creating any client', async () => {
    const d = deletionDeps({ createClient: vi.fn() });
    const r = retentionDeps({ createClient: vi.fn() });
    await expect(
      runScheduledPasses({ ...env, STRANDCUE_SUPABASE_SERVICE_KEY: 'too-short' }, d, r),
    ).rejects.toThrow('Supabase service key required');
    expect(d.createClient).not.toHaveBeenCalled();
    expect(r.createClient).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
    expect(r.log).not.toHaveBeenCalled();
  });

  it('routes the scheduled handler through the independent passes', async () => {
    const pending: Promise<unknown>[] = [];
    scheduledWorker.scheduled(null, { ...env, STRANDCUE_SUPABASE_URL: 'http://example.com' }, {
      waitUntil: (promise) => { pending.push(promise); },
    });
    expect(pending).toHaveLength(1);
    await expect(pending[0]).rejects.toThrow('Secure Supabase URL required');
  });

  it('exposes network-free defaults (client construction, clock, logging)', () => {
    const client = defaultDependencies.createClient(
      'https://project.supabase.co',
      'service-role-key-with-enough-characters',
    );
    expect(client).toBeDefined();
    expect(typeof defaultDependencies.now()).toBe('number');
    expect(typeof defaultRetentionDependencies.now()).toBe('number');
    const write = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      defaultDependencies.log({ event: 'account_deletion_worker_run', outcome: 'idle', jobs: 0, durationMs: 0 });
      defaultRetentionDependencies.log({
        event: 'retention_cleanup_run', outcome: 'completed',
        exportsPurged: 0, executionsPurged: 0, eventsPurged: 0, operationsPurged: 0, durationMs: 0,
      });
      expect(write).toHaveBeenCalledTimes(2);
    } finally {
      write.mockRestore();
    }
  });
});
