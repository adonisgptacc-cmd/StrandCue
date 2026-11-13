import { describe, expect, it, vi } from 'vitest';
import { processAccountDeletion } from '../../scripts/account-deletion-worker.ts';
import scheduledWorker, { runScheduledAccountDeletion } from '../../workers/account-deletion/src/index.ts';

const userId='11111111-1111-4111-8111-111111111111';
const lease='22222222-2222-4222-8222-222222222222';
function worker(error: { code?: string; message?: string; status?: number } | null = null, receipt = true) {
  const rpc=vi.fn().mockResolvedValueOnce({data:{userId,lease},error:null})
    .mockResolvedValueOnce({data:receipt,error:null});
  const deleteUser=vi.fn().mockResolvedValue({data:null,error});
  return {rpc,auth:{admin:{deleteUser}}};
}
describe('bounded account deletion worker',()=>{
  it('hard deletes Auth and records success',async()=>{
    const client=worker();
    expect(await processAccountDeletion(client)).toBe('deleted');
    expect(client.auth.admin.deleteUser).toHaveBeenCalledExactlyOnceWith(userId,false);
    expect(client.rpc).toHaveBeenLastCalledWith('deletion_worker_finish',{p_user_id:userId,p_lease:lease,p_error:null});
  });
  it('retries safely after Auth deletion succeeded before a crash',async()=>{
    const client=worker({code:'user_not_found'});
    expect(await processAccountDeletion(client)).toBe('deleted');
  });
  it('treats a missing Auth identity status as an idempotent success',async()=>{
    const client=worker({message:'User not found',status:404});
    expect(await processAccountDeletion(client)).toBe('deleted');
    expect(client.rpc).toHaveBeenLastCalledWith('deletion_worker_finish',{p_user_id:userId,p_lease:lease,p_error:null});
  });
  it('does not mark a generic provider 404 as complete',async()=>{
    const client=worker({message:'Not Found',status:404});
    await expect(processAccountDeletion(client)).rejects.toThrow('retry scheduled');
    expect(client.rpc).toHaveBeenLastCalledWith('deletion_worker_finish',{p_user_id:userId,p_lease:lease,p_error:'auth-delete-failed'});
  });
  it('records only a fixed error code and schedules failures',async()=>{
    const client=worker({code:'unexpected'});
    await expect(processAccountDeletion(client)).rejects.toThrow('retry scheduled');
    expect(client.rpc).toHaveBeenLastCalledWith('deletion_worker_finish',{p_user_id:userId,p_lease:lease,p_error:'auth-delete-failed'});
  });
  it('does not claim completion after losing its lease',async()=>{
    await expect(processAccountDeletion(worker(null,false))).rejects.toThrow('receipt failed');
  });
  it('does no Auth operation for an empty queue',async()=>{
    const client=worker();client.rpc.mockReset().mockResolvedValue({data:null,error:null});
    expect(await processAccountDeletion(client)).toBe('idle');
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe('private scheduled account deletion worker',()=>{
  const env={
    STRANDCUE_SUPABASE_URL:'https://project.supabase.co',
    STRANDCUE_SUPABASE_SERVICE_KEY:'service-role-key-with-enough-characters',
  };

  it.each(['idle','deleted'] as const)('emits a redacted operational metric for %s',async(outcome)=>{
    const client=worker();
    const processDeletion=vi.fn().mockResolvedValue(outcome);
    const log=vi.fn();

    await expect(runScheduledAccountDeletion(env,{createClient:()=>client,processDeletion,log,now:()=>42})).resolves.toBe(outcome);

    expect(processDeletion).toHaveBeenCalledExactlyOnceWith(client);
    expect(log).toHaveBeenCalledExactlyOnceWith({
      event:'account_deletion_worker_run', outcome, jobs:outcome==='deleted'?1:0, durationMs:0,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(userId);
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.STRANDCUE_SUPABASE_SERVICE_KEY);
  });

  it('reports a fixed failure metric and preserves scheduler failure status',async()=>{
    const log=vi.fn();
    const providerError=new Error('private provider response containing secret material');
    const processDeletion=vi.fn().mockRejectedValue(providerError);

    await expect(runScheduledAccountDeletion(env,{createClient:()=>worker(),processDeletion,log,now:()=>42}))
      .rejects.toThrow('Account deletion worker failed.');

    expect(log).toHaveBeenCalledExactlyOnceWith({
      event:'account_deletion_worker_run', outcome:'failed', jobs:0, durationMs:0,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(providerError.message);
  });

  it('rejects insecure endpoints before creating a privileged client',async()=>{
    const createClient=vi.fn();
    await expect(runScheduledAccountDeletion({...env,STRANDCUE_SUPABASE_URL:'http://example.com'}, {
      createClient, processDeletion:vi.fn(), log:vi.fn(), now:()=>42,
    })).rejects.toThrow('Secure Supabase URL required');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('exposes only a scheduled handler',()=>{
    expect(Object.keys(scheduledWorker)).toEqual(['scheduled']);
    expect('fetch' in scheduledWorker).toBe(false);
  });
});
