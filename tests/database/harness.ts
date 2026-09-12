import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const UNVERIFIED = '33333333-3333-4333-8333-333333333333';
export const BASELINE = {
  naturalPattern: 'curly', strandDiameter: 'fine', density: 'medium',
  concerns: ['dryness'], goals: ['shine'], budgetPreference: 'best-value',
};
export const DAY = { precision: 'day', value: '2026-01-01' };

export async function database(migrationDirectory = 'supabase/migrations') {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values
      ('${USER_A}',now()), ('${USER_B}',now()), ('${UNVERIFIED}',null);
  `);
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) {
    await db.exec(await readFile(join(migrationDirectory, migration), 'utf8'));
  }
  return db;
}
export async function asUser(db: PGlite, id: string | null) {
  await db.exec('set session authorization postgres');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  const claims = id === null
    ? { role: 'anon' }
    : id === UNVERIFIED
      ? { sub: id, role: 'authenticated', is_anonymous: false }
      : { sub: id, role: 'authenticated', email: `${id}@example.test`, is_anonymous: false };
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
  await db.exec(`set session authorization ${id === null ? 'anon' : 'authenticated'}`);
}

export async function complete(db: PGlite, username = 'user_a', eligible = true) {
  return (await db.query<{ result: Record<string, unknown> }>(
    'select public.complete_account($1,$2) result', [username, eligible],
  )).rows[0].result;
}

export async function mutate(db: PGlite, options: {
  key?: string; revision?: number; kind?: string; date?: unknown;
  patch?: unknown; correctsId?: string | null; reason?: string | null;
} = {}) {
  return (await db.query<{ result: any }>(
    'select public.mutate_passport($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) result',
    [options.key ?? crypto.randomUUID(), options.revision ?? 0,
      options.kind ?? 'baseline', JSON.stringify(options.date ?? DAY),
      JSON.stringify(options.patch ?? BASELINE), options.correctsId ?? null,
      options.reason ?? null],
  )).rows[0].result;
}

export async function current(db: PGlite, asOf = '2026-09-01') {
  return (await db.query<{ result: any }>('select public.get_passport($1::date) result', [asOf])).rows[0].result;
}

export async function recordService(db: PGlite, command: {
  operationId: string; serviceId: string; facts: unknown; initialObservation?: unknown;
}) {
  return (await db.query<{ result: any }>(
    'select public.record_service($1,$2,$3::jsonb,$4::jsonb) result',
    [command.operationId, command.serviceId, JSON.stringify(command.facts),
      command.initialObservation === undefined ? null : JSON.stringify(command.initialObservation)],
  )).rows[0].result;
}

export async function correctService(db: PGlite, command: {
  operationId: string; serviceId: string; expectedRevision: number; correctsId: string; reason: string; facts: unknown;
}) {
  return (await db.query<{ result: any }>(
    'select public.correct_service($1,$2,$3,$4,$5,$6::jsonb) result',
    [command.operationId, command.serviceId, command.expectedRevision, command.correctsId, command.reason, JSON.stringify(command.facts)],
  )).rows[0].result;
}

export async function observeService(db: PGlite, command: {
  operationId: string; serviceId: string; observation: { observedOn: unknown; effectStatus: string };
}) {
  return (await db.query<{ result: any }>(
    'select public.observe_service($1,$2,$3::jsonb,$4) result',
    [command.operationId, command.serviceId, JSON.stringify(command.observation.observedOn), command.observation.effectStatus],
  )).rows[0].result;
}

export async function listServicePage(db: PGlite, asOf = '2026-09-01', limit = 25, cursor: unknown = null) {
  return (await db.query<{ result: any }>(
    'select public.list_services($1::date,$2,$3::jsonb) result', [asOf, limit, JSON.stringify(cursor)],
  )).rows[0].result;
}

export async function listServices(db: PGlite, asOf = '2026-09-01') {
  return (await listServicePage(db, asOf)).items;
}

export async function getService(db: PGlite, serviceId: string, audit = false) {
  return (await db.query<{ result: any }>(
    'select public.get_service($1,$2) result', [serviceId, audit],
  )).rows[0].result;
}

