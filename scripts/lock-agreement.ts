import { z } from 'zod';

/**
 * Deterministic, offline agreement gate between a package manifest and the
 * lockfile CI installs it from.
 *
 * It answers one question per manifest: does every declared direct dependency
 * resolve, in the paired lockfile, to a version the declared spec accepts? A
 * spec that cannot be understood fails closed, so an unpinned or exotic spec
 * can never pass the gate silently.
 */

export type LockAgreementFinding = {
  code: 'LOCK-DRIFT' | 'LOCK-UNRESOLVED' | 'LOCK-MANIFEST-MISMATCH';
  manifestPath: string;
  detail: string;
};

export type LockAgreementInput = {
  /** Repository-relative manifest path, for example `apps/mobile/package.json`. */
  manifestPath: string;
  manifest: unknown;
  /** Repository-relative lockfile path that CI installs the manifest from. */
  lockPath: string;
  lock: unknown;
};

const dependencyMapSchema = z.record(
  z.string().trim().min(1),
  z.string().trim().min(1),
);

const manifestSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1).optional(),
  dependencies: dependencyMapSchema.optional().default({}),
  devDependencies: dependencyMapSchema.optional().default({}),
}).passthrough();

const lockedPackageSchema = z.object({
  name: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
  link: z.boolean().optional(),
  dependencies: dependencyMapSchema.optional(),
  devDependencies: dependencyMapSchema.optional(),
}).passthrough();

const lockfileSchema = z.object({
  lockfileVersion: z.literal(3),
  packages: z.record(z.string(), lockedPackageSchema),
}).passthrough();

const inputSchema = z.object({
  manifestPath: z.string().trim().min(1),
  manifest: z.unknown(),
  lockPath: z.string().trim().min(1),
  lock: z.unknown(),
});

type Manifest = z.infer<typeof manifestSchema>;
type LockedPackage = z.infer<typeof lockedPackageSchema>;
type LockedPackages = Record<string, LockedPackage>;
type ManifestField = 'dependencies' | 'devDependencies';

function agreementError(): Error {
  return new Error('LOCK-AGREEMENT The manifest and lockfile inventory is invalid.');
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('/')
    || normalized === ''
    || normalized.split('/').includes('..')) {
    throw agreementError();
  }
  return normalized;
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

function entryKeyFor(manifestDirectory: string, lockDirectory: string): string {
  if (manifestDirectory === lockDirectory) return '';
  const prefix = lockDirectory === '' ? '' : `${lockDirectory}/`;
  if (!manifestDirectory.startsWith(prefix)) throw agreementError();
  return manifestDirectory.slice(prefix.length);
}

function finding(
  code: LockAgreementFinding['code'],
  manifestPath: string,
  detail: string,
): LockAgreementFinding {
  return { code, manifestPath, detail };
}

function sortedNames(names: Set<string>): string[] {
  return [...names].sort();
}

function compareEntry(
  manifestPath: string,
  manifest: Manifest,
  lockedEntry: LockedPackage,
  entryKey: string,
): LockAgreementFinding[] {
  const findings: LockAgreementFinding[] = [];
  const lockedName = entryKey === '' ? '.' : entryKey;
  if (lockedEntry.name !== undefined && lockedEntry.name !== manifest.name) {
    findings.push(finding(
      'LOCK-MANIFEST-MISMATCH',
      manifestPath,
      `the lockfile entry ${lockedName} declares package ${lockedEntry.name}`
      + ` while ${manifestPath} declares ${manifest.name}`,
    ));
  }
  if (manifest.version !== undefined
    && lockedEntry.version !== undefined
    && lockedEntry.version !== manifest.version) {
    findings.push(finding(
      'LOCK-MANIFEST-MISMATCH',
      manifestPath,
      `the lockfile entry ${lockedName} declares version ${lockedEntry.version}`
      + ` while ${manifestPath} declares ${manifest.version}`,
    ));
  }

  const fields: ManifestField[] = ['dependencies', 'devDependencies'];
  for (const field of fields) {
    const declared = manifest[field];
    const recorded = lockedEntry[field] ?? {};
    for (const name of sortedNames(new Set([...Object.keys(declared), ...Object.keys(recorded)]))) {
      if (declared[name] !== recorded[name]) {
        findings.push(finding(
          'LOCK-MANIFEST-MISMATCH',
          manifestPath,
          `the lockfile entry ${lockedName} records ${field}.${name} as`
          + ` ${recorded[name] ?? 'absent'} while ${manifestPath} declares`
          + ` ${declared[name] ?? 'absent'}`,
        ));
      }
    }
  }

  return findings;
}

