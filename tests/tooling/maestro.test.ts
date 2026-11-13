import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const flowsDirectory = '.maestro';

async function flowSources(): Promise<{ name: string; source: string }[]> {
  const names = (await readdir(flowsDirectory)).filter(name => name.endsWith('.yaml')).sort();
  return Promise.all(names.map(async name => ({ name, source: await readFile(`${flowsDirectory}/${name}`, 'utf8') })));
}

async function mobileSources(): Promise<string> {
  const { readdir: readDir } = await import('node:fs/promises');
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readDir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...await walk(path));
      else if (/\.(tsx?|json)$/.test(entry.name)) files.push(path);
    }
    return files;
  };
  const files = await walk('apps/mobile');
  const contents = await Promise.all(files.map(file => readFile(file, 'utf8')));
  return contents.join('\n');
}

describe('Maestro critical-path flows', () => {
  it('declares an appId and asserts visible outcomes in every flow', async () => {
    const flows = await flowSources();
    expect(flows.length).toBeGreaterThanOrEqual(3);
    for (const flow of flows) {
      expect(flow.source).toMatch(/^appId:\s*\S+/m);
      const assertions = [...flow.source.matchAll(/-\s*assertVisible:\s*['"]?(.+?)['"]?\s*$/gm)]
        .map(match => match[1].trim().replace(/^['"]|['"]$/g, ''));
      expect(assertions.length).toBeGreaterThanOrEqual(1);
      (flow as { expected?: string[] }).expected = assertions;
    }
  });

  it('asserts only text that exists in the mobile source', async () => {
    const flows = await flowSources();
    const mobile = await mobileSources();
    for (const flow of flows) {
      const assertions = [...flow.source.matchAll(/-\s*assertVisible:\s*['"]?(.+?)['"]?\s*$/gm)]
        .map(match => match[1].trim().replace(/^['"]|['"]$/g, ''));
      for (const text of assertions) {
        expect(mobile, `${flow.name} asserts "${text}" which is absent from apps/mobile`).toContain(text);
      }
    }
  });

  it('taps labeled controls only and carries no secrets', async () => {
    const flows = await flowSources();
    for (const flow of flows) {
      expect(flow.source).not.toMatch(/point:\s*['"]?\d/);
      expect(flow.source).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(flow.source).not.toMatch(/password\s*:\s*\S/i);
      expect(flow.source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(flow.source).not.toMatch(/sb_(secret|publishable)_/);
    }
  });
});
