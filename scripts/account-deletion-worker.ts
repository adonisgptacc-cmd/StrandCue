import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const Claim = z.object({ userId: z.uuid(), lease: z.uuid() });
type Result = { data: unknown; error: { code?: string; status?: number } | null };
export type DeletionWorkerClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
  auth: { admin: { deleteUser: (id: string, soft: boolean) => PromiseLike<Result> } };
};

const isAlreadyDeleted = (result: Result) =>
  result.error === null
  || result.error.code === 'user_not_found'
  || (result.error.status === 404 && /user.*not.*found/i.test(String((result.error as { message?: unknown }).message)));

/** One invocation processes at most one account. No user token is retained. */
export async function processAccountDeletion(client: DeletionWorkerClient) {
  const claimed = await client.rpc('deletion_worker_claim', { p_lease: randomUUID() });
  if (claimed.error) throw new Error('Deletion claim failed.');
  if (claimed.data === null) return 'idle';
  const job = Claim.parse(claimed.data);
  let failed = false;
  try {
    const removed = await client.auth.admin.deleteUser(job.userId, false);
    // A crash after deletion but before receipt is safe: absent user is done.
    failed = !isAlreadyDeleted(removed);
  } catch {
    failed = true;
  }
  const receipt = await client.rpc('deletion_worker_finish', {
    p_user_id: job.userId, p_lease: job.lease,
    p_error: failed ? 'auth-delete-failed' : null,
  });
  if (receipt.error || receipt.data !== true) throw new Error('Deletion receipt failed; retry after lease expiry.');
  if (failed) throw new Error('Auth deletion failed; retry scheduled.');
  return 'deleted';
}

export async function runAccountDeletionWorker() {
  const url = z.url().parse(process.env.STRANDCUE_SUPABASE_URL);
  if (!url.startsWith('https://') && !url.startsWith('http://127.0.0.1:')) throw new Error('Secure Supabase URL required.');
  const key = z.string().min(20).parse(process.env.STRANDCUE_SUPABASE_SERVICE_KEY);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return processAccountDeletion(client);
}