function findLockedResolution(
  packages: LockedPackages,
  entryKey: string,
  name: string,
): LockedPackage | undefined {
  let directory = entryKey;
  for (;;) {
    const candidate = directory === ''
      ? `node_modules/${name}`
      : `${directory}/node_modules/${name}`;
    const resolved = packages[candidate];
    if (resolved !== undefined) return resolved;
    if (directory === '') return undefined;
    const separator = directory.lastIndexOf('/');
    directory = separator === -1 ? '' : directory.slice(0, separator);
  }
}

function declaredSpecs(manifest: Manifest): [string, string][] {
  const specs = new Map<string, string>();
  for (const field of ['dependencies', 'devDependencies'] as ManifestField[]) {
    for (const name of sortedNames(new Set(Object.keys(manifest[field])))) {
      if (!specs.has(name)) specs.set(name, manifest[field][name]);
    }
  }
  return [...specs];
}

function compareResolutions(
  manifestPath: string,
  manifest: Manifest,
  packages: LockedPackages,
  entryKey: string,
): LockAgreementFinding[] {
  const findings: LockAgreementFinding[] = [];

  for (const [name, spec] of declaredSpecs(manifest)) {
    const resolution = findLockedResolution(packages, entryKey, name);
    if (resolution === undefined) {
      findings.push(finding(
        'LOCK-UNRESOLVED',
        manifestPath,
        `${manifestPath} declares ${name}@${spec} but the lockfile holds no resolution for it`,
      ));
      continue;
    }
    if (resolution.link === true) continue;
    if (resolution.version === undefined) {
      findings.push(finding(
        'LOCK-UNRESOLVED',
        manifestPath,
        `${manifestPath} declares ${name}@${spec} but the locked entry records no version`,
      ));
      continue;
    }
    if (!satisfiesVersionSpec(resolution.version, spec)) {
      findings.push(finding(
        'LOCK-DRIFT',
        manifestPath,
        `${manifestPath} declares ${name}@${spec} but the lockfile resolves it to ${resolution.version}`,
      ));
    }
  }

  return findings;
}

/**
 * Report every disagreement between the given manifests and their lockfiles.
 * Returns an empty array when every declaration is resolved as declared, and
 * throws `LOCK-AGREEMENT` when an input cannot be read as a manifest or lock.
 */
export function auditLockAgreement(inputs: unknown): LockAgreementFinding[] {
  const parsedInputs = z.array(inputSchema).min(1).safeParse(inputs);
  if (!parsedInputs.success) throw agreementError();

  const findings: LockAgreementFinding[] = [];
  const seen = new Set<string>();

  for (const input of parsedInputs.data) {
    const manifestPath = normalizeRepositoryPath(input.manifestPath);
    if (!/(^|\/)package\.json$/.test(manifestPath) || seen.has(manifestPath)) {
      throw agreementError();
    }
    seen.add(manifestPath);

    const manifest = manifestSchema.safeParse(input.manifest);
    const lock = lockfileSchema.safeParse(input.lock);
    if (!manifest.success || !lock.success) throw agreementError();

    const entryKey = entryKeyFor(
      directoryOf(manifestPath),
      directoryOf(normalizeRepositoryPath(input.lockPath)),
    );
    const lockedEntry = lock.data.packages[entryKey];
    if (lockedEntry === undefined) throw agreementError();

    findings.push(...compareEntry(manifestPath, manifest.data, lockedEntry, entryKey));
    findings.push(...compareResolutions(
      manifestPath,
      manifest.data,
      lock.data.packages,
      entryKey,
    ));
  }

  return findings;
}

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (string | number)[];
};

type PartialVersion = {
  major: number;
  minor?: number;
  patch?: number;
};

type Comparator = {
  operator: '=' | '>' | '>=' | '<' | '<=';
  version: ParsedVersion;
};

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const partialVersionPattern = /^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/;
const wildcardPattern = /^(\*|x|X)$/;

function parseVersion(value: string): ParsedVersion | undefined {
  const match = versionPattern.exec(value.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split('.').map(identifier => (
        /^\d+$/.test(identifier) ? Number(identifier) : identifier
      ))
      : [],
  };
}

function parsePartialVersion(value: string): PartialVersion | undefined {
  const match = partialVersionPattern.exec(value.trim());
  if (!match) return undefined;
  const optionalPart = (part: string | undefined): number | undefined => (
    part === undefined || wildcardPattern.test(part) ? undefined : Number(part)
  );
  return {
    major: Number(match[1]),
    minor: optionalPart(match[2]),
    patch: optionalPart(match[3]),
  };
}

