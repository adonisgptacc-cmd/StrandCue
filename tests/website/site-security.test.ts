import { existsSync, readFileSync } from 'node:fs';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeLineEndings } from '../helpers/normalize-line-endings';

interface WebsiteConfiguration {
  readonly name: string;
  readonly compatibility_date: string;
  readonly workers_dev: boolean;
  readonly preview_urls: boolean;
  readonly assets: {
    readonly directory: string;
    readonly html_handling: string;
    readonly not_found_handling: string;
  };
  readonly routes?: readonly Readonly<{ pattern: string; zone_name: string }>[];
  readonly route?: unknown;
  readonly main?: string;
  readonly triggers?: unknown;
}

function readConfiguration(): WebsiteConfiguration {
  return JSON.parse(readFileSync('website/wrangler.jsonc', 'utf8')) as WebsiteConfiguration;
}

describe('public website Worker boundary', () => {
  it('keeps the website on a separate worker', () => {
    const configuration = readConfiguration();
    expect(configuration.name).toBe('strandcue-website');
    expect(configuration.compatibility_date).toBe('2026-10-08');
    expect(configuration.workers_dev).toBe(false);
    expect(configuration.preview_urls).toBe(false);
    expect(configuration.main, 'static site must not execute the existing Worker').toBeUndefined();
    expect(configuration.triggers, 'static site must not schedule deletion jobs').toBeUndefined();
  });

  it('uses extensionless static HTML routing', () => {
    expect(readConfiguration().assets).toEqual({
      directory: './public',
      html_handling: 'drop-trailing-slash',
      not_found_handling: '404-page',
    });
  });

  it('does not claim the existing worker host', () => {
    const configuration = readConfiguration();
    const routing = JSON.stringify({ route: configuration.route, routes: configuration.routes });
    expect(routing).not.toContain('strandcue.adonisgptacc.workers.dev');
    expect(routing).not.toContain('strandcue-account-deletion');
    expect(routing).not.toContain('*.workers.dev');
  });

  it('claims only the approved website custom domain', () => {
    const configuration = readConfiguration();
    expect(configuration.routes).toEqual([
      { pattern: 'strandcue.co.za/*', zone_name: 'strandcue.co.za' },
    ]);
  });
});

const routes = ['/', '/privacy', '/delete-account', '/support', '/terms'] as const;
const csp = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const secureHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': csp,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'x-frame-options': 'DENY',
};

async function loadChecker() {
  expect(existsSync('scripts/check-website.ts'), 'missing safe HTTP checker').toBe(true);
  return import('../../scripts/check-website.ts');
}

function pageFor(route: string): string {
  const file = routes.includes(route as typeof routes[number])
    ? route === '/' ? 'index.html' : `${route.slice(1)}/index.html`
    : '404.html';
  return readFileSync(`website/public/${file}`, 'utf8');
}

