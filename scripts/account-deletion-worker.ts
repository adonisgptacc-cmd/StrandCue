import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  processAccountDeletion,
  type DeletionWorkerClient,
} from '../workers/account-deletion/src/core.ts';

export { processAccountDeletion };
export type { DeletionWorkerClient };

export async function runAccountDeletionWorker() {
  const url = z.url().parse(process.env.STRANDCUE_SUPABASE_URL);
  if (!url.startsWith('https://') && !url.startsWith('http://127.0.0.1:')) throw new Error('Secure Supabase URL required.');
  const key = z.string().min(20).parse(process.env.STRANDCUE_SUPABASE_SERVICE_KEY);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return processAccountDeletion(client);
}
