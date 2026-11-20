// Device-local crash reporter. There is no transport: the reporter scrubs
// and discards everything on-device, and nothing leaves the device. A
// production transport can only arrive via the separately reviewed
// observability-enablement task; no public API accepts a transport function,
// so the no-op property holds structurally (nothing can leave by
// construction), not by configuration.
//
// Scrubbing rules (Task 12, hardened by Fix B, key-strict by Fix D):
// - Scrub the FULL string first, then truncate: a token past char 200 must
//   still be caught, so truncation never runs before redaction.
// - Object keys are normalized (lowercased, non-letters stripped) and matched
//   against sensitiveKeys; the set carries the normalized forms explicitly
//   (accessToken -> accesstoken, refresh_token -> refreshtoken,
//   X-API-Key -> xapikey) plus cookie/set-cookie.
// - URLs are replaced WHOLE with a fixed `[redacted-url]` marker, preserving
//   NOTHING (no scheme, host, path, query, or fragment). URL match rule:
//     (a) any `scheme://…` (`[a-zA-Z][a-zA-Z0-9+.-]*://` + non-space run),
//         which covers https?:// and custom schemes such as strandcue://;
//     (b) explicit `strandcue:…` without slashes (recovery callbacks);
//     (c) schemeless dotted-host WITH a path (`api.example.test/reset?…`).
//   Over/under-match analysis: (c) requires a dotted host whose final label
//   is alphabetic (so `v2.3.1` never matches) plus a `/path` (so `a/b testing`,
//   `report.pdf`, and bare `example.com` never match). Remaining under-match:
//   bare domains without a path are left alone (no path/query tokens to leak,
//   and prose mentions like "see example.com docs" are common); secrets in
//   them must travel with a recognizable email/uuid/token shape to be caught.
//   Trailing `.,;:!?)` punctuation is left outside the marker.
// - ALLOWLIST RULE (private by default): a string nested inside a plain
//   object or array is PRESERVED only when every check below passes;
//   anything else becomes `[redacted]`:
//     1. its key is in neither sensitiveKeys nor payloadKeys (both force
//        `[redacted]` regardless of shape);
//     2. its scrubbed text is exactly `[redacted-url]`, `[redacted-email]`
//        or `[redacted-id]` (a bare secret-shaped value, kept as a marker),
//        OR its normalized key is in safeKeys (code, kind, component,
//        operation, revision, status) AND it matches the safe identifier
//        shape `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` (additionally allows a
//        leading digit and dots, for versions/build codes).
//   Array items carry no key, so only whole-value markers survive in arrays.
//   Consequences, by construction: free-text-shaped values (spaces,
//   sentences, >64 chars, email/uuid/token shapes, which scrub to marker
//   text containing `[`/`]`) ALWAYS redact, even under safe keys; and EVERY
//   string under an unknown key redacts, even when identifier-shaped
//   (condition names, short tokens, personal names) — key membership, never
//   value shape, decides. Value SHAPE alone never allowlists anything.
// - payloadKeys (facts, decision, execution, deviation, replacement, concern,
//   notes, reason, detail, query, results, rows, input, output, payload)
//   redact WHOLE (`[redacted]`) regardless of shape: these carry
//   database-payload or user-entered free text. `notes` was already in
//   sensitiveKeys; the outcome is identical.
// - Numbers/booleans: booleans, null and undefined pass through; numbers pass
//   only when finite with |n| <= 1e9 (timestamps, snowflake IDs, phone
//   numbers redact). Numeric strings are gated by the key-strict rule above.
// - Error name/message/stack and all other top-level strings are
//   pattern-scrubbed only (prose preserved, secrets substituted): the error
//   message is the primary first-party diagnostic signal the reporter exists
//   to carry, and top-level strings carry no key context to gate on. Callers
//   must pass user data via context (fully gated), never interpolated into
//   the message. Nothing leaves the device, so this prose stays on-device.
// - Known limitation: bare free-text hex/token strings with no scheme, key,
//   or URL shape (e.g. a lone top-level `abcd1234…` with no `token=`/`Basic`/
//   URL around it) cannot be redacted without false positives on ordinary
//   words and identifiers, so they are left intact. This applies only to
//   top-level (keyless) strings: the same token nested under any unknown key
//   redacts by the allowlist rule above. Secrets must travel with a
//   recognizable shape to be caught at the top level.
// - Database-payload-shaped objects get no structural pass: unlisted keys
//   still recurse, with a depth cap (5), an array cap (50 items) and a
//   key cap (100 keys) plus a circular-reference guard so a hostile or
//   cyclic payload can neither leak nor crash the reporter.

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const secretQueryPattern = /([?&#](?:code|token|access_token|refresh_token|secret|key|api_key|apikey|password)=)[^&#\s]*/gi;
const strandcuePattern = /\bstrandcue:[^\s"'<>]+/gi;
const urlPattern = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g;
const bareHostPathPattern = /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::\d{1,5})?\/[^\s"'<>]*/g;
const cookiePattern = /((?:cookie|set-cookie)\s*:\s*)[^\r\n"']+/gi;
const authSchemePattern = /((?:bearer|basic)\s+)[A-Za-z0-9\-_.~+/=]+/gi;

const sensitiveKeys = new Set([
  'email', 'username', 'notes', 'password', 'token', 'tokens', 'secret',
  'authorization', 'sessionid', 'session_id', 'userid', 'user_id',
  'accesstoken', 'refreshtoken', 'apikey', 'xapikey', 'cookie', 'setcookie',
  'clientsecret', 'privatekey',
]);

const payloadKeys = new Set([
  'facts', 'decision', 'execution', 'deviation', 'replacement', 'concern',
  'notes', 'reason', 'detail', 'query', 'results', 'rows', 'input', 'output',
  'payload',
]);

const safeKeys = new Set([
  'code', 'kind', 'component', 'operation', 'revision', 'status',
]);

const safeValuePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const wholeValueMarkers = new Set(['[redacted-url]', '[redacted-email]', '[redacted-id]']);

const MAX_NUMBER = 1e9;

const MAX_STRING = 200;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_KEYS = 100;

function redactUrlMatch(match: string): string {
  const trailing = match.match(/[.,;:!?)]+$/);
  const tail = trailing ? trailing[0] : '';
  const url = tail ? match.slice(0, -tail.length) : match;
  if (!url) return match;
  return `[redacted-url]${tail}`;
}

function scrubText(value: string): string {
  const redacted = value
    .replace(strandcuePattern, redactUrlMatch)
    .replace(urlPattern, redactUrlMatch)
    .replace(bareHostPathPattern, redactUrlMatch)
    .replace(cookiePattern, '$1[redacted]')
    .replace(authSchemePattern, '$1[redacted]')
    .replace(emailPattern, '[redacted-email]')
    .replace(uuidPattern, '[redacted-id]')
    .replace(secretQueryPattern, '$1[redacted]');
  return redacted.length > MAX_STRING ? redacted.slice(0, MAX_STRING) : redacted;
}

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z]/g, '');

function gateNestedString(scrubbed: string, key: string | undefined): string {
  if (wholeValueMarkers.has(scrubbed)) return scrubbed;
  if (key === undefined) return '[redacted]';
  if (!safeKeys.has(normalizeKey(key))) return '[redacted]';
  return safeValuePattern.test(scrubbed) ? scrubbed : '[redacted]';
}

function scrubInner(value: unknown, depth: number, seen: Set<object>): unknown {
  if (typeof value === 'string') {
    return scrubText(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= MAX_NUMBER ? value : '[redacted]';
  }
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (value instanceof Error) {
    return { name: scrubText(value.name), message: scrubText(value.message), stack: value.stack == null ? null : scrubText(value.stack) };
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return '[redacted-depth]';
    if (seen.has(value)) return '[redacted-circular]';
    seen.add(value);
    const items = value.slice(0, MAX_ITEMS).map(item =>
      typeof item === 'string' ? gateNestedString(scrubText(item), undefined) : scrubInner(item, depth + 1, seen),
    );
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
      entries.slice(0, MAX_KEYS).map(([key, item]) => {
        const normalized = normalizeKey(key);
        if (sensitiveKeys.has(normalized) || payloadKeys.has(normalized)) return [key, '[redacted]'];
        if (typeof item === 'string') return [key, gateNestedString(scrubText(item), key)];
        return [key, scrubInner(item, depth + 1, seen)];
      }),
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

// No transport exists: report() scrubs and discards on-device. A future
// approved transport arrives only via the separately reviewed
// observability-enablement task; until then there is no public API that
// accepts a transport function, so exfiltration is impossible by
// construction. CrashEnvelope above documents the shape such a transport
// would carry; nothing in this module sends one.
export function createCrashReporter() {
  return {
    report(error: unknown, context: unknown = {}) {
      try {
        scrubValue(error);
        scrubValue(context);
      } catch {
        // Crash reporting must never break the app.
      }
    },
  };
}