async function withServer(handler: RequestListener, action: (origin: string) => Promise<void>): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await action(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('public website security', () => {
  it('sets restrictive static headers', () => {
    expect(existsSync('website/public/_headers')).toBe(true);
    const headers = normalizeLineEndings(readFileSync('website/public/_headers', 'utf8'));
    const general = headers.split('\n\n')[0];
    expect(general.startsWith('/*\n')).toBe(true);
    for (const [name, value] of Object.entries(secureHeaders).filter(([name]) => name !== 'content-type')) {
      expect(general.toLowerCase()).toContain(`${name}: ${value.toLowerCase()}`);
    }
  });

  it('blocks indexing on workers.dev previews', () => {
    expect(existsSync('website/public/_headers')).toBe(true);
    const headers = normalizeLineEndings(readFileSync('website/public/_headers', 'utf8'));
    expect(headers).toContain('https://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex');
    expect(headers.split('\n\n')[0]).not.toMatch(/X-Robots-Tag/i);
  });

  it('contains no third-party or executable content', () => {
    for (const route of [...routes, '/not-found']) {
      const html = pageFor(route);
      expect(html).not.toMatch(/<(script|form|iframe|object|embed|base)\b|\bon\w+\s*=|javascript:|document\.cookie|(?:google-analytics|googletagmanager|gtag\s*\(|fbq\s*\(|tracking.?pixel)/i);
      const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
      expect(urls.every(url => /^(?:\/(?!\/)|#|mailto:support@strandcue\.co\.za(?:\?|$)|https:\/\/strandcue\.co\.za(?:\/|$))/.test(url))).toBe(true);
    }
    expect(readFileSync('website/public/styles.css', 'utf8')).not.toMatch(/@import|url\(\s*["']?(?:https?:|\/\/|data:)/i);
  });
});

describe('website HTTP checker', () => {
  it('rejects unsafe website origins', async () => {
    const { checkWebsite } = await loadChecker();
    for (const origin of ['garbage', 'http://strandcue.co.za', 'ftp://localhost',
      'http://localhost.evil.test', 'https://user:secret@strandcue.co.za',
      'https://strandcue.co.za/privacy', 'https://strandcue.co.za/?token=secret',
      'https://strandcue.co.za/#secret']) {
      await expect(checkWebsite(origin)).rejects.toThrow('Use an HTTPS origin');
    }
  });

  it('checks real local pages and a random branded 404 without requiring deployed headers', async () => {
    const { checkWebsite } = await loadChecker();
    await withServer((request, response) => {
      const route = request.url!;
      response.writeHead(routes.includes(route as typeof routes[number]) ? 200 : 404, { 'content-type': 'text/html' });
      response.end(pageFor(route));
    }, async origin => {
      const results = await checkWebsite(origin);
      expect(results).toHaveLength(6);
      expect(results.map(result => result.ok)).toEqual([true, true, true, true, true, true]);
      expect(results.slice(0, 5).map(result => result.route)).toEqual(routes);
      expect(results[5].route).toMatch(/^\/__strandcue-check-[a-f\d-]+$/);
      expect(Object.isFrozen(results)).toBe(true);
      expect(results.every(result => Object.isFrozen(result) && Object.isFrozen(result.errors))).toBe(true);
    });
  });

  it('reports bad status, HTML type, canonical content, and unbranded 404', async () => {
    const { checkWebsite } = await loadChecker();
    await withServer((_, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    }, async origin => {
      const results = await checkWebsite(origin);
      expect(results.every(result => !result.ok)).toBe(true);
      expect(results[0].errors.join(' ')).toContain('HTML content type');
      expect(results[0].errors.join(' ')).toContain('canonical metadata');
      expect(results[5].errors.join(' ')).toContain('HTTP 404');
      expect(results[5].errors.join(' ')).toContain('branded not-found');
    });
  });

  it.each(['/privacy?token=secret', 'https://other.test/?token=secret'])('does not follow redirects or expose queries: %s', async location => {
    const { checkWebsite } = await loadChecker();
    await withServer((_, response) => {
      response.writeHead(302, { location });
      response.end();
    }, async origin => {
      const results = await checkWebsite(origin);
      expect(results.every(result => !result.ok)).toBe(true);
      expect(JSON.stringify(results)).not.toMatch(/secret|token/);
      expect(results[0].errors).toEqual(['Request failed (network, redirect, or timeout).']);
    });
  });

  it('verifies deployed security headers and preview noindex', async () => {
    const { checkWebsite } = await loadChecker();
    vi.stubGlobal('fetch', async (input: URL, options: RequestInit) => {
      expect(options.redirect).toBe('error');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      const route = input.pathname;
      return new Response(pageFor(route), {
        status: routes.includes(route as typeof routes[number]) ? 200 : 404,
        headers: { ...secureHeaders, 'x-robots-tag': 'noindex' },
      });
    });
    expect((await checkWebsite('https://strandcue-website.example.workers.dev')).every(result => result.ok)).toBe(true);
    const production = await checkWebsite('https://strandcue.co.za');
    expect(production[0].errors.join(' ')).toContain('must allow indexing');
    vi.stubGlobal('fetch', async (input: URL) => new Response(pageFor(input.pathname), {
      status: routes.includes(input.pathname as typeof routes[number]) ? 200 : 404,
      headers: { 'content-type': 'text/html' },
    }));
    const missing = await checkWebsite('https://strandcue.co.za');
    expect(missing[0].errors.join(' ')).toContain('content-security-policy');
    expect(missing[0].errors.join(' ')).toContain('permissions-policy');
    expect((await checkWebsite('https://strandcue-website.example.workers.dev'))[0].errors.join(' ')).toContain('noindex');
  });

  it('redacts remote errors and rejects unexpected final origins', async () => {
    const { checkWebsite } = await loadChecker();
    vi.stubGlobal('fetch', async () => { throw new Error('https://other.test/?token=private'); });
    expect(JSON.stringify(await checkWebsite('https://strandcue.co.za'))).not.toMatch(/private|token/);
    vi.stubGlobal('fetch', async () => {
      const response = new Response(pageFor('/'), { headers: secureHeaders });
      Object.defineProperty(response, 'url', { value: 'https://other.test/?token=private' });
      return response;
    });
    const results = await checkWebsite('https://strandcue.co.za');
    expect(results[0].errors).toEqual(['Unexpected response origin or redirect.']);
    expect(JSON.stringify(results)).not.toMatch(/private|token/);
  });

  it('runs the CLI against a local site and safely rejects unsafe CLI input', async () => {
    await loadChecker();
    const run = promisify(execFile);
    await withServer((request, response) => {
      const route = request.url!;
      response.writeHead(routes.includes(route as typeof routes[number]) ? 200 : 404, { 'content-type': 'text/html' });
      response.end(pageFor(route));
    }, async origin => {
      const { stdout, stderr } = await run(process.execPath, ['scripts/check-website.ts'], {
        env: { ...process.env, STRANDCUE_WEBSITE_ORIGIN: origin },
      });
      expect(stdout.match(/WEBSITE-PASS/g)).toHaveLength(6);
      expect(stderr).toBe('');
    });
    const failure = await run(process.execPath, ['scripts/check-website.ts'], {
      env: { ...process.env, STRANDCUE_WEBSITE_ORIGIN: 'https://user:secret@strandcue.co.za/?token=private' },
    }).catch(error => error as { code: number; stdout: string; stderr: string });
    expect(failure).toMatchObject({ code: 1, stdout: '' });
    expect(failure.stderr).toContain('WEBSITE-HOLD: Invalid origin.');
    expect(failure.stderr).not.toMatch(/secret|token|private/);
  });
});

describe('website transport security headers', () => {
  it('scopes the staged HSTS header to the production host block', () => {
    expect(existsSync('website/public/_headers')).toBe(true);
    const headers = normalizeLineEndings(readFileSync('website/public/_headers', 'utf8'));
    expect(headers).toContain('https://strandcue.co.za/*\n  Strict-Transport-Security: max-age=86400');
    expect(headers.toLowerCase()).not.toContain('includesubdomains');
    expect(headers.toLowerCase()).not.toContain('preload');
  });

  it('keeps the general block unchanged and free of HSTS', () => {
    const headers = normalizeLineEndings(readFileSync('website/public/_headers', 'utf8'));
    const general = headers.split('\n\n')[0];
    expect(general.startsWith('/*\n')).toBe(true);
    expect(general).not.toMatch(/Strict-Transport-Security/i);
    for (const [name, value] of Object.entries(secureHeaders).filter(([name]) => name !== 'content-type')) {
      expect(general.toLowerCase()).toContain(`${name}: ${value.toLowerCase()}`);
    }
  });

  it('leaves the workers.dev preview block unchanged', () => {
    const headers = normalizeLineEndings(readFileSync('website/public/_headers', 'utf8'));
    expect(headers).toContain('https://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex');
  });
});

interface TransportResult {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

const transportHttpRedirect = new Response(null, { status: 301, headers: { location: 'https://strandcue.co.za/' } });
const transportHttpsOk = new Response('<html></html>', {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'strict-transport-security': 'max-age=86400' },
});

async function loadTransportChecker() {
  expect(existsSync('scripts/check-website-transport.ts'), 'missing website transport checker').toBe(true);
  return import('../../scripts/check-website-transport.ts');
}

async function transportResults(http: Response | Error = transportHttpRedirect, https: Response | Error = transportHttpsOk): Promise<readonly TransportResult[]> {
  const { checkWebsiteTransport } = await loadTransportChecker();
  vi.stubGlobal('fetch', async (input: URL, options: RequestInit) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    if (input.protocol === 'http:') {
      expect(options.redirect).toBe('manual');
      if (http instanceof Error) throw http;
      return http;
    }
    expect(options.redirect).toBe('error');
    if (https instanceof Error) throw https;
    return https;
  });
  return checkWebsiteTransport('http://strandcue.co.za', 'https://strandcue.co.za');
}

describe('website transport checker', () => {
  it('passes a redirect to the approved HTTPS host carrying the staged HSTS floor', async () => {
    const results = await transportResults();
    expect(results.map(result => result.check)).toEqual(['http-redirect', 'http-redirect-host', 'https-strict-transport-security']);
    expect(results.every(result => result.ok)).toBe(true);
    expect(Object.isFrozen(results)).toBe(true);
    expect(results.every(result => Object.isFrozen(result))).toBe(true);
  });

  it.each(['https://strandcue.co.za.evil.test/', 'https://evilstrandcue.co.za/', 'https://other.test/'])(
    'rejects a redirect that leaves the approved host: %s',
    async location => {
      const results = await transportResults(new Response(null, { status: 301, headers: { location } }));
      expect(results[1].ok).toBe(false);
      expect(JSON.stringify(results)).not.toMatch(/evil|other\.test/);
    },
  );

  it('rejects a redirect that drops the canonical path', async () => {
    const results = await transportResults(new Response(null, { status: 301, headers: { location: 'https://strandcue.co.za/privacy?token=secret' } }));
    expect(results[1].ok).toBe(false);
    expect(JSON.stringify(results)).not.toMatch(/secret|token|privacy/);
  });

  it('rejects a redirect destination that carries credentials', async () => {
    const results = await transportResults(new Response(null, { status: 301, headers: { location: 'https://user:secret@strandcue.co.za/' } }));
    expect(results[1].ok).toBe(false);
    expect(JSON.stringify(results)).not.toMatch(/secret/);
  });

  it('fails when the HTTP origin does not redirect or omits the location', async () => {
    const notRedirected = await transportResults(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(notRedirected[0].ok).toBe(false);
    expect(notRedirected[1].ok).toBe(false);
    const noLocation = await transportResults(new Response(null, { status: 301 }));
    expect(noLocation[0].ok).toBe(false);
    expect(noLocation[1].ok).toBe(false);
    const badLocation = await transportResults(new Response(null, { status: 301, headers: { location: 'http://' } }));
    expect(badLocation[0].ok).toBe(false);
  });

  it('fails when the secure response is missing, weak, or malformed', async () => {
    const missingHsts = await transportResults(transportHttpRedirect, new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(missingHsts[2].ok).toBe(false);
    expect(missingHsts[2].detail).toContain('Strict-Transport-Security');
    const weakHsts = await transportResults(transportHttpRedirect, new Response('<html></html>', {
      status: 200, headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=3600' },
    }));
    expect(weakHsts[2].ok).toBe(false);
    const badStatus = await transportResults(transportHttpRedirect, new Response('nope', {
      status: 500, headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=86400' },
    }));
    expect(badStatus[2].ok).toBe(false);
    const badType = await transportResults(transportHttpRedirect, new Response('{}', {
      status: 200, headers: { 'content-type': 'application/json', 'strict-transport-security': 'max-age=86400' },
    }));
    expect(badType[2].ok).toBe(false);
  });

  it('redacts remote failures and never echoes destinations or credentials', async () => {
    const results = await transportResults(
      new Error('https://other.test/?token=private'),
      new Error('failed https://evil.test/?token=private'),
    );
    expect(results.every(result => !result.ok)).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/private|token|evil|other\.test/);
  });

  it('rejects unsafe transport origins but accepts localhost HTTP origins', async () => {
    const { checkWebsiteTransport } = await loadTransportChecker();
    const secure = 'https://strandcue.co.za';
    for (const origin of ['garbage', 'http://strandcue.co.za', 'ftp://localhost',
      'https://user:secret@strandcue.co.za', 'https://strandcue.co.za/privacy',
      'https://strandcue.co.za/?token=secret', 'https://strandcue.co.za/#secret']) {
      await expect(checkWebsiteTransport(secure, origin)).rejects.toThrow('Use an HTTPS origin');
    }
    for (const origin of ['garbage', 'https://strandcue.co.za', 'ftp://localhost',
      'http://user:secret@strandcue.co.za', 'http://strandcue.co.za/privacy',
      'http://strandcue.co.za/?token=secret', 'http://strandcue.co.za/#secret', 'http://other.test']) {
      await expect(checkWebsiteTransport(origin, secure)).rejects.toThrow();
    }
    vi.stubGlobal('fetch', async (_input: URL, options: RequestInit) => options.redirect === 'manual'
      ? new Response(null, { status: 308, headers: { location: 'http://127.0.0.1/' } })
      : new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=86400' } }));
    expect((await checkWebsiteTransport('http://127.0.0.1', 'http://127.0.0.1')).every(result => result.ok)).toBe(true);
  });

  it('runs main in-process and reports pass, hold, and invalid input without leaking', async () => {
    const { main } = await loadTransportChecker();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      vi.stubGlobal('fetch', async (_input: URL, options: RequestInit) => options.redirect === 'manual'
        ? new Response(null, { status: 301, headers: { location: 'https://strandcue.co.za/' } })
        : new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=86400' } }));
      process.exitCode = undefined;
      await main();
      expect(log.mock.calls.flat().join('\n').match(/WEBSITE-TRANSPORT-PASS/g)).toHaveLength(3);
      expect(error).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();

      vi.stubGlobal('fetch', async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
      process.exitCode = undefined;
      await main();
      expect(log.mock.calls.flat().join('\n')).toMatch(/WEBSITE-TRANSPORT-HOLD/);
      expect(process.exitCode).toBe(1);

      process.env.STRANDCUE_WEBSITE_TRANSPORT_HTTPS = 'https://user:secret@strandcue.co.za/?token=private';
      process.exitCode = undefined;
      await main();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('WEBSITE-TRANSPORT-HOLD: Invalid origin.'));
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join('\n')).not.toMatch(/secret|token|private/);
    } finally {
      delete process.env.STRANDCUE_WEBSITE_TRANSPORT_HTTPS;
      process.exitCode = previousExitCode;
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('runs the transport CLI against local servers and safely rejects unsafe input', async () => {
    await loadTransportChecker();
    const run = promisify(execFile);
    await withServer((_, response) => {
      response.writeHead(200, { 'content-type': 'text/html', 'strict-transport-security': 'max-age=86400' });
      response.end('<html></html>');
    }, async secureOrigin => {
      await withServer((_, response) => {
        response.writeHead(301, { location: `${secureOrigin}/` });
        response.end();
      }, async probeOrigin => {
        const { stdout, stderr } = await run(process.execPath, ['scripts/check-website-transport.ts'], {
          env: { ...process.env, STRANDCUE_WEBSITE_TRANSPORT_HTTP: probeOrigin, STRANDCUE_WEBSITE_TRANSPORT_HTTPS: secureOrigin },
        });
        expect(stdout.match(/WEBSITE-TRANSPORT-PASS/g)).toHaveLength(3);
        expect(stderr).toBe('');
      });
    });
    await withServer((_, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html></html>');
    }, async secureOrigin => {
      await withServer((_, response) => {
        response.writeHead(301, { location: `${secureOrigin}/` });
        response.end();
      }, async probeOrigin => {
        const failure = await run(process.execPath, ['scripts/check-website-transport.ts'], {
          env: { ...process.env, STRANDCUE_WEBSITE_TRANSPORT_HTTP: probeOrigin, STRANDCUE_WEBSITE_TRANSPORT_HTTPS: secureOrigin },
        }).catch(error => error as { code: number; stdout: string });
        expect(failure).toMatchObject({ code: 1 });
        expect(failure.stdout).toMatch(/WEBSITE-TRANSPORT-HOLD/);
      });
    });
    const bad = await run(process.execPath, ['scripts/check-website-transport.ts'], {
      env: { ...process.env, STRANDCUE_WEBSITE_TRANSPORT_HTTPS: 'https://user:secret@strandcue.co.za/?token=private' },
    }).catch(error => error as { code: number; stdout: string; stderr: string });
    expect(bad).toMatchObject({ code: 1, stdout: '' });
    expect(bad.stderr).toContain('WEBSITE-TRANSPORT-HOLD: Invalid origin.');
    expect(bad.stderr).not.toMatch(/secret|token|private/);
  });
});