function versionOf(partial: PartialVersion, minor = 0, patch = 0): ParsedVersion {
  return {
    major: partial.major,
    minor: partial.minor ?? minor,
    patch: partial.patch ?? patch,
    prerelease: [],
  };
}

function comparePrerelease(
  left: ParsedVersion['prerelease'],
  right: ParsedVersion['prerelease'],
): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart < rightPart ? -1 : 1;
    }
    if (typeof leftPart === 'number') return -1;
    if (typeof rightPart === 'number') return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const part of ['major', 'minor', 'patch'] as const) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function lowerBound(partial: PartialVersion): Comparator {
  return { operator: '>=', version: versionOf(partial) };
}

function upperBound(bound: ParsedVersion): Comparator {
  return { operator: '<', version: bound };
}

function expandCaret(partial: PartialVersion): Comparator[] {
  const { major, minor, patch } = partial;
  let bound: ParsedVersion;
  if (minor === undefined || major > 0) {
    bound = { major: major + 1, minor: 0, patch: 0, prerelease: [] };
  } else if (minor > 0) {
    bound = { major: 0, minor: minor + 1, patch: 0, prerelease: [] };
  } else if (patch === undefined) {
    bound = { major: 0, minor: 1, patch: 0, prerelease: [] };
  } else {
    bound = { major: 0, minor: 0, patch: patch + 1, prerelease: [] };
  }
  return [lowerBound(partial), upperBound(bound)];
}

function expandTilde(partial: PartialVersion): Comparator[] {
  const { major, minor } = partial;
  const bound: ParsedVersion = minor === undefined
    ? { major: major + 1, minor: 0, patch: 0, prerelease: [] }
    : { major, minor: minor + 1, patch: 0, prerelease: [] };
  return [lowerBound(partial), upperBound(bound)];
}

function expandToken(token: string): Comparator[] | undefined {
  if (wildcardPattern.test(token)) return [];

  if (token.startsWith('^') || token.startsWith('~')) {
    const partial = parsePartialVersion(token.slice(1));
    if (!partial) return undefined;
    return token.startsWith('^') ? expandCaret(partial) : expandTilde(partial);
  }

  const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
  if (!match) return undefined;
  const operator = (match[1] ?? '=') as Comparator['operator'];
  const value = match[2];

  const exact = parseVersion(value);
  if (exact && operator === '=') return [{ operator: '=', version: exact }];

  const partial = parsePartialVersion(value);
  if (!partial) return undefined;
  if (operator === '=') {
    if (partial.minor === undefined) return expandCaret({ major: partial.major });
    if (partial.patch === undefined) return expandTilde(partial);
    return [{ operator: '=', version: versionOf(partial) }];
  }
  return [{ operator, version: versionOf(partial) }];
}

function parseComparators(spec: string): Comparator[][] | undefined {
  const groups: Comparator[][] = [];
  for (const branch of spec.split('||')) {
    const trimmed = branch.trim();
    if (trimmed === '') return undefined;
    const comparators: Comparator[] = [];
    for (const token of trimmed.split(/\s+/)) {
      const expanded = expandToken(token);
      if (expanded === undefined) return undefined;
      comparators.push(...expanded);
    }
    groups.push(comparators);
  }
  return groups.length === 0 ? undefined : groups;
}

function sameReleaseTuple(left: ParsedVersion, right: ParsedVersion): boolean {
  return left.major === right.major
    && left.minor === right.minor
    && left.patch === right.patch;
}

function satisfiesComparators(
  candidate: ParsedVersion,
  comparators: readonly Comparator[],
): boolean {
  if (candidate.prerelease.length > 0
    && !comparators.some(comparator => (
      comparator.version.prerelease.length > 0 && sameReleaseTuple(comparator.version, candidate)
    ))) {
    return false;
  }

  return comparators.every(comparator => {
    const ordering = compareVersions(candidate, comparator.version);
    switch (comparator.operator) {
      case '=': return ordering === 0;
      case '>': return ordering > 0;
      case '>=': return ordering >= 0;
      case '<': return ordering < 0;
      case '<=': return ordering <= 0;
      default: return false;
    }
  });
}

/**
 * True when `version` is accepted by the npm-style range `spec`. Specs that are
 * not a supported range fail closed: an unreadable or unpinned spec can never
 * agree with a lock, so the gate reports it instead of passing it.
 */
export function satisfiesVersionSpec(version: string, spec: string): boolean {
  const candidate = parseVersion(version);
  if (!candidate) return false;
  const groups = parseComparators(spec);
  if (!groups) return false;
  return groups.some(comparators => satisfiesComparators(candidate, comparators));
}
