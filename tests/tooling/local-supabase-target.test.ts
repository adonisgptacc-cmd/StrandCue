import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSupabaseFetch, readLocalSupabaseTestConfig } from '../../scripts/local-supabase-test-target';

const env = {
  STRANDCUE_SUPABASE_URL: 'http://127.0.0.1:54321',
  STRANDCUE_SUPABASE_PUBLISHABLE_KEY: 'local-public',
  STRANDCUE_SUPABASE_SECRET_KEY: 'local-secret',
};
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  })));
  servers.length = 0;
});

describe('local Supabase test target safety', () => {
  it('requires an explicit opt-in even when credentials are present', () => {
    expect(readLocalSupabaseTestConfig(env)).toBeNull();
  });
  it('accepts explicit disposable loopback instances only', () => {
    expect(readLocalSupabaseTestConfig({ ...env, STRANDCUE_SUPABASE_API_TEST: '1' }))
      .toEqual({ url: env.STRANDCUE_SUPABASE_URL, publishableKey: 'local-public', secretKey: 'local-secret' });
    expect(readLocalSupabaseTestConfig({ ...env, STRANDCUE_SUPABASE_API_TEST: '1', STRANDCUE_SUPABASE_URL: 'http://[::1]:54321/' }))
      .toHaveProperty('url', 'http://[::1]:54321');
    expect(() => readLocalSupabaseTestConfig({ STRANDCUE_SUPABASE_API_TEST: '1' })).toThrow(/disposable loopback/);
  });
  it.each([
    '', 'garbage', 'https://production.supabase.co', 'http://127.0.0.1.evil.test:54321',
    'http://localhost:54321', 'http://192.168.1.10:54321', 'http://127.0.0.1',
    'https://127.0.0.1:54321', 'http://u:p@127.0.0.1:54321',
    'http://127.0.0.1:54321/rest/v1', 'http://127.0.0.1:54321?host=production',
    'http://127.0.0.1:54321#production',
  ])('refuses unsafe or ambiguous target %s before creating a client', url => {
    expect(() => readLocalSupabaseTestConfig({ ...env, STRANDCUE_SUPABASE_API_TEST: '1', STRANDCUE_SUPABASE_URL: url }))
      .toThrow(/disposable loopback/);
  });
  it.each(['STRANDCUE_SUPABASE_PUBLISHABLE_KEY', 'STRANDCUE_SUPABASE_SECRET_KEY'])('requires %s', key => {
    expect(() => readLocalSupabaseTestConfig({ ...env, STRANDCUE_SUPABASE_API_TEST: '1', [key]: '' })).toThrow(/keys/);
  });
  it('blocks off-origin requests, URL credentials and redirects, even if a caller requests following', async () => {
    let escaped = 0;
    const server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/escaped' }).end();
      } else if (req.url === '/escaped') {
        escaped++;
        res.end('escaped');
      } else res.end('local');
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    const localFetch = createLocalSupabaseFetch(url);
    expect(await (await localFetch(`${url}/auth/v1/health`)).text()).toBe('local');
    await expect(localFetch(new Request(`${url}/rest/v1/profiles`))).resolves.toHaveProperty('status', 200);
    await expect(localFetch(`${url}/redirect`, { redirect: 'follow' })).rejects.toThrow();
    await expect(localFetch('https://production.supabase.co')).rejects.toThrow(/target/);
    await expect(localFetch(`http://user:pass@127.0.0.1:${address.port}`)).rejects.toThrow(/target/);
    expect(escaped).toBe(0);
  });
});
