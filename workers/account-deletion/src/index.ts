import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  processAccountDeletion,
  type DeletionWorkerClient,
} from './core.ts';

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

const defaultDependencies: Dependencies = {
  createClient: (url, key) => createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as DeletionWorkerClient,
  processDeletion: processAccountDeletion,
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

export default {
  scheduled(_controller: unknown, env: WorkerEnv, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(runScheduledAccountDeletion(env));
  },
};
