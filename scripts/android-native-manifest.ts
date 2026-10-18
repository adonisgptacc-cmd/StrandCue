export interface NativeLibrary {
  readonly name: string;
  readonly machine: string;
  readonly needed: readonly string[];
}

export interface NativeManifestInput {
  readonly abis: Readonly<Record<string, readonly NativeLibrary[]>>;
}

export interface NativeManifestExpectation {
  readonly requiredAbis: readonly string[];
  readonly requiredLibraries: readonly string[];
  readonly allowedSystemDependencies: readonly string[];
}

export interface NativeManifestResult {
  readonly status: 'PASS' | 'HOLD';
  readonly errors: readonly string[];
}

const machineByAbi: Readonly<Record<string, string>> = Object.freeze({
  'arm64-v8a': 'AArch64',
  x86_64: 'Advanced Micro Devices X86-64',
  'armeabi-v7a': 'ARM',
  x86: 'Intel 80386',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && Array.from(value).every((item) => typeof item === 'string' && item.length > 0);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/** Validates already-parsed ZIP/ELF facts without reading files or mutating inputs. */
export function validateNativeManifest(
  input: NativeManifestInput,
  expected: NativeManifestExpectation,
): NativeManifestResult {
  const errors = new Set<string>();
  const rawInput: unknown = input;
  const rawExpected: unknown = expected;

  if (!isRecord(rawInput) || !isRecord(rawInput.abis)
    || !isRecord(rawExpected)
    || !isStringArray(rawExpected.requiredAbis)
    || !isStringArray(rawExpected.requiredLibraries)
    || !isStringArray(rawExpected.allowedSystemDependencies)
    || rawExpected.requiredAbis.length === 0
    || rawExpected.requiredLibraries.length === 0) {
    return Object.freeze({ status: 'HOLD', errors: Object.freeze(['MANIFEST_MALFORMED']) });
  }

  const abis = rawInput.abis;
  const requiredAbis = unique(rawExpected.requiredAbis);
  const requiredLibraries = unique(rawExpected.requiredLibraries);
  const allowedSystemDependencies = new Set(unique(rawExpected.allowedSystemDependencies));
  const providedAbis = Object.keys(abis);

  for (const abi of requiredAbis) {
    if (!Object.hasOwn(abis, abi)) errors.add('ABI_REQUIRED_MISSING');
  }
  if (providedAbis.some((abi) => !requiredAbis.includes(abi))) errors.add('ABI_UNEXPECTED');

  const requiredSets: string[][] = [];
  for (const abi of requiredAbis) {
    const rawLibraries = abis[abi];
    if (!Array.isArray(rawLibraries)) {
      errors.add('MANIFEST_MALFORMED');
      requiredSets.push([]);
      continue;
    }

    const libraryNames = new Set<string>();
    const libraries: NativeLibrary[] = [];
    for (const value of rawLibraries) {
      if (!isRecord(value) || typeof value.name !== 'string' || value.name.length === 0
        || typeof value.machine !== 'string' || !isStringArray(value.needed)) {
        errors.add('MANIFEST_MALFORMED');
        continue;
      }
      const library = value as unknown as NativeLibrary;
      if (libraryNames.has(library.name)) errors.add('LIBRARY_DUPLICATE');
      libraryNames.add(library.name);
      libraries.push(library);

      const expectedMachine = machineByAbi[abi];
      if (expectedMachine && library.machine !== expectedMachine) errors.add('ABI_ELF_MACHINE_MISMATCH');
    }

    const requiredPresent = requiredLibraries.filter((name) => libraryNames.has(name));
    requiredSets.push(requiredPresent);
    if (requiredLibraries.some((name) => !libraryNames.has(name))) errors.add('LIBRARY_REQUIRED_MISSING');

    for (const library of libraries) {
      for (const dependency of library.needed) {
        if (!libraryNames.has(dependency) && !allowedSystemDependencies.has(dependency)) {
          errors.add('DEPENDENCY_UNRESOLVED');
        }
      }
    }
  }

  if (requiredSets.length > 1) {
    const baseline = [...requiredSets[0]!].sort().join('\0');
    if (requiredSets.slice(1).some((set) => [...set].sort().join('\0') !== baseline)) {
      errors.add('ABI_LIBRARY_SET_MISMATCH');
    }
  }

  const stableErrors = Object.freeze([...errors].sort());
  return Object.freeze({ status: stableErrors.length === 0 ? 'PASS' : 'HOLD', errors: stableErrors });
}
