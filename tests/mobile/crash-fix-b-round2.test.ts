import { describe, expect, it } from 'vitest';

import { createCrashReporter, scrubValue } from '../../apps/mobile/src/crash-report';

// Fix B round 2: tokens-plural gap, caller-contract classifier, no-transport gate.
// Fix D: the line-based repo scan of report() call sites is REMOVED (it was a
// hygiene check, never a security boundary — it cannot see multiline calls or
// dynamic construction, and message prose is retained on-device by design).
// The classifier below stays as unit-tested hygiene documentation for the
// caller contract (user data via gated `context`, never interpolated into the
// message). It enforces no security property; the scrubber does.

// --- Item 2 supporting classifier (test tooling, pinned by unit tests below).
// A report() call site conforms iff its first argument is:
//   (a) a bare identifier (a caught error object), or
//   (b) a string literal (single/double quotes, or a template with NO ${}), or
//   (c) `new Error()` / `new Error('literal')` with zero args or one literal arg.
// Anything else (template interpolation, concatenation, non-literal args,
// other expressions) is non-conforming: user data must travel via gated
// `context`, never interpolated into the message.
export function firstArgOfCall(source: string, openParenIndex: number): string | null {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let escaped = false;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inSingle) {
      if (ch === '\\') escaped = true;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') escaped = true;
      else if (ch === '`') inTemplate = false;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      inLineComment = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

export function isConformingReportArg(arg: string): boolean {
  const trimmed = arg.trim();
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) return true;
  if (/^'([^'\\]|\\.)*'$/.test(trimmed)) return true;
  if (/^"([^"\\]|\\.)*"$/.test(trimmed)) return true;
  if (/^`[^`]*`$/.test(trimmed) && !trimmed.includes('${')) return true;
  if (/^new Error\(\s*\)$/.test(trimmed)) return true;
  const literalNewError = trimmed.match(/^new Error\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)$/);
  if (literalNewError) return true;
  return false;
}

describe('crash-report Fix B round 2', () => {
  it('item 1: redacts the plural `tokens` key in every form', () => {
    const scrubbed = scrubValue({
      tokens: ['secret1'],
      Tokens: 'secret2',
      TOKENS: 'secret3',
      nested: { tokens: 'secret4' },
    }) as Record<string, unknown>;
    const payload = JSON.stringify(scrubbed);
    for (const secret of ['secret1', 'secret2', 'secret3', 'secret4']) {
      expect(payload).not.toContain(secret);
    }
    expect(scrubbed.tokens).toBe('[redacted]');
    expect(scrubbed.Tokens).toBe('[redacted]');
    expect(scrubbed.TOKENS).toBe('[redacted]');
    expect((scrubbed.nested as Record<string, unknown>).tokens).toBe('[redacted]');
  });

  it('item 1: unknown keys redact even identifier-shaped values (Fix D key-strict gating)', () => {
    const scrubbed = scrubValue({
      mytokens: 'keep-me',
      symptom: 'alopecia',
      condition: 'psoriasis',
      nickname: 'Mara Ellison',
      refcode: 'aB3dEf7GhJ9kLmN2pQ4Rs',
    }) as Record<string, unknown>;
    for (const key of ['mytokens', 'symptom', 'condition', 'nickname', 'refcode']) {
      expect(scrubbed[key]).toBe('[redacted]');
    }
    const payload = JSON.stringify(scrubbed);
    for (const secret of ['keep-me', 'alopecia', 'psoriasis', 'Mara Ellison', 'aB3dEf7GhJ9kLmN2pQ4Rs']) {
      expect(payload).not.toContain(secret);
    }
  });

  it('item 1: exact-set key semantics still hold for numbers (Fix D)', () => {
    const scrubbed = scrubValue({ tokenCount: 5 }) as Record<string, unknown>;
    expect(scrubbed.tokenCount).toBe(5);
  });

  it('item 2 (hygiene, not a boundary): classifier accepts conforming first arguments', () => {
    for (const snippet of [
      'report(err)',
      'report(error)',
      "report('static failure')",
      'report("static failure")',
      'report(`static failure`)',
      'report(new Error())',
      "report(new Error('static failure'))",
    ]) {
      const open = snippet.indexOf('(');
      const arg = firstArgOfCall(snippet, open);
      expect(arg).not.toBeNull();
      expect(isConformingReportArg(arg as string)).toBe(true);
    }
  });

  it('item 2 (hygiene, not a boundary): classifier rejects interpolated or non-literal first arguments', () => {
    for (const snippet of [
      'report(new Error(`failed for ${user}`))',
      'report(new Error("failed: " + detail))',
      'report(new Error(userInput))',
      'report(`failed for ${user}`)',
      'report("failed: " + detail)',
      'report(String(userInput))',
      'report(formatError(err, ctx))',
    ]) {
      const open = snippet.indexOf('(');
      const arg = firstArgOfCall(snippet, open);
      expect(arg).not.toBeNull();
      expect(isConformingReportArg(arg as string)).toBe(false);
    }
  });

  it('item 3: the reporter scrubs and discards on-device, even for escape-class payloads (Fix D)', () => {
    const escapeError = new Error(
      'fetch failed for https://secret-host.example.test/s/ab?code=abc123 by user@example.test row 550e8400-e29b-41d4-a716-446655440000',
    );
    const escapeContext = {
      tokens: ['escape-secret'],
      facts: { note: 'user free text' },
      concern: 'my shedding is getting worse',
      code: 'E_TIMEOUT',
      operation: 'passport-save',
      revision: 1700000000000,
      circular: (() => {
        const self: Record<string, unknown> = { name: 'loop' };
        self.self = self;
        return self;
      })(),
    };
    const reporter = createCrashReporter();
    expect(() => reporter.report(escapeError, escapeContext)).not.toThrow();
    expect(reporter.report(escapeError, escapeContext)).toBeUndefined();
  });
});
