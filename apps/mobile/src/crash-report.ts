// Scrubbed crash-report envelope. The Sentry DSN stays unset until the Beta
// provider decision; until then the default transport is a no-op and nothing
// leaves the device. Every field is scrubbed before transport.
//
// Scrubbing rules (Task 12):
// - Scrub the FULL string first, then truncate: a token past char 200 must
//   still be caught, so truncation never runs before redaction.
// - Object keys are normalized (lowercased, non-letters stripped) and matched
//   against sensitiveKeys; the set carries the normalized forms explicitly
//   (accessToken -> accesstoken, refresh_token -> refreshtoken,
//   X-API-Key -> xapikey) plus cookie/set-cookie.
// - URLs (any scheme) are scrubbed structurally: credentials, query and
//   fragment are dropped, and path segments that look like tokens (length >=
//   24 over an unreserved-token alphabet: JWTs, hex/base64 secrets) become
//   [redacted]. Short human path segments survive for debuggability.
// - Cookie/set-cookie header values and bearer/basic credentials are redacted
//   in free text; a cookie value redacts to end of line because pairs chain.
//   (A cookie line stops at a double quote so JSON envelopes stay parseable.)
// - Known limitation: bare free-text hex/token strings with no scheme, key,
//   or URL shape (e.g. a lone `abcd1234…` with no `token=`/`Basic`/URL around
//   it) cannot be redacted without false positives on ordinary words and
//   identifiers, so they are left intact. Secrets must travel with a
//   recognizable shape to be caught.
// - Database-payload-shaped objects get no special pass: every nested value
//   is pattern-scrubbed, with a depth cap (5), an array cap (50 items) and a
//   key cap (100 keys) plus a circular-reference guard so a hostile or
//   cyclic payload can neither leak nor crash the reporter.

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const secretQueryPattern = /([?&#](?:code|token|access_token|refresh_token|secret|key|api_key|apikey|password)=)[^&#\s]*/gi;
const urlPattern = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g;
const cookiePattern = /((?:cookie|set-cookie)\s*:\s*)[^\r\n"']+/gi;
const authSchemePattern = /((?:bearer|basic)\s+)[A-Za-z0-9\-_.~+/=]+/gi;
const tokenPathSegment = /^[A-Za-z0-9\-_.~%=]{24,}$/;

const sensitiveKeys = new Set([
  'email', 'username', 'notes', 'password', 'token', 'secret',
  'authorization', 'sessionid', 'session_id', 'userid', 'user_id',
  'accesstoken', 'refreshtoken', 'apikey', 'xapikey', 'cookie', 'setcookie',
  'clientsecret', 'privatekey',
]);

const MAX_STRING = 200;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_KEYS = 100;

function scrubUrl(match: string): string {
  let parsed: URL;
  try {
    parsed = new URL(match);
  } catch {
    return '[redacted-url]';
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  if (parsed.search) parsed.search = '?[redacted]';
  parsed.pathname = parsed.pathname
    .split('/')
    .map(segment => (tokenPathSegment.test(segment) ? '[redacted]' : segment))
    .join('/');
  return parsed.toString();
}

function scrubText(value: string): string {
  const redacted = value
    .replace(urlPattern, scrubUrl)
    .replace(cookiePattern, '$1[redacted]')
    .replace(authSchemePattern, '$1[redacted]')
    .replace(emailPattern, '[redacted-email]')
    .replace(uuidPattern, '[redacted-id]')
    .replace(secretQueryPattern, '$1[redacted]');
  return redacted.length > MAX_STRING ? redacted.slice(0, MAX_STRING) : redacted;
}

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z]/g, '');

function scrubInner(value: unknown, depth: number, seen: Set<object>): unknown {
  if (typeof value === 'string') {
    return scrubText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: scrubInner(value.message, depth + 1, seen), stack: scrubInner(value.stack ?? null, depth + 1, seen) };
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return '[redacted-depth]';
    if (seen.has(value)) return '[redacted-circular]';
    seen.add(value);
    const items = value.slice(0, MAX_ITEMS).map(item => scrubInner(item, depth + 1, seen));
    seen.delete(value);
    if (value.length > MAX_ITEMS) items.push('[redacted-truncated]');
    return items;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[redacted-depth]';
    if (seen.has(value)) return '[redacted-circular]';
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>);
    const scrubbed: Record<string, unknown> = Object.fromEntries(
      entries.slice(0, MAX_KEYS).map(([key, item]) => [
        key,
        sensitiveKeys.has(normalizeKey(key)) ? '[redacted]' : scrubInner(item, depth + 1, seen),
      ]),
    );
    if (entries.length > MAX_KEYS) scrubbed['[redacted-keys]'] = '[truncated]';
    seen.delete(value);
    return scrubbed;
  }
  return '[redacted]';
}

export function scrubValue(value: unknown): unknown {
  return scrubInner(value, 0, new Set());
}

export interface CrashEnvelope {
  readonly message: unknown;
  readonly stack: unknown;
  readonly context: unknown;
  readonly timestamp: string;
}

export type CrashTransport = (envelope: CrashEnvelope) => void;

export function createCrashReporter(options: { transport?: CrashTransport } = {}) {
  const transport = options.transport;
  return {
    report(error: unknown, context: unknown = {}) {
      try {
        if (!transport) return;
        const scrubbed = scrubValue(error);
        transport({
          message: scrubbed && typeof scrubbed === 'object' && 'message' in (scrubbed as Record<string, unknown>)
            ? (scrubbed as Record<string, unknown>).message
            : scrubbed,
          stack: scrubbed && typeof scrubbed === 'object' ? (scrubbed as Record<string, unknown>).stack ?? null : null,
          context: scrubValue(context),
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Crash reporting must never break the app.
      }
    },
  };
}
