import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  processAccountDeletion,
  type DeletionWorkerClient,
} from './core.ts';
import {
  processRetentionCleanup,
  type RetentionCounts,
  type RetentionWorkerClient,
} from './retention.ts';

export type WorkerEnv = {
  STRANDCUE_SUPABASE_URL: string;
  STRANDCUE_SUPABASE_SERVICE_KEY: string;
};

type Dependencies = {
  createClient: (url: string, key: string) => DeletionWorkerClient;
  processDeletion: typeof processAccountDeletion;
  log: (metric: WorkerMetric) => void;
  now: () => number;
};

type WorkerMetric = {
  event: 'account_deletion_worker_run';
  outcome: 'idle' | 'deleted' | 'failed';
  jobs: 0 | 1;
  durationMs: number;
};

type RetentionMetric = {
  event: 'retention_cleanup_run';
  outcome: 'completed' | 'failed';
  exportsPurged: number;
  executionsPurged: number;
  eventsPurged: number;
  operationsPurged: number;
  durationMs: number;
};

type RetentionDependencies = {
  createClient: (url: string, key: string) => RetentionWorkerClient;
  processRetention: typeof processRetentionCleanup;
  log: (metric: RetentionMetric) => void;
  now: () => number;
};

function defaultCreateClient(url: string, key: string) {
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as DeletionWorkerClient;
}

export const defaultDependencies: Dependencies = {
  createClient: defaultCreateClient,
  processDeletion: processAccountDeletion,
  log: (metric) => console.log(metric),
  now: () => Date.now(),
};

export const defaultRetentionDependencies: RetentionDependencies = {
  createClient: defaultCreateClient,
  processRetention: processRetentionCleanup,
  log: (metric) => console.log(metric),
  now: () => Date.now(),
};

function validateEnvironment(env: WorkerEnv) {
  if (!env.STRANDCUE_SUPABASE_URL?.startsWith('https://')) {
    throw new Error('Secure Supabase URL required.');
  }
  if (!env.STRANDCUE_SUPABASE_SERVICE_KEY || env.STRANDCUE_SUPABASE_SERVICE_KEY.length < 20) {
    throw new Error('Supabase service key required.');
  }
}

/** Runs one bounded claim and emits no account or provider response data. */
export async function runScheduledAccountDeletion(
  env: WorkerEnv,
  dependencies: Dependencies = defaultDependencies,
) {
  validateEnvironment(env);
  const startedAt = dependencies.now();
  const client = dependencies.createClient(
    env.STRANDCUE_SUPABASE_URL,
    env.STRANDCUE_SUPABASE_SERVICE_KEY,
  );
  try {
    const outcome = await dependencies.processDeletion(client);
    dependencies.log({
      event: 'account_deletion_worker_run',
      outcome,
      jobs: outcome === 'deleted' ? 1 : 0,
      durationMs: Math.max(0, dependencies.now() - startedAt),
    });
    return outcome;
  } catch {
    dependencies.log({
      event: 'account_deletion_worker_run',
      outcome: 'failed',
      jobs: 0,
      durationMs: Math.max(0, dependencies.now() - startedAt),
    });
    throw new Error('Account deletion worker failed.');
  }
}

/** Runs one deterministic retention pass and emits counts only, no records. */
export async function runScheduledRetention(
  env: WorkerEnv,
  dependencies: RetentionDependencies = defaultRetentionDependencies,
): Promise<RetentionCounts> {
  validateEnvironment(env);
  const startedAt = dependencies.now();
  const client = dependencies.createClient(
    env.STRANDCUE_SUPABASE_URL,
    env.STRANDCUE_SUPABASE_SERVICE_KEY,
  );
  const zeroed = { exportsPurged: 0, executionsPurged: 0, eventsPurged: 0, operationsPurged: 0 };
  try {
    const counts = await dependencies.processRetention(client);
    dependencies.log({
      event: 'retention_cleanup_run',
      outcome: 'completed',
      ...counts,
      durationMs: Math.max(0, dependencies.now() - startedAt),
    });
    return counts;
  } catch {
    dependencies.log({
      event: 'retention_cleanup_run',
      outcome: 'failed',
      ...zeroed,
      durationMs: Math.max(0, dependencies.now() - startedAt),
    });
    throw new Error('Retention cleanup worker failed.');
  }
}

export default {
  scheduled(_controller: unknown, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(runScheduledPasses(env));
  },
};

/**
 * Runs the deletion pass and the retention pass independently.
 * The environment is validated once up front; per-runner validation is
 * retained as idempotent defense-in-depth. Each pass emits its own
 * completed/failed metric via its runner, and a failure in either pass
 * never prevents the other from running. Rejects with a fixed string
 * (no provider, account, URL, or secret content) iff either pass failed.
 */
export async function runScheduledPasses(
  env: WorkerEnv,
  deletionDependencies: Dependencies = defaultDependencies,
  retentionDependencies: RetentionDependencies = defaultRetentionDependencies,
): Promise<void> {
  validateEnvironment(env);
  let failed = false;
  try {
    await runScheduledAccountDeletion(env, deletionDependencies);
  } catch {
    failed = true;
  }
  try {
    await runScheduledRetention(env, retentionDependencies);
  } catch {
    failed = true;
  }
  if (failed) {
    throw new Error('Scheduled workers failed.');
  }
}
