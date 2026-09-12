import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  USER_A, USER_B, UNVERIFIED, asUser, complete, database, recordService,
  correctService, observeService, listServices, listServicePage, getService,
} from './harness.ts';

const facts = {
  serviceType: 'nanoplasty', occurredOn: { precision: 'day', value: '2026-02-01' },
  zones: [{ region: 'front', segment: 'roots' }, { region: 'crown', segment: 'ends' }],
  heat: { method: 'unknown', temperatureC: null, passes: null, source: 'user-reported' },
};
const command = (replacement: unknown = facts) => ({ operationId: crypto.randomUUID(), serviceId: crypto.randomUUID(), facts: replacement });
const correction = (serviceId: string, correctsId: string, expectedRevision = 1) => ({
  operationId: crypto.randomUUID(), serviceId, correctsId, expectedRevision,
  reason: 'Corrected the recorded zones', facts: { ...facts, zones: [{ region: 'nape', segment: 'ends' }] },
});

describe('Chemical Service transactional history', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await database();
    await asUser(db, USER_A); await complete(db);
    await asUser(db, USER_B); await complete(db, 'user_b');
    await asUser(db, USER_A);
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('P1-AC-08 keeps smoothing services distinct and heat unknown without inferred chemistry', async () => {
    const keratin = command({ ...facts, serviceType: 'keratin', occurredOn: { precision: 'day', value: '2026-01-01' } });
    const nano = command();
    await recordService(db, keratin); await recordService(db, nano);
    const services = await listServices(db);
    expect(services).toHaveLength(2);
    expect(services.map((item: any) => item.facts.serviceType)).toEqual(['nanoplasty', 'keratin']);
    expect(services[0].facts).not.toHaveProperty('chemicalSystem');
    expect(services[0].facts.heat).toMatchObject({ method: 'unknown', temperatureC: null, passes: null });
    const detail = await getService(db, nano.serviceId, true);
    expect(detail.revisions[0].facts.zones).toEqual([{ region: 'crown', segment: 'ends' }, { region: 'front', segment: 'roots' }]);
  });

  it('P1-AC-09 appends complete corrections and observations without rewriting occurrence history', async () => {
    const create = command(); const first = await recordService(db, create);
    const corrected = await correctService(db, correction(create.serviceId, first.revisionId));
    expect(corrected).toMatchObject({ serviceId: create.serviceId, revision: 2 });
    const before = await getService(db, create.serviceId, true);
    expect(before.revisions.map((r: any) => r.sequence)).toEqual([1, 2]);
    expect(before.revisions[0].facts.zones).toEqual([{ region: 'crown', segment: 'ends' }, { region: 'front', segment: 'roots' }]);
    expect(before.revisions[1].facts.zones).toEqual([{ region: 'nape', segment: 'ends' }]);
    expect((await getService(db, create.serviceId)).revisions).toHaveLength(1);
    await observeService(db, { operationId: crypto.randomUUID(), serviceId: create.serviceId,
      observation: { observedOn: { precision: 'day', value: '2026-03-01' }, effectStatus: 'not-present' } });
    const after = await getService(db, create.serviceId, true);
    expect(after.revisions).toEqual(before.revisions);
    expect(after.facts).toEqual(before.facts);
    expect(after.revision).toBe(2);
    expect(after.currentPresence).toBe('not-present');
    expect(after.currentObservation.source).toBe('user-reported');
    const persisted = await db.query<{ facts: unknown }>('select facts from public.service_revisions where service_id=$1', [create.serviceId]);
    for (const row of persisted.rows) { expect(row.facts).not.toHaveProperty('zones'); expect(row.facts).not.toHaveProperty('heat'); }
  });

  it('canonical create retries and a new operation ID return the original receipt without duplicates', async () => {
    const create = command(); const first = await recordService(db, create);
    expect(await recordService(db, create)).toEqual(first);
    expect(await recordService(db, { ...create, operationId: crypto.randomUUID(), facts: { ...facts, zones: [...facts.zones].reverse() } })).toEqual(first);
    await expect(recordService(db, { ...create, facts: { ...facts, notes: 'different' } })).rejects.toThrow(/operation-conflict/);
    await expect(recordService(db, { ...create, operationId: crypto.randomUUID(), facts: { ...facts, notes: 'different' } })).rejects.toThrow(/service-conflict/);
    expect((await getService(db, create.serviceId, true)).revisions).toHaveLength(1);
  });

  it('serializes competing correction expectations and prevents branching or foreign targets', async () => {
    const create = command(); const first = await recordService(db, create);
    const change = correction(create.serviceId, first.revisionId);
    await expect(correctService(db, { ...change, expectedRevision: 0 })).rejects.toThrow(/revision-conflict/);
    const attempts = await Promise.allSettled([correctService(db, change), correctService(db, { ...change, operationId: crypto.randomUUID() })]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await correctService(db, change)).toEqual((attempts[0] as PromiseFulfilledResult<any>).value);
    await expect(correctService(db, correction(create.serviceId, first.revisionId, 2))).rejects.toThrow(/correction-target/);
    const other = await recordService(db, command());
    await expect(correctService(db, correction(create.serviceId, other.revisionId, 2))).rejects.toThrow(/correction-target/);
    expect((await getService(db, create.serviceId, true)).revisions).toHaveLength(2);
  });

  it('derives observation provenance and ignores observations after the requested as-of date', async () => {
    const create = { ...command(), initialObservation: { observedOn: { precision: 'month', value: '2026-02' }, effectStatus: 'present' } };
    await recordService(db, create);
    expect((await getService(db, create.serviceId)).currentObservation.source).toBe('user-estimated');
    const observation = { operationId: crypto.randomUUID(), serviceId: create.serviceId,
      observation: { observedOn: { precision: 'day', value: '2026-04-01' }, effectStatus: 'not-present' } };
    const receipt = await observeService(db, observation);
    expect(await observeService(db, observation)).toEqual(receipt);
    await expect(observeService(db, { ...observation, observation: { ...observation.observation, effectStatus: 'unknown' } })).rejects.toThrow(/operation-conflict/);
    const historical = (await listServices(db, '2026-03-01')).find((s: any) => s.serviceId === create.serviceId);
    expect(historical.currentPresence).toBe('present');
    expect((await getService(db, create.serviceId)).currentPresence).toBe('not-present');
  });

  it('paginates tied dates deterministically without duplicates and enforces bounds', async () => {
    const first = await listServicePage(db, '2026-09-01', 2);
    expect(first.items).toHaveLength(2); expect(first.nextCursor).not.toBeNull();
    const second = await listServicePage(db, '2026-09-01', 2, first.nextCursor);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((s: any) => s.serviceId)).size).toBe(4);
    expect(await listServicePage(db, '2026-09-01', 2, first.nextCursor)).toEqual(second);
    for (const limit of [0, -1, 101]) await expect(listServicePage(db, '2026-09-01', limit)).rejects.toThrow(/invalid-page/);
    await expect(listServicePage(db, '2026-09-01', 2, { injected: true })).rejects.toThrow(/invalid-cursor/);
    await expect(listServicePage(db, '2026-08-01', 2, first.nextCursor)).rejects.toThrow(/invalid-cursor/);
  });

  it.each([
    null, [], {}, { ...facts, chemicalSystem: 'invented' }, { ...facts, serviceType: null },
    { ...facts, serviceType: 'invented' }, { ...facts, zones: [] }, { ...facts, zones: [facts.zones[0], facts.zones[0]] },
    { ...facts, zones: [{ region: 'front', segment: 'roots', extra: true }] },
    { ...facts, zones: [{ region: 'side', segment: 'roots' }] },
    { ...facts, heat: { method: 'unknown' } }, { ...facts, heat: { ...facts.heat, temperatureC: -1 } },
    { ...facts, heat: { ...facts.heat, passes: 1.5 } }, { ...facts, heat: { ...facts.heat, passes: 9007199254740992 } },
    { ...facts, heat: { ...facts.heat, source: 'inferred' } }, { ...facts, heat: { ...facts.heat, extra: 1 } },
    { ...facts, otherLabel: 'illegal' }, { ...facts, serviceType: 'other' },
    { ...facts, serviceType: 'other', otherLabel: '😀'.repeat(51) },
    { ...facts, productOrSystem: '😀'.repeat(101) }, { ...facts, notes: '😀'.repeat(1001) },
    { ...facts, occurredOn: { precision: 'day', value: '9999-01-01' } },
    { ...facts, occurredOn: { precision: 'day', value: '2026-02-30' } },
    { ...facts, occurredOn: { precision: 'day', value: '2026-01-01', source: 'forged' } },
  ])('rejects malformed facts atomically: %#', async (invalid) => {
    const create = command(invalid);
    await expect(recordService(db, create)).rejects.toThrow(/invalid-service|invalid-effective-date/);
    expect(await getService(db, create.serviceId, true)).toBeNull();
  });

  it('rejects raw numeric overflow, malformed JSON and invalid observations atomically', async () => {
    const create = command();
    const overflow = JSON.stringify(facts).replace('"temperatureC":null', '"temperatureC":1e309');
    await expect(db.query('select public.record_service($1,$2,$3::jsonb,null)', [create.operationId, create.serviceId, overflow])).rejects.toThrow(/invalid-service/);
    await expect(db.query('select public.record_service($1,$2,$3::jsonb,null)', [create.operationId, create.serviceId, '{'])).rejects.toThrow(/json/i);
    for (const observation of [null, {}, { observedOn: { precision: 'unknown', value: null }, effectStatus: 'present', source: 'forged' },
      { observedOn: { precision: 'day', value: '9999-01-01' }, effectStatus: 'present' }]) {
      await expect(recordService(db, { ...create, initialObservation: observation })).rejects.toThrow(/invalid-observation|invalid-effective-date/);
    }
    expect(await getService(db, create.serviceId)).toBeNull();
  });

  it('retains optional heat absence and canonical Unicode text without inventing data', async () => {
    const { heat: _heat, ...withoutHeat } = facts;
    const create = command({ ...withoutHeat, serviceType: 'other', otherLabel: '  Custom  ', notes: ' 😀 ', productOrSystem: null });
    await recordService(db, create);
    const detail = await getService(db, create.serviceId);
    expect(detail.facts).not.toHaveProperty('heat');
    expect(detail.facts).toMatchObject({ otherLabel: 'Custom', notes: '😀', productOrSystem: null });
  });

  it('denies anonymous, unverified, inactive and private-core calls without claims', async () => {
    try {
      await asUser(db, null); await expect(recordService(db, command())).rejects.toThrow(/permission denied/);
      await asUser(db, UNVERIFIED); await expect(recordService(db, command())).rejects.toThrow(/email-not-verified|account-not-active/);
      await asUser(db, USER_A);
      await db.exec('set session authorization postgres');
      await db.query("update public.profiles set account_status='deleting' where user_id=$1", [USER_A]);
      await asUser(db, USER_A); await expect(recordService(db, command())).rejects.toThrow(/account-not-active/);
      expect((await db.query('select id from public.chemical_services')).rows).toEqual([]);
      await asUser(db, null); await db.exec('set session authorization postgres');
      await expect(db.query('select strandcue_private.record_service($1,$2,$3::jsonb,null)', [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(facts)])).rejects.toThrow(/authentication-required/);
      await expect(db.query('select strandcue_private.get_service($1,true)', [crypto.randomUUID()])).rejects.toThrow(/authentication-required/);
    } finally {
      await db.exec('set session authorization postgres');
      await db.query("update public.profiles set account_status='active' where user_id=$1", [USER_A]);
      await asUser(db, USER_A);
    }
  });

  it('hides foreign IDs and rejects all direct consumer writes and owner reassignment', async () => {
    const create = command(); const first = await recordService(db, create);
    await asUser(db, USER_B);
    expect(await getService(db, create.serviceId, true)).toBeNull();
    expect((await db.query('select id from public.chemical_services')).rows).toEqual([]);
    await expect(correctService(db, correction(create.serviceId, first.revisionId))).rejects.toThrow(/service-not-found/);
    await expect(observeService(db, { operationId: crypto.randomUUID(), serviceId: create.serviceId, observation: { observedOn: facts.occurredOn, effectStatus: 'unknown' } })).rejects.toThrow(/service-not-found/);
    await expect(recordService(db, { ...create, operationId: crypto.randomUUID() })).rejects.toThrow(/service-conflict/);
    await asUser(db, USER_A);
    for (const table of ['chemical_services', 'service_revisions', 'service_zones', 'heat_events', 'service_observations']) {
      await expect(db.query(`insert into public.${table}(user_id) values($1)`, [USER_A])).rejects.toThrow(/permission denied/);
      await expect(db.query(`update public.${table} set user_id=$1`, [USER_B])).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.query('select * from strandcue_private.service_operations')).rejects.toThrow(/permission denied/);
  });

  it('composite foreign keys prevent cross-owner and cross-service history even under postgres', async () => {
    const create = command(); const first = await recordService(db, create);
    const other = await recordService(db, command());
    await db.exec('set session authorization postgres');
    try {
      await expect(db.query("insert into public.service_revisions(user_id,service_id,sequence,base_revision,kind,facts) values($1,$2,2,1,'correction','{}')", [USER_B, create.serviceId])).rejects.toThrow();
      await expect(db.query("insert into public.service_zones(user_id,service_id,service_revision_id,region,segment) values($1,$2,$3,'nape','roots')", [USER_B, create.serviceId, first.revisionId])).rejects.toThrow(/foreign key/);
      await expect(db.query("insert into public.service_zones(user_id,service_id,service_revision_id,region,segment) values($1,$2,$3,'nape','roots')", [USER_A, other.serviceId, first.revisionId])).rejects.toThrow(/foreign key/);
      await expect(db.query("insert into public.heat_events(user_id,service_id,service_revision_id,method,source) values($1,$2,$3,'unknown','user-reported')", [USER_B, create.serviceId, first.revisionId])).rejects.toThrow(/foreign key/);
      await expect(db.query("insert into public.service_observations(user_id,service_id,effective_date,effect_status,source) values($1,$2,$3::jsonb,'present','user-reported')", [USER_B, create.serviceId, JSON.stringify(facts.occurredOn)])).rejects.toThrow(/foreign key/);
      await expect(db.query("insert into public.service_revisions(user_id,service_id,sequence,base_revision,kind,facts,corrects_id,correction_reason) values($1,$2,2,1,'correction','{}',$3,'fix')", [USER_A, create.serviceId, other.revisionId])).rejects.toThrow(/foreign key/);
    } finally { await asUser(db, USER_A); }
  });
});
