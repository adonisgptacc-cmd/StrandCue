import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectExpoSdkEvidence } from '../../scripts/expo-sdk-evidence';

afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('node:fs/promises'); vi.resetModules(); vi.useRealTimers(); });

async function runGate(mode: 'pass' | 'date-only' | 'missing') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  const evidence = collectExpoSdkEvidence(fileURLToPath(new URL('../../', import.meta.url)));
  vi.doMock('node:fs/promises', () => ({ readFile: async (url: URL) => {
    if (mode === 'missing') throw new Error('private path must not leak');
    if (url.pathname.endsWith('extensions.yaml')) return JSON.stringify({ extensions: [] });
    if (url.pathname.endsWith('extensions.lock')) return JSON.stringify({ schema: 'ai-project-extensions-lock.v2', observed: {} });
    return JSON.stringify([{ id: 'expo-compatible-sdk', checked_at: '2026-10-17', review_after: '2026-10-31',
      ...(mode === 'pass' ? { evidence } : {}) }]);
  } }));
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(value => { stdout.push(String(value)); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation(value => { stderr.push(String(value)); return true; });
  const previous = process.exitCode;
  try {
    vi.resetModules();
    await import('../../scripts/audit-cli');
    return { code: process.exitCode, out: stdout.join(''), err: stderr.join('') };
  } finally { process.exitCode = previous; }
}

describe('control-plane CLI evidence gate', () => {
  it('passes only after checking the installed SDK against the recorded claim', async () => {
    const result = await runGate('pass');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ findings: [], status: 'METADATA-PASS', expoEvidence: { expoVersion: '58.0.25' } });
  });
  it('holds a fresh claim lacking installation evidence', async () => {
    const result = await runGate('date-only');
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out)).toMatchObject({ status: 'HOLD', findings: [{ code: 'CLAIM-EVIDENCE' }] });
  });
  it('fails closed without leaking private paths when metadata cannot be read', async () => {
    const result = await runGate('missing');
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toBe('Control-plane metadata could not be read or parsed.\n');
  });
});
