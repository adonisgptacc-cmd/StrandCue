// Scrubbed crash-report envelope. The Sentry DSN stays unset until the Beta
// provider decision; until then the default transport is a no-op and nothing
// leaves the device. Every field is scrubbed before transport: emails,
// identifiers, secret-like query params, sensitive keys and long free text.

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const secretQueryPattern = /([?&#](?:code|token|access_token|secret|key)=)[^&#\s]*/gi;

const sensitiveKeys = new Set([
  'email', 'username', 'notes', 'password', 'token', 'secret',
  'authorization', 'sessionid', 'session_id', 'userid', 'user_id',
]);

const MAX_STRING = 200;

export function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const redacted = value
      .replace(emailPattern, '[redacted-email]')
      .replace(uuidPattern, '[redacted-id]')
      .replace(secretQueryPattern, '$1[redacted]');
    return redacted.length > MAX_STRING ? redacted.slice(0, MAX_STRING) : redacted;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: scrubValue(value.message), stack: scrubValue(value.stack ?? null) };
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeys.has(key.toLowerCase().replace(/[^a-z]/g, '')) ? '[redacted]' : scrubValue(item),
      ]),
    );
  }
  return '[redacted]';
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
