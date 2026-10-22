import type { PGlite } from '@electric-sql/pglite';

import type { HttpResult, Principal, PrivilegedProbe, ScenarioTransport } from '../../scripts/owner-isolation-scenarios.ts';

/**
 * A PostgREST-shaped transport over the real migrations in PGlite. It exists so the scenario suite can be unit
 * tested without a network. It is PGlite evidence only: it proves the SQL boundary and the scenario logic, not
 * PostgREST, GoTrue or the wire.
 *
 * `leaky` makes every principal act as the first owner, to prove the scenarios fail when isolation is broken.
 */
export interface PgliteTransportOptions {
  readonly leaky?: boolean;
  readonly mangle?: (path: string, result: HttpResult) => HttpResult;
}

const STATUS_BY_CODE: Record<string, number> = { '42501': 403, '42P01': 404, '23505': 409, '23503': 409, '22023': 400, P0001: 400 };

function statusFor(code: string | undefined): number {
  return (code && STATUS_BY_CODE[code]) || 400;
}

async function actAs(db: PGlite, id: string | null): Promise<void> {
  await db.exec('set session authorization postgres');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  const claims = id === null
    ? { role: 'anon' }
    : { sub: id, role: 'authenticated', email: `${id}@example.test`, is_anonymous: false, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] };
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`set session authorization ${id === null ? 'anon' : 'authenticated'}`);
}

const identifier = /^[a-z_][a-z0-9_]*$/;

/** Only `column=eq.value` filters, which is all the scenarios use. Anything else is refused, never guessed. */
function filtersOf(url: URL): { sql: string; values: unknown[] } | null {
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of url.searchParams) {
    if (key === 'select') continue;
    const match = /^eq\.(.*)$/.exec(value);
    if (!identifier.test(key) || !match) return null;
    values.push(match[1]);
    parts.push(`${key}::text = $${values.length}`);
  }
  return { sql: parts.length ? `where ${parts.join(' and ')}` : '', values };
}

export function pgliteTransport(db: PGlite, options: PgliteTransportOptions = {}): { transport: ScenarioTransport; probe: PrivilegedProbe } {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };
  let firstOwner: string | null = null;

  const run = async (principal: Principal, method: string, path: string, body: unknown): Promise<HttpResult> => {
    if (principal.id !== null && firstOwner === null) firstOwner = principal.id;
    await actAs(db, options.leaky && principal.id !== null ? firstOwner : options.leaky ? firstOwner : principal.id);
    const url = new URL(path, 'http://postgrest.invalid');
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.slice('/rest/v1/rpc/'.length);
        if (!identifier.test(name)) return { status: 404, text: JSON.stringify({ code: 'PGRST202', message: 'unknown function' }) };
        const args = (body ?? {}) as Record<string, unknown>;
        const keys = Object.keys(args);
        const values = keys.map(key => {
          const value = args[key];
          return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
        });
        const { rows } = await db.query<{ result: unknown }>(
          `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) result`, values);
        return { status: 200, text: JSON.stringify(rows[0].result) };
      }
      const table = url.pathname.slice('/rest/v1/'.length);
      if (!identifier.test(table)) return { status: 404, text: JSON.stringify({ code: 'PGRST205', message: 'unknown table' }) };
      if (method === 'GET') {
        const select = (url.searchParams.get('select') ?? '*').split(',');
        if (!select.every(column => column === '*' || identifier.test(column))) return { status: 400, text: JSON.stringify({ code: 'PGRST100', message: 'bad select' }) };
        const where = filtersOf(url);
        if (where === null) return { status: 400, text: JSON.stringify({ code: 'PGRST100', message: 'bad filter' }) };
        const { rows } = await db.query<{ rows: unknown }>(
          `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) rows from (select ${select.join(', ')} from public.${table} ${where.sql}) t`, where.values);
        return { status: 200, text: JSON.stringify(rows[0].rows) };
      }
      if (method === 'POST') {
        const row = (body ?? {}) as Record<string, unknown>;
        const keys = Object.keys(row);
        if (!keys.every(key => identifier.test(key))) return { status: 400, text: JSON.stringify({ code: 'PGRST100', message: 'bad column' }) };
        await db.query(`insert into public.${table}(${keys.join(', ')}) values (${keys.map((_, index) => `$${index + 1}`).join(', ')})`,
          keys.map(key => (row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key])));
        return { status: 201, text: '' };
      }
      if (method === 'PATCH' || method === 'DELETE') {
        const where = filtersOf(url);
        if (where === null) return { status: 400, text: JSON.stringify({ code: 'PGRST100', message: 'bad filter' }) };
        if (method === 'DELETE') {
          await db.query(`delete from public.${table} ${where.sql}`, where.values);
        } else {
          const row = (body ?? {}) as Record<string, unknown>;
          const keys = Object.keys(row);
          if (keys.length === 0 || !keys.every(key => identifier.test(key))) return { status: 400, text: JSON.stringify({ code: 'PGRST100', message: 'bad column' }) };
          const shifted = where.sql.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + keys.length}`);
          await db.query(`update public.${table} set ${keys.map((key, index) => `${key} = $${index + 1}`).join(', ')} ${shifted}`,
            [...keys.map(key => (row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key])), ...where.values]);
        }
        return { status: 204, text: '' };
      }
      return { status: 405, text: '' };
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      return { status: statusFor(failure.code), text: JSON.stringify({ code: failure.code ?? 'P0001', message: failure.message ?? 'error', details: null, hint: null }) };
    }
  };

  const transport: ScenarioTransport = {
    send: (principal, method, path, body) => serial(async () => {
      const result = await run(principal, method, path, body);
      return options.mangle ? options.mangle(path, result) : result;
    }),
  };

  const probe: PrivilegedProbe = {
    exec: sql => serial(async () => {
      await db.exec('set session authorization postgres');
      await db.exec(sql);
    }),
    counts: () => serial(async () => {
      await db.exec('set session authorization postgres');
      const { rows } = await db.query<Record<string, string>>(`select
        (select count(*) from public.user_products)::text user_products,
        (select count(*) from public.user_product_revisions)::text user_product_revisions,
        (select count(*) from strandcue_private.shelf_operations)::text shelf_operations,
        (select count(*) from public.user_tools)::text user_tools,
        (select count(*) from public.user_tool_revisions)::text user_tool_revisions,
        (select count(*) from strandcue_private.tool_operations)::text tool_operations,
        (select count(*) from public.cue_checks)::text cue_checks,
        (select count(*) from public.cue_check_revisions)::text cue_check_revisions,
        (select count(*) from strandcue_private.cue_check_operations)::text cue_check_operations`);
      return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
    }),
  };
  return { transport, probe };
}
