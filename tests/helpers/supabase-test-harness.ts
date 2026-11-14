import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface SupabaseTestHarness {
  pg: PGlite;
  supabase: SupabaseClient;
  serviceRole: SupabaseClient;
  createUser: (email: string) => Promise<{ id: string; accessToken: string }>;
  cleanup: () => Promise<void>;
}

export async function createSupabaseTestHarness(): Promise<SupabaseTestHarness> {
  const pg = new PGlite();

  // Create roles and auth schema (matching harness.ts)
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  // Apply all migrations
  const migrations = await getOrderedMigrations();
  for (const migration of migrations) {
    await pg.exec(migration.sql);
  }

  // Create Supabase clients with custom fetch that uses PGlite directly
  const supabase = createClient('http://localhost:54321', 'anon-key', {
    auth: { persistSession: false },
    global: {
      fetch: createPGliteFetch(pg, 'anon'),
    },
  });

  const serviceRole = createClient('http://localhost:54321', 'service-role-key', {
    auth: { persistSession: false },
    global: {
      fetch: createPGliteFetch(pg, 'service_role'),
    },
  });

  async function createUser(email: string) {
    const userId = crypto.randomUUID();
    await pg.exec(`insert into auth.users (id, email_confirmed_at) values ('${userId}', now())`);
    
    const accessToken = createMockJWT(userId, 'authenticated', [
      { method: 'password', timestamp: Math.floor(Date.now() / 1000) }
    ], email);
    
    return { id: userId, accessToken };
  }

  async function cleanup() {
    await pg.close();
  }

  return { pg, supabase, serviceRole, createUser, cleanup };
}

function createPGliteFetch(pg: PGlite, role: 'anon' | 'authenticated' | 'service_role') {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method || 'GET';
    
    const parsedUrl = new URL(url, 'http://localhost:54321');
    const path = parsedUrl.pathname;
    
    // Handle RPC endpoints
    if (path.includes('/rest/v1/rpc/')) {
      return handleRpcEndpoint(pg, role, method, parsedUrl, init);
    }
    
    // Handle table endpoints (SELECT, INSERT, UPDATE, DELETE)
    if (path.includes('/rest/v1/')) {
      return handleTableEndpoint(pg, role, method, parsedUrl, init);
    }
    
    // Handle auth endpoints - for signInWithPassword
    if (path === '/auth/v1/token' && parsedUrl.searchParams.get('grant_type') === 'password') {
      return handleSignIn(pg, init);
    }
    
    return new Response('Not Found', { status: 404 });
  };
}

