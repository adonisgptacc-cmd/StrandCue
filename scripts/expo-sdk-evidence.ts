import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { satisfiesVersionSpec } from './lock-agreement.ts';

const dependencyMap = z.record(z.string().regex(/^(?:@[\w.-]+\/)?[\w.-]+$/), z.string());
const manifestSchema = z.object({ dependencies: dependencyMap });
const lockSchema = z.object({ packages: z.record(z.string(), z.object({ version: z.string().optional() })) });
const versionSchema = z.object({ version: z.string() });
// Git checkouts use CRLF on Windows and LF in CI; only that representation
// difference is normalized. Any substantive input edit still changes evidence.
const hash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/** Offline installed-SDK agreement only. This does not claim the latest SDK,
 * native compatibility, device acceptance or hosted configuration correctness. */
export function collectExpoSdkEvidence(root: string) {
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const manifestText = read('apps/mobile/package.json');
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  if (!manifest.dependencies.expo) throw new Error('Expo dependency is required');
  const lockText = read('package-lock.json');
  const lock = lockSchema.parse(JSON.parse(lockText));
  const installedPath = (name: string) => ['apps/mobile/node_modules', 'apps/node_modules', 'node_modules']
    .map(base => `${base}/${name}`).find(path => existsSync(join(root, path, 'package.json')))
    ?? `node_modules/${name}`;
  const bundledText = read(`${installedPath('expo')}/bundledNativeModules.json`);
  const bundled = dependencyMap.parse(JSON.parse(bundledText));
  const installed = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)).map(([name, spec]) => {
    const path = installedPath(name);
    const { version } = versionSchema.parse(JSON.parse(read(`${path}/package.json`)));
    if (!satisfiesVersionSpec(version, spec) || lock.packages[path]?.version !== version
      || (bundled[name] !== undefined && !satisfiesVersionSpec(version, bundled[name]))) {
      throw new Error(`Expo installed dependency mismatch: ${name}`);
    }
    return [name, version];
  }));
  return {
    kind: 'installed-expo-sdk' as const, expoVersion: installed.expo,
    manifestSha256: hash(manifestText), lockSha256: hash(lockText),
    bundledSha256: hash(bundledText), installedSha256: hash(JSON.stringify(installed)),
  };
}
