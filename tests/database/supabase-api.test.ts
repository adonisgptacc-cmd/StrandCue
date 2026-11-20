import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASELINE, DAY } from './harness.ts';
import { processAccountDeletion } from '../../scripts/account-deletion-worker.ts';
import { createLocalSupabaseFetch, readLocalSupabaseTestConfig } from '../../scripts/local-supabase-test-target.ts';

// Validate before even constructing a Supabase client. No hosted target is accepted.
const config = readLocalSupabaseTestConfig(process.env);
const enabled = config !== null;
const describeLocal = enabled ? describe : describe.skip;

describeLocal('local Supabase Auth and PostgREST permissions', () => {
  const url = config?.url ?? '';
  const publishableKey = config?.publishableKey ?? '';
  const secretKey = config?.secretKey ?? '';
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const password = `Local-only-${suffix}-Aa1!`;
  let ids: string[] = [];
  // Every admin, owner, captured-JWT and anonymous request uses this transport.
  const options = () => ({ auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createLocalSupabaseFetch(url) } });
  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    if (!url || !publishableKey || !secretKey) {
      throw new Error('Local Supabase URL, publishable key and secret key are required');
    }

    admin = createClient(url, secretKey, options());

    const createUser = async (label: string) => {
      const email = `strandcue-${label}-${suffix}@example.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      ids = [...ids, data.user.id];

      const client = createClient(url, publishableKey, options());
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
    // Every focused API test requires active owner profiles. Repeating the
    // same completion in the onboarding test also checks its retry behavior.
    for (const [client, username] of [[userA, `api_a_${suffix}`], [userB, `api_b_${suffix}`]] as const) {
      const completion = await client.rpc('complete_account', { p_username: username, p_eligible: true });
      if (completion.error) throw completion.error;
    }
  }, 30_000);

  afterAll(async () => {
    const results = await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
    for (const result of results) expect(result.error, 'synthetic Auth user cleanup').toBeNull();
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

    const anonymous = createClient(url, publishableKey, options());
    const anonymousRead = await anonymous.from('profiles').select('user_id');
    expect(anonymousRead.error?.code).toBe('42501');
  });

  it('requires real email confirmation before password sign-in and onboarding', async () => {
    const email = `strandcue-unconfirmed-${suffix}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: false });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    ids = [...ids, id];
    const owner = createClient(url, publishableKey, options());
    const denied = await owner.auth.signInWithPassword({ email, password });
    expect(denied.error?.code).toBe('email_not_confirmed');
    expect(denied.data.session).toBeNull();
    expect((await owner.rpc('complete_account', { p_username: `api_verified_${suffix}`, p_eligible: true })).error?.code).toBe('42501');
    expect((await admin.auth.admin.updateUserById(id, { email_confirm: true })).error).toBeNull();
    const accepted = await owner.auth.signInWithPassword({ email, password });
    expect(accepted.error).toBeNull();
    expect(accepted.data.session?.user.id).toBe(id);
    expect((await owner.rpc('complete_account', { p_username: `api_verified_${suffix}`, p_eligible: true })).error).toBeNull();
  });

  it('enforces recommendation trust, owner isolation and retry conflicts through PostgREST', async () => {
    const requestId = crypto.randomUUID();
    const run = {
      p_request_id: requestId, p_input_fingerprint: 'a'.repeat(64), p_as_of: new Date().toISOString(),
      p_engine_version: 'api-fixture', p_bundle_id: 'api-synthetic', p_bundle_version: '1',
      p_status: 'content_pending', p_input: { requestId, goal: 'basic_wash' },
      // Even an executable-looking decision under an allowed status is untrusted.
      p_decision: { status: 'ready', requestId, steps: [] },
    };
    const forbidden = await userA.rpc('record_recommendation_run', { ...run, p_status: 'ready' });
    expect(forbidden.error).toMatchObject({ code: '42501', message: 'executable-status-forbidden' });
    const first = await userA.rpc('record_recommendation_run', run);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ requestId, status: 'content_pending' });
    expect((await userA.rpc('record_recommendation_run', run)).data).toEqual(first.data);
    expect((await userA.rpc('record_recommendation_run', { ...run, p_input_fingerprint: 'b'.repeat(64) })).error)
      .toMatchObject({ code: '23505', message: 'run-conflict' });
    const owned = await userA.from('recommendation_runs').select('request_id,trusted').eq('request_id', requestId);
    expect(owned.error).toBeNull();
    expect(owned.data).toEqual([{ request_id: requestId, trusted: false }]);
    const foreign = await userB.from('recommendation_runs').select('request_id').eq('request_id', requestId);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
    expect((await userA.from('recommendation_runs').update({ trusted: true }).eq('request_id', requestId)).error?.code).toBe('42501');
    expect((await userA.from('recommendation_runs').delete().eq('request_id', requestId)).error?.code).toBe('42501');
    const anonymous = createClient(url, publishableKey, options());
    expect((await anonymous.rpc('record_recommendation_run', run)).error?.code).toBe('42501');

    const start = { p_operation_id: crypto.randomUUID(), p_execution_id: crypto.randomUUID(),
      p_recommendation_run_id: requestId, p_started_at: new Date().toISOString() };
    expect((await userA.rpc('start_protocol_execution', start)).error)
      .toMatchObject({ code: '22023', message: 'untrusted-decision' });
    const foreignStart = await userB.rpc('start_protocol_execution', start);
    const missingStart = await userB.rpc('start_protocol_execution', { ...start, p_recommendation_run_id: crypto.randomUUID() });
    expect(foreignStart.error).toMatchObject({ code: '42501', message: 'run-not-owned' });
    expect(missingStart.error?.message).toBe(foreignStart.error?.message);
    expect((await anonymous.rpc('start_protocol_execution', start)).error?.code).toBe('42501');
    // PostgREST schema cache/signature resolution must not expose either removed
    // caller-supplied decision or caller-supplied result signature.
    expect((await userA.rpc('start_protocol_execution', { ...start, p_decision: run.p_decision })).error?.code).toBe('PGRST202');
    expect((await userA.rpc('apply_protocol_execution_command', {
      p_operation_id: crypto.randomUUID(), p_execution_id: start.p_execution_id,
      p_expected_revision: 0, p_command: { kind: 'pause' }, p_at: start.p_started_at, p_result: {},
    })).error?.code).toBe('PGRST202');
    const active = await userA.rpc('get_active_execution_with_decision');
    expect(active.error).toBeNull();
    expect(active.data).toBeNull();
    const history = await userA.rpc('list_protocol_executions', { p_limit: 10, p_cursor: null });
    expect(history.error).toBeNull();
    expect(history.data.items).toEqual([]);
    expect((await anonymous.rpc('get_active_execution_with_decision')).error?.code).toBe('42501');
  });

  it('hard deletes Auth, denies old JWT recreation and invalidates refresh tokens', async () => {
    const email=`strandcue-deletion-${suffix}@example.test`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
    expect(created.error).toBeNull();
    const id=created.data.user!.id;
    ids = [...ids, id];
    const owner=createClient(url,publishableKey,options());
    const login=await owner.auth.signInWithPassword({email,password});
    expect(login.error).toBeNull();
    const session=login.data.session!;
    const safeAmr=(JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()) as {amr:unknown}).amr;
    expect(safeAmr).toEqual(expect.arrayContaining([expect.objectContaining({method:'password',timestamp:expect.any(Number)})]));
    expect((await owner.rpc('complete_account',{p_username:`api_del_${suffix}`,p_eligible:true})).error).toBeNull();
    for(const name of ['deletion_worker_claim','deletion_purge','deletion_reapply','export_retention_cleanup','protocol_execution_retention_cleanup']) {
      const args=name==='deletion_worker_claim'?{p_lease:crypto.randomUUID()}:{};
      expect((await owner.rpc(name,args)).error?.code).toBe('42501');
    }
    expect((await owner.rpc('deletion_request',{p_operation_id:crypto.randomUUID(),p_reason:null})).error).toBeNull();
    expect((await owner.rpc('get_passport',{p_as_of:'2026-09-01'})).error?.code).toBe('42501');
    const workers=await Promise.all([processAccountDeletion(admin),processAccountDeletion(admin)]);
    expect([...workers].sort()).toEqual(['deleted','idle']);
    expect((await admin.auth.admin.getUserById(id)).error).not.toBeNull();
    ids = ids.filter(existing => existing !== id);
    // Use captured access JWT directly; no refresh or local auth-state change
    // may disguise the database tombstone guard's actual behavior.
    const old=createClient(url,publishableKey,{...options(),global:{...options().global,headers:{Authorization:`Bearer ${session.access_token}`}}});
    const recreated=await old.rpc('complete_account',{p_username:`api_del_${suffix}`,p_eligible:true});
    expect(recreated.error?.code).toBe('42501');
    expect(recreated.error?.message).toMatch(/account-deleted/);
    expect((await old.from('profiles').select('user_id')).data).toEqual([]);
    const refresh=await owner.auth.refreshSession({refresh_token:session.refresh_token});
    expect(refresh.error).not.toBeNull();
    expect((await userB.from('profiles').select('user_id')).data).toEqual([{user_id:userBId}]);
    expect(await processAccountDeletion(admin)).toBe('idle');
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

  it('preserves Chemical Service history through authenticated RPC and rejects foreign/anonymous access', async () => {
    const serviceId = crypto.randomUUID();
    const mutation = {
      p_operation_id: crypto.randomUUID(), p_service_id: serviceId,
      p_facts: { serviceType: 'nanoplasty', occurredOn: DAY,
        zones: [{ region: 'front', segment: 'roots' }],
        heat: { method: 'unknown', temperatureC: null, source: 'user-reported' } },
      p_initial_observation: { observedOn: DAY, effectStatus: 'present' },
    };
    const first = await userA.rpc('record_service', mutation);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ serviceId, revision: 1 });
    expect((await userA.rpc('record_service', mutation)).data).toEqual(first.data);
    expect((await userA.rpc('record_service', { ...mutation, p_facts: { ...mutation.p_facts, notes: 'changed' } })).error?.code).toBe('23505');

    const corrected = await userA.rpc('correct_service', {
      p_operation_id: crypto.randomUUID(), p_service_id: serviceId, p_expected_revision: 1,
      p_corrects_id: first.data.revisionId, p_reason: 'Correct zone',
      p_facts: { ...mutation.p_facts, zones: [{ region: 'crown', segment: 'ends' }] },
    });
    expect(corrected.error).toBeNull(); expect(corrected.data.revision).toBe(2);
    const observed = await userA.rpc('observe_service', { p_operation_id: crypto.randomUUID(),
      p_service_id: serviceId, p_observed_on: { precision: 'day', value: '2026-02-01' }, p_effect_status: 'not-present' });
    expect(observed.error).toBeNull(); expect(observed.data.revision).toBe(2);
    const detail = await userA.rpc('get_service', { p_service_id: serviceId, p_include_audit: true });
    expect(detail.error).toBeNull();
    expect(detail.data.revisions).toHaveLength(2); expect(detail.data.currentPresence).toBe('not-present');
    expect(detail.data.facts).not.toHaveProperty('chemicalSystem');
    expect(detail.data).not.toHaveProperty('userId');
    const page = await userA.rpc('list_services', { p_as_of: '2026-09-01', p_limit: 1, p_cursor: null });
    expect(page.error).toBeNull(); expect(page.data.items).toHaveLength(1);

    const foreign = await userB.rpc('get_service', { p_service_id: serviceId, p_include_audit: true });
    expect(foreign.error).toBeNull(); expect(foreign.data).toBeNull();
    const missing = await userB.rpc('get_service', { p_service_id: crypto.randomUUID(), p_include_audit: true });
    expect(missing.error).toBeNull(); expect(missing.data).toBeNull();
    const foreignObservation = await userB.rpc('observe_service', { p_operation_id: crypto.randomUUID(),
      p_service_id: serviceId, p_observed_on: DAY, p_effect_status: 'unknown' });
    const missingObservation = await userB.rpc('observe_service', { p_operation_id: crypto.randomUUID(),
      p_service_id: crypto.randomUUID(), p_observed_on: DAY, p_effect_status: 'unknown' });
    expect(foreignObservation.error?.code).toBe('22023');
    expect(foreignObservation.error?.message).toBe(missingObservation.error?.message);
    const anonymous = createClient(url, publishableKey, options());
    expect((await anonymous.rpc('get_service', { p_service_id: serviceId })).error?.code).toBe('42501');
    expect((await anonymous.rpc('record_service', mutation)).error?.code).toBe('42501');
    for (const table of ['chemical_services', 'service_revisions', 'service_zones', 'heat_events', 'service_observations']) {
      expect((await userB.from(table).select('*')).data).toEqual([]);
      expect((await userA.from(table).insert({ user_id: userAId })).error?.code).toBe('42501');
      expect((await userA.from(table).update({ user_id: userBId }).eq('user_id', userAId)).error?.code).toBe('42501');
      expect((await userA.from(table).delete().eq('user_id', userAId)).error?.code).toBe('42501');
    }
  });
});