async function handleSignIn(pg: PGlite, init?: RequestInit) {
  if (!init?.body) {
    return new Response(JSON.stringify({ error: { message: 'Missing body' } }), { status: 400 });
  }
  
  const body = JSON.parse(init.body as string);
  const email = body.email;
  
  // Find user by email (in test, we just create one if not exists)
  // For simplicity, we'll use a deterministic UUID based on email
  let userId = crypto.randomUUID();
  
  await pg.exec(`insert into auth.users (id, email_confirmed_at) values ('${userId}', now()) on conflict do nothing`);
  
  const accessToken = createMockJWT(userId, 'authenticated', [
    { method: 'password', timestamp: Math.floor(Date.now() / 1000) }
  ], email);
  
  return new Response(JSON.stringify({
    access_token: accessToken,
    refresh_token: 'mock-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email, aud: 'authenticated', role: 'authenticated' }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function handleRpcEndpoint(pg: PGlite, role: string, method: string, url: URL, init?: RequestInit) {
  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const rpcName = url.pathname.replace('/rest/v1/rpc/', '');
  const body = init?.body ? JSON.parse(init.body as string) : {};
  
  // Get the authorization header to extract JWT
  const authHeader = init?.headers && typeof init.headers === 'object' && 'authorization' in init.headers
    ? (init.headers as Record<string, string>)['authorization']
    : (init?.headers?.get?.('authorization') || '');
  
  let userId: string | null = null;
  let claims: Record<string, unknown> = { role };
  
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      userId = payload.sub;
      claims = payload;
    } catch {
      // Invalid token, treat as anon
    }
  }
  
  // Set up the session context
  await pg.exec('set session authorization postgres');
  if (userId) {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await pg.exec(`set session authorization authenticated`);
  } else if (role === 'service_role') {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", ['']);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'service_role' })]);
    await pg.exec('set session authorization service_role');
  } else {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", ['']);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'anon' })]);
    await pg.exec('set session authorization anon');
  }

  try {
    // Build the RPC call using positional parameters
    const paramEntries = Object.entries(body);
    const params = paramEntries.map((_, index) => {
      const value = paramEntries[index][1];
      if (typeof value === 'boolean') {
        return `$${index + 1}`;
      }
      if (typeof value === 'string' && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return `$${index + 1}::uuid`;
      }
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        return `$${index + 1}::timestamptz`;
      }
      if (typeof value === 'object') {
        return `$${index + 1}::jsonb`;
      }
      if (typeof value === 'number') {
        return `$${index + 1}`;
      }
      return `$${index + 1}::text`;
    }).join(', ');
    
    const paramValues = paramEntries.map(([, value]) => value);
    
    const result = await pg.query(
      `select public.${rpcName}(${params}) result`,
      paramValues
    );
    
    // Return the result directly (PostgREST RPC format)
    return new Response(JSON.stringify(result.rows[0]?.result ?? null), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    const pgError = error.message || String(error);
    let code = 'P0001';
    let message = pgError;
    
    // Extract Postgres error code if present
    const codeMatch = pgError.match(/using errcode = '([^']+)'/);
    if (codeMatch) {
      code = codeMatch[1];
      message = pgError.replace(/.*using errcode = '[^']+'/, '').trim();
    }
    
    // Return PostgREST error format
    return new Response(JSON.stringify({
      code,
      message,
      details: pgError,
      hint: null
    }), {
      status: code === '42501' ? 401 : code === '22023' ? 400 : code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleTableEndpoint(pg: PGlite, role: string, method: string, url: URL, init?: RequestInit) {
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const pathParts = url.pathname.replace('/rest/v1/', '').split('?');
  const tableName = pathParts[0];
  const queryParams = new URLSearchParams(pathParts[1] || '');
  
  // Get auth context
  const authHeader = init?.headers?.get?.('authorization') || '';
  let userId: string | null = null;
  let claims: Record<string, unknown> = { role };
  
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      userId = payload.sub;
      claims = payload;
    } catch {
      // Invalid token
    }
  }
  
  await pg.exec('set session authorization postgres');
  if (userId) {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await pg.exec(`set session authorization authenticated`);
  } else if (role === 'service_role') {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", ['']);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'service_role' })]);
    await pg.exec('set session authorization service_role');
  } else {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", ['']);
    await pg.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'anon' })]);
    await pg.exec('set session authorization anon');
  }

  try {
    if (method === 'GET') {
      // Build SELECT query
      const selectCols = queryParams.get('select') || '*';
      let whereClause = '';
      const whereParams: any[] = [];
      let paramIndex = 1;
      
      for (const [key, value] of queryParams.entries()) {
        if (key === 'select') continue;
        if (key.endsWith('.eq')) {
          const col = key.replace('.eq', '');
          whereClause += (whereClause ? ' and ' : ' where ') + `${col} = $${paramIndex++}`;
          whereParams.push(value);
        }
      }
      
      const result = await pg.query(`select ${selectCols} from ${tableName}${whereClause}`, whereParams);
      return new Response(JSON.stringify(result.rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${result.rows.length - 1}/${result.rows.length}` }
      });
    }
    
    if (method === 'PATCH') {
      // Build UPDATE query
      const body = init?.body ? JSON.parse(init.body as string) : {};
      let whereClause = '';
      const whereParams: any[] = [];
      let paramIndex = 1;
      
      for (const [key, value] of queryParams.entries()) {
        if (key === 'select') continue;
        if (key.endsWith('.eq')) {
          const col = key.replace('.eq', '');
          whereClause += (whereClause ? ' and ' : ' where ') + `${col} = $${paramIndex++}`;
          whereParams.push(value);
        }
      }
      
      const setClause = Object.entries(body).map(([col, val], idx) => `${col} = $${paramIndex + idx}`).join(', ');
      const setParams = Object.values(body);
      
      await pg.query(
        `update ${tableName} set ${setClause}${whereClause}`,
        [...setParams, ...whereParams]
      );
      
      return new Response(JSON.stringify([]), {
        status: 204,
        headers: { 'Content-Type': 'application/json', 'Preference-Applied': 'return=minimal' }
      });
    }
    
    if (method === 'DELETE') {
      // Build DELETE query
      let whereClause = '';
      const whereParams: any[] = [];
      let paramIndex = 1;
      
      for (const [key, value] of queryParams.entries()) {
        if (key === 'select') continue;
        if (key.endsWith('.eq')) {
          const col = key.replace('.eq', '');
          whereClause += (whereClause ? ' and ' : ' where ') + `${col} = $${paramIndex++}`;
          whereParams.push(value);
        }
      }
      
      await pg.query(`delete from ${tableName}${whereClause}`, whereParams);
      
      return new Response(JSON.stringify([]), {
        status: 204,
        headers: { 'Content-Type': 'application/json', 'Preference-Applied': 'return=minimal' }
      });
    }
    
    return new Response(JSON.stringify({ error: { code: 'P0001', message: 'Not implemented' } }), { status: 501 });
  } catch (error: any) {
    const pgError = error.message || String(error);
    let code = 'P0001';
    let message = pgError;
    
    const codeMatch = pgError.match(/using errcode = '([^']+)'/);
    if (codeMatch) {
      code = codeMatch[1];
      message = pgError.replace(/.*using errcode = '[^']+'/, '').trim();
    }
    
    return new Response(JSON.stringify({
      code,
      message,
      details: pgError,
      hint: null
    }), {
      status: code === '42501' ? 401 : code === '22023' ? 400 : code === '23505' ? 409 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function createMockJWT(sub: string, role: string, amr: any[], email?: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: Record<string, any> = {
    sub,
    role,
    amr,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'authenticated',
    iss: 'supabase',
    is_anonymous: false,
  };
  if (email) {
    payload.email = email;
  }
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock-signature';
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function getOrderedMigrations(): Promise<{ name: string; sql: string }[]> {
  const migrationDir = join(process.cwd(), 'supabase', 'migrations');
  const files = (await readdir(migrationDir))
    .filter(name => name.endsWith('.sql'))
    .sort();
  
  const migrations = [];
  for (const file of files) {
    const sql = await readFile(join(migrationDir, file), 'utf8');
    migrations.push({ name: file, sql });
  }
  return migrations;
}