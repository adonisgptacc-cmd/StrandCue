import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASELINE, DAY } from './harness.ts';

const enabled = process.env.STRANDCUE_SUPABASE_API_TEST === '1';
const describeLocal = enabled ? describe : describe.skip;

describeLocal('local Supabase Auth and PostgREST permissions', () => {
  const url = process.env.STRANDCUE_SUPABASE_URL ?? '';
  const publishableKey = process.env.STRANDCUE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const secretKey = process.env.STRANDCUE_SUPABASE_SECRET_KEY ?? '';
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const password = `Local-only-${suffix}-Aa1!`;
  const ids: string[] = [];
  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    if (!url || !publishableKey || !secretKey) {
      throw new Error('Local Supabase URL, publishable key and secret key are required');
    }

    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient(url, secretKey, options);

    const createUser = async (label: string) => {
      const email = `strandcue-${label}-${suffix}@example.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      ids.push(data.user.id);

      const client = createClient(url, publishableKey, options);
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error) throw signIn.error;
      return { client, id: data.user.id };
    };

    const a = await createUser('a');
    const b = await createUser('b');
    userA = a.client;
    userAId = a.id;
    userB = b.client;
    userBId = b.id;
  }, 30_000);

  afterAll(async () => {
    await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
  });

  it('enforces verified onboarding and owner-scoped reads through PostgREST', async () => {
    const accountA = await userA.rpc('complete_account', {
      p_username: `api_a_${suffix}`,
      p_eligible: true,
    });
    expect(accountA.error).toBeNull();
    expect(accountA.data).toMatchObject({ userId: userAId, username: `api_a_${suffix}` });

    const accountB = await userB.rpc('complete_account', {
      p_username: `api_b_${suffix}`,
      p_eligible: true,
    });
    expect(accountB.error).toBeNull();

    const aProfiles = await userA.from('profiles').select('user_id');
    const bProfiles = await userB.from('profiles').select('user_id');
    expect(aProfiles.error).toBeNull();
    expect(aProfiles.data).toEqual([{ user_id: userAId }]);
    expect(bProfiles.error).toBeNull();
    expect(bProfiles.data).toEqual([{ user_id: userBId }]);

    const anonymous = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonymousRead = await anonymous.from('profiles').select('user_id');
    expect(anonymousRead.error?.code).toBe('42501');
  });

  it('denies direct writes and preserves retry-safe owner mutations through RPC', async () => {
    const directProfileWrite = await userA
      .from('profiles')
      .update({ user_id: userBId })
      .eq('user_id', userAId);
    expect(directProfileWrite.error?.code).toBe('42501');

    const directHistoryWrite = await userA.from('passport_revisions').insert({
      user_id: userAId,
      passport_id: crypto.randomUUID(),
      sequence: 1,
      base_revision: 0,
      kind: 'baseline',
      effective_date: DAY,
      source: 'user-reported',
      patch: BASELINE,
    });
    expect(directHistoryWrite.error?.code).toBe('42501');

    const operationId = crypto.randomUUID();
    const mutation = {
      p_operation_id: operationId,
      p_expected_revision: 0,
      p_kind: 'baseline',
      p_effective_date: DAY,
      p_patch: BASELINE,
      p_corrects_id: null,
      p_correction_reason: null,
    };
    const first = await userA.rpc('mutate_passport', mutation);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ revision: 1 });

    const retry = await userA.rpc('mutate_passport', mutation);
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);

    const conflictingRetry = await userA.rpc('mutate_passport', {
      ...mutation,
      p_patch: { ...BASELINE, density: 'high' },
    });
    expect(conflictingRetry.error?.code).toBe('23505');

    const bHistory = await userB.from('passport_revisions').select('id');
    expect(bHistory.error).toBeNull();
    expect(bHistory.data).toEqual([]);
  });
});
