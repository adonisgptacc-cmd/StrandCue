export type Result = {
  data: unknown;
  error: { code?: string; message?: unknown; status?: number } | null;
};

export type DeletionWorkerClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
  auth: { admin: { deleteUser: (id: string, soft: boolean) => PromiseLike<Result> } };
};

function parseClaim(value: unknown) {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid deletion claim.');
  const { userId, lease } = value as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof lease !== 'string') throw new Error('Invalid deletion claim.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId) || !uuid.test(lease)) throw new Error('Invalid deletion claim.');
  return { userId, lease };
}

const isAlreadyDeleted = (result: Result) =>
  result.error === null
  || result.error.code === 'user_not_found'
  || (result.error.status === 404 && /user.*not.*found/i.test(String(result.error.message)));

/** One invocation processes at most one account. No user token is retained. */
export async function processAccountDeletion(client: DeletionWorkerClient) {
  const claimed = await client.rpc('deletion_worker_claim', { p_lease: crypto.randomUUID() });
  if (claimed.error) throw new Error('Deletion claim failed.');
  if (claimed.data === null) return 'idle' as const;
  const job = parseClaim(claimed.data);
  let failed = false;
  try {
    const removed = await client.auth.admin.deleteUser(job.userId, false);
    failed = !isAlreadyDeleted(removed);
  } catch {
    failed = true;
  }
  const receipt = await client.rpc('deletion_worker_finish', {
    p_user_id: job.userId,
    p_lease: job.lease,
    p_error: failed ? 'auth-delete-failed' : null,
  });
  if (receipt.error || receipt.data !== true) throw new Error('Deletion receipt failed; retry after lease expiry.');
  if (failed) throw new Error('Auth deletion failed; retry scheduled.');
  return 'deleted' as const;
}
