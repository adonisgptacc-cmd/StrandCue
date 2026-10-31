import { randomUUID } from 'node:crypto';

const canonicalOrigin = 'https://strandcue.co.za';
const routes = ['/', '/privacy', '/delete-account', '/support', '/terms'] as const;
const requiredDirectives = [
  "default-src 'self'", "script-src 'none'", "style-src 'self'", "img-src 'self'",
  "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'",
] as const;
const requiredHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'deny',
} as const;

export interface WebsiteCheckResult {
  readonly route: string;
  readonly status: number | null;
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isLocal(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function validateOrigin(origin: string): URL {
  const message = 'Use an HTTPS origin (HTTP is allowed only for localhost), without credentials, path, query, or fragment.';
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error(message); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal(url)))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(origin)) {
    throw new Error(message);
  }
  return url;
}

function hasMetadata(html: string, route: string): boolean {
  const canonical = `${canonicalOrigin}${route}`;
  return html.includes(`<link rel="canonical" href="${canonical}"`)
    && html.includes(`<meta property="og:url" content="${canonical}"`)
    && /<title>[^<]*StrandCue[^<]*<\/title>/.test(html)
    && /<meta name="description" content="[^"]+"/.test(html);
}

function headerErrors(headers: Headers, origin: URL, publicPage: boolean): readonly string[] {
  const directives = (headers.get('content-security-policy') ?? '').toLowerCase().split(';').map(value => value.trim());
  const errors = requiredDirectives.filter(directive => !directives.includes(directive))
    .map(directive => `Missing restrictive content-security-policy directive: ${directive}.`);
  const basicErrors = Object.entries(requiredHeaders)
    .filter(([name, value]) => headers.get(name)?.toLowerCase().trim() !== value)
    .map(([name]) => `Missing or invalid ${name}.`);
  const permissions = (headers.get('permissions-policy') ?? '').toLowerCase().split(',').map(value => value.trim());
  const permissionErrors = ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']
    .filter(value => !permissions.includes(value)).map(value => `Missing permissions-policy restriction: ${value}.`);
  const noindex = /\bnoindex\b/i.test(headers.get('x-robots-tag') ?? '');
  const indexingErrors = origin.hostname.endsWith('.workers.dev') && !noindex
    ? ['Worker previews must set X-Robots-Tag: noindex.']
    : origin.origin === canonicalOrigin && publicPage && noindex
      ? ['Canonical public pages must allow indexing.'] : [];
  return [...errors, ...basicErrors, ...permissionErrors, ...indexingErrors];
}

function result(route: string, status: number | null, errors: readonly string[]): WebsiteCheckResult {
  return Object.freeze({ route, status, ok: errors.length === 0, errors: Object.freeze([...errors]) });
}

async function checkRoute(origin: URL, route: string, publicPage: boolean): Promise<WebsiteCheckResult> {
  try {
    const response = await fetch(new URL(route, origin), {
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (response.redirected || (response.url && new URL(response.url).origin !== origin.origin)) {
      return result(route, response.status, ['Unexpected response origin or redirect.']);
    }
    const html = await response.text();
    const expectedStatus = publicPage ? 200 : 404;
    const errors = [
      ...(response.status !== expectedStatus ? [`Expected HTTP ${expectedStatus}; received ${response.status}.`] : []),
      ...(!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ? ['Expected an HTML content type.'] : []),
      ...(publicPage && !hasMetadata(html, route) ? ['Missing canonical metadata.'] : []),
      ...(!publicPage && (!html.includes('Page not found') || !html.includes('strandcue')
        || !html.includes('href="/support"') || !html.includes('content="noindex"')) ? ['Missing branded not-found response.'] : []),
      ...(!isLocal(origin) ? headerErrors(response.headers, origin, publicPage) : []),
    ];
    return result(route, response.status, errors);
  } catch {
    // Fetch errors may contain redirect destinations or query strings. Never echo them.
    return result(route, null, ['Request failed (network, redirect, or timeout).']);
  }
}

export async function checkWebsite(origin: string): Promise<readonly WebsiteCheckResult[]> {
  const url = validateOrigin(origin);
  const checks = [...routes, `/__strandcue-check-${randomUUID()}`];
  return Object.freeze(await Promise.all(checks.map((route, index) => checkRoute(url, route, index < routes.length))));
}

async function main(): Promise<void> {
  const results = await checkWebsite(process.env.STRANDCUE_WEBSITE_ORIGIN ?? canonicalOrigin);
  for (const check of results) {
    console.log(`WEBSITE-${check.ok ? 'PASS' : 'HOLD'} ${check.route}: ${check.ok ? `HTTP ${check.status}` : check.errors.join(' ')}`);
  }
  if (results.some(check => !check.ok)) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch(() => {
    console.error('WEBSITE-HOLD: Invalid origin. Use an HTTPS origin (HTTP only for localhost), without credentials, path, query, or fragment.');
    process.exitCode = 1;
  });
}
