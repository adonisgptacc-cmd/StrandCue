const canonicalOrigin = 'https://strandcue.co.za';
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const hstsFloor = 86_400;
const networkFailure = 'Request failed (network, redirect, or timeout).';

export interface WebsiteTransportResult {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

function isLocal(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function validateOrigin(origin: string): URL {
  const message = 'Use an HTTPS origin (HTTP is allowed only for localhost), without credentials, path, query, or fragment.';
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error(message); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal(url)))
    || (!isLocal(url) && url.port !== '')
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(origin)) {
    throw new Error(message);
  }
  return url;
}

// The probe origin is insecure by design (http://strandcue.co.za), so it must be
// a plain HTTP origin on the same approved host as the secure origin.
function validateHttpOrigin(origin: string, httpsUrl: URL): URL {
  const message = 'Use the approved HTTP origin, without credentials, path, query, or fragment.';
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error(message); }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/'
    || (!isLocal(url) && url.port !== '')
    || url.search || url.hash || !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(origin)
    || url.hostname !== httpsUrl.hostname) {
    throw new Error(message);
  }
  return url;
}

function result(check: string, ok: boolean, detail: string): WebsiteTransportResult {
  return Object.freeze({ check, ok, detail });
}

// Fetch errors may contain redirect destinations or query strings. Never echo them.
async function probeHttpRedirect(httpUrl: URL, httpsUrl: URL): Promise<readonly [WebsiteTransportResult, WebsiteTransportResult]> {
  let response: Response;
  try {
    response = await fetch(httpUrl, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  } catch {
    return [result('http-redirect', false, networkFailure), result('http-redirect-host', false, networkFailure)];
  }
  if (!redirectStatuses.has(response.status)) {
    const detail = `Expected an HTTP redirect; received ${response.status}.`;
    return [result('http-redirect', false, detail), result('http-redirect-host', false, detail)];
  }
  let target: URL;
  try {
    const location = response.headers.get('location');
    if (!location) throw new Error('missing location');
    target = new URL(location, httpUrl);
  } catch {
    const detail = 'Redirect response is missing a valid Location header.';
    return [result('http-redirect', false, detail), result('http-redirect-host', false, detail)];
  }
  const schemeOk = target.protocol === httpsUrl.protocol;
  const redirectRow = result('http-redirect', schemeOk, schemeOk
    ? `HTTP ${response.status} redirect observed.`
    : 'Redirect does not target the secure origin scheme.');
  const credentials = Boolean(target.username || target.password);
  const hostOk = target.origin === httpsUrl.origin;
  const pathOk = target.pathname === httpsUrl.pathname;
  const hostDetail = credentials
    ? 'Redirect destination carries credentials.'
    : !hostOk
      ? 'Redirect left the approved host.'
      : !pathOk
        ? 'Redirect did not preserve the canonical path.'
        : `Redirect stays on ${httpsUrl.hostname} at the canonical path.`;
  return [redirectRow, result('http-redirect-host', hostOk && pathOk && !credentials, hostDetail)];
}

async function probeHttpsHsts(httpsUrl: URL): Promise<WebsiteTransportResult> {
  const name = 'https-strict-transport-security';
  let response: Response;
  try {
    response = await fetch(httpsUrl, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch {
    return result(name, false, networkFailure);
  }
  if (response.status !== 200) {
    return result(name, false, `Expected HTTP 200 from the secure origin; received ${response.status}.`);
  }
  if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    return result(name, false, 'Expected an HTML content type from the secure origin.');
  }
  const maxAge = parseHstsMaxAge(response.headers.get('strict-transport-security') ?? '');
  if (maxAge === null) return result(name, false, 'Missing or malformed Strict-Transport-Security directives.');
  if (maxAge < hstsFloor) return result(name, false, `Strict-Transport-Security max-age is below the staged floor of ${hstsFloor}.`);
  return result(name, true, `HTTP 200 with Strict-Transport-Security max-age=${maxAge}.`);
}

function parseHstsMaxAge(header: string): number | null {
  const seen = new Set<string>();
  let maxAge: number | null = null;
  for (const raw of header.split(';')) {
    // Parse the entire directive, including extension values, rather than finding
    // a numeric substring inside an unrelated name or malformed field value.
    const match = /^\s*([!#$%&'*+.^_`|~a-zA-Z0-9-]+)(?:\s*=\s*([!#$%&'*+.^_`|~a-zA-Z0-9-]+|"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"))?\s*$/.exec(raw);
    if (!match) return null;
    const directive = match[1].toLowerCase();
    if (seen.has(directive)) return null;
    seen.add(directive);
    if (directive === 'max-age') {
      const digits = match[2]?.replace(/^"(.*)"$/, '$1');
      if (!digits || !/^\d+$/.test(digits)) return null;
      maxAge = Number(digits);
      if (!Number.isSafeInteger(maxAge)) return null;
    } else if (['includesubdomains', 'preload'].includes(directive) && match[2] !== undefined) return null;
  }
  return maxAge;
}

export async function checkWebsiteTransport(httpOrigin: string, httpsOrigin: string): Promise<readonly WebsiteTransportResult[]> {
  const httpsUrl = validateOrigin(httpsOrigin);
  const httpUrl = validateHttpOrigin(httpOrigin, httpsUrl);
  const [redirectRow, hostRow] = await probeHttpRedirect(httpUrl, httpsUrl);
  const hstsRow = await probeHttpsHsts(httpsUrl);
  return Object.freeze([redirectRow, hostRow, hstsRow]);
}

export async function main(): Promise<void> {
  try {
    const results = await checkWebsiteTransport(
      process.env.STRANDCUE_WEBSITE_TRANSPORT_HTTP ?? 'http://strandcue.co.za',
      process.env.STRANDCUE_WEBSITE_TRANSPORT_HTTPS ?? canonicalOrigin,
    );
    for (const check of results) {
      console.log(`WEBSITE-TRANSPORT-${check.ok ? 'PASS' : 'HOLD'} ${check.check}: ${check.detail}`);
    }
    if (results.some(check => !check.ok)) process.exitCode = 1;
  } catch {
    console.error('WEBSITE-TRANSPORT-HOLD: Invalid origin. Use an HTTPS origin (HTTP only for localhost), without credentials, path, query, or fragment.');
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
