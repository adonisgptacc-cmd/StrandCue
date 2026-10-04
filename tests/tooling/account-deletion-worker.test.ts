import { describe, expect, it, vi } from 'vitest';
import { processAccountDeletion } from '../../scripts/account-deletion-worker.ts';

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
