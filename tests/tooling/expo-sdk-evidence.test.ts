import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectExpoSdkEvidence } from '../../scripts/expo-sdk-evidence';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))); roots.length = 0; });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'strandcue-sdk-'));
  roots.push(root);
  const json = async (path: string, value: unknown) => {
    const file = join(root, path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, JSON.stringify(value));
  };
  const manifest = { dependencies: { expo: '57.0.22', react: '19.2.3' } };
  await json('apps/mobile/package.json', manifest);
  await json('node_modules/expo/package.json', { version: '57.0.22' });
  await json('node_modules/react/package.json', { version: '19.2.3' });
  await json('node_modules/expo/bundledNativeModules.json', { react: '19.2.3' });
  await json('package-lock.json', { packages: {
    'node_modules/expo': { version: '57.0.22' }, 'node_modules/react': { version: '19.2.3' },
  } });
  return { root, json, manifest };
}

describe('installed Expo SDK evidence', () => {
  it('checks installed packages before fingerprinting local evidence', async () => {
    const { root, manifest } = await fixture();
    expect(collectExpoSdkEvidence(root)).toMatchObject({
      kind: 'installed-expo-sdk', expoVersion: '57.0.22', manifestSha256: hash(JSON.stringify(manifest)),
      bundledSha256: hash(JSON.stringify({ react: '19.2.3' })),
    });
  });
  it.each([
    ['node_modules/react/package.json', { version: '19.3.0' }],
    ['node_modules/expo/bundledNativeModules.json', { react: '18.0.0' }],
    ['apps/mobile/package.json', { dependencies: { expo: '57.0.22', react: '18.0.0' } }],
    ['package-lock.json', { packages: { 'node_modules/expo': { version: '57.0.22' } } }],
  ])('fails closed when %s disagrees with the checked install', async (path, value) => {
    const { root, json } = await fixture();
    await json(path as string, value);
    expect(() => collectExpoSdkEvidence(root)).toThrow(/dependency mismatch/);
  });
  it('uses workspace-local resolutions when they shadow hoisted packages', async () => {
    const { root, json } = await fixture();
    await json('apps/mobile/node_modules/react/package.json', { version: '19.2.3' });
    await json('node_modules/react/package.json', { version: '0.0.0' });
    await json('package-lock.json', { packages: {
      'node_modules/expo': { version: '57.0.22' },
      'apps/mobile/node_modules/react': { version: '19.2.3' },
    } });
    expect(collectExpoSdkEvidence(root)).toHaveProperty('expoVersion', '57.0.22');
  });
  it('does not ignore an intermediate apps/node_modules shadow', async () => {
    const { root, json } = await fixture();
    await json('apps/node_modules/react/package.json', { version: '0.0.0' });
    expect(() => collectExpoSdkEvidence(root)).toThrow(/dependency mismatch/);
  });
  it('fails closed when an installed dependency is absent', async () => {
    const { root } = await fixture();
    await rm(join(root, 'node_modules/react/package.json'));
    expect(() => collectExpoSdkEvidence(root)).toThrow(/ENOENT/);
  });
  it('keeps equivalent Windows and Linux checkout evidence identical', async () => {
    const { root } = await fixture();
    const manifestLf = '{\n "dependencies": {"expo":"57.0.22","react":"19.2.3"}\n}\n';
    const lockLf = `${await readFile(join(root, 'package-lock.json'), 'utf8')}\n`;
    await writeFile(join(root, 'apps/mobile/package.json'), manifestLf.replaceAll('\n', '\r\n'));
    await writeFile(join(root, 'package-lock.json'), lockLf.replaceAll('\n', '\r\n'));
    expect(collectExpoSdkEvidence(root)).toMatchObject({ manifestSha256: hash(manifestLf), lockSha256: hash(lockLf) });
  });
  it('refuses incomplete or unsafe metadata rather than emitting usable evidence', async () => {
    const { root, json } = await fixture();
    await json('apps/mobile/package.json', { dependencies: { '../outside': '1.0.0' } });
    expect(() => collectExpoSdkEvidence(root)).toThrow();
    await json('apps/mobile/package.json', { dependencies: {} });
    expect(() => collectExpoSdkEvidence(root)).toThrow(/Expo dependency/);
  });
});
