import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCrashReporter, scrubValue } from '../../apps/mobile/src/crash-report';

// Fix B round 2: tokens-plural gap, enforced caller contract, transport-flip gate.

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

const here = dirname(fileURLToPath(import.meta.url));
const mobileSrc = resolve(here, '..', '..', 'apps', 'mobile', 'src');

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
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

  it('item 1: exact-set semantics — nearby innocent keys are unaffected by the key rule', () => {
    const scrubbed = scrubValue({ mytokens: 'keep-me', tokenCount: 5 }) as Record<string, unknown>;
    expect(scrubbed.mytokens).toBe('keep-me');
    expect(scrubbed.tokenCount).toBe(5);
  });

  it('item 2: classifier accepts conforming first arguments', () => {
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

  it('item 2: classifier rejects interpolated or non-literal first arguments', () => {
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

  it('item 2: every report() call site in apps/mobile/src passes a caught error or a literal', () => {
    const files = collectTsFiles(mobileSrc).filter(path => !path.endsWith('crash-report.ts'));
    expect(files.length).toBeGreaterThan(10);
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const stripped = line.includes('//') ? line.slice(0, line.indexOf('//')) : line;
        const match = /\.report\s*\(/.exec(stripped);
        if (!match || match.index === undefined) return;
        const absoluteOpen = match.index + match[0].length - 1;
        const arg = firstArgOfCall(stripped, absoluteOpen);
        if (arg === null || !isConformingReportArg(arg)) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it('item 3: the no-option default never invokes any transport, even for escape-class payloads', () => {
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
    for (const reporter of [createCrashReporter(), createCrashReporter({})]) {
      expect(() => reporter.report(escapeError, escapeContext)).not.toThrow();
      expect(reporter.report(escapeError, escapeContext)).toBeUndefined();
    }
  });
});
