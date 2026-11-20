import { describe, expect, it } from 'vitest';
import {
  validateNativeManifest,
  type NativeManifestExpectation,
  type NativeManifestInput,
} from '../../scripts/android-native-manifest.ts';

const expectation: NativeManifestExpectation = {
  requiredAbis: ['arm64-v8a', 'x86_64'],
  requiredLibraries: ['libc++_shared.so', 'libreactnative.so'],
  allowedSystemDependencies: ['libc.so', 'libdl.so', 'liblog.so', 'libm.so'],
};

const valid: NativeManifestInput = {
  abis: {
    'arm64-v8a': [
      { name: 'libc++_shared.so', machine: 'AArch64', needed: ['libc.so', 'libdl.so'] },
      { name: 'libreactnative.so', machine: 'AArch64', needed: ['libc++_shared.so', 'liblog.so'] },
    ],
    x86_64: [
      { name: 'libc++_shared.so', machine: 'Advanced Micro Devices X86-64', needed: ['libc.so', 'libm.so'] },
      { name: 'libreactnative.so', machine: 'Advanced Micro Devices X86-64', needed: ['libc++_shared.so', 'liblog.so'] },
    ],
  },
};

describe('validateNativeManifest', () => {
  it('accepts a valid manifest with matching required libraries for both ABIs', () => {
    expect(validateNativeManifest(valid, expectation)).toEqual({ status: 'PASS', errors: [] });
  });

  it('holds when a required ABI is missing', () => {
    const result = validateNativeManifest({ abis: { 'arm64-v8a': valid.abis['arm64-v8a'] } }, expectation);
    expect(result.errors).toContain('ABI_REQUIRED_MISSING');
  });

  it('holds when libreactnative.so is absent', () => {
    const result = validateNativeManifest({
      abis: {
        'arm64-v8a': [valid.abis['arm64-v8a'][0]!],
        x86_64: [valid.abis.x86_64[0]!],
      },
    }, expectation);
    expect(result.errors).toContain('LIBRARY_REQUIRED_MISSING');
  });

  it('holds when an unexpected ABI is present', () => {
    const result = validateNativeManifest({ ...valid, abis: { ...valid.abis, armeabi: [] } }, expectation);
    expect(result.errors).toContain('ABI_UNEXPECTED');
  });

  it('holds when an ELF machine does not match its ABI', () => {
    const result = validateNativeManifest({
      abis: { ...valid.abis, 'arm64-v8a': [{ ...valid.abis['arm64-v8a'][0]!, machine: 'Advanced Micro Devices X86-64' }] },
    }, expectation);
    expect(result.errors).toContain('ABI_ELF_MACHINE_MISMATCH');
  });

  it.each([
    ['armeabi-v7a', 'armeabi-v7a'],
    ['arm64v8a', 'arm64v8a'],
  ])('rejects unsupported expected ABI %s before inspecting library records', (expectedAbi, inputAbi) => {
    const input = {
      abis: {
        [inputAbi]: [{ name: 'libreactnative.so', machine: 'arbitrary-machine', needed: ['missing.so'] }],
      },
    } as unknown as NativeManifestInput;
    const expected = { ...expectation, requiredAbis: [expectedAbi] };
    const before = JSON.stringify({ input, expected });

    expect(validateNativeManifest(input, expected)).toEqual({ status: 'HOLD', errors: ['ABI_UNSUPPORTED'] });
    expect(JSON.stringify({ input, expected })).toBe(before);
  });

  it('holds on duplicate library entries within an ABI', () => {
    const libraries = valid.abis['arm64-v8a'];
    const result = validateNativeManifest({
      abis: { ...valid.abis, 'arm64-v8a': [...libraries, libraries[0]!] },
    }, expectation);
    expect(result.errors).toContain('LIBRARY_DUPLICATE');
  });

  it('holds when a DT_NEEDED entry names a missing shared object', () => {
    const result = validateNativeManifest({
      abis: {
        ...valid.abis,
        'arm64-v8a': [{ ...valid.abis['arm64-v8a'][1]!, needed: ['libmissing-from-readelf.so'] }, valid.abis['arm64-v8a'][0]!],
      },
    }, expectation);
    expect(result.errors).toContain('DEPENDENCY_UNRESOLVED');
  });

  it('holds when a required library is missing from each ABI', () => {
    const result = validateNativeManifest({
      abis: {
        'arm64-v8a': [valid.abis['arm64-v8a'][0]!],
        x86_64: [valid.abis.x86_64[0]!],
      },
    }, expectation);
    expect(result.errors).toContain('LIBRARY_REQUIRED_MISSING');
    expect(result.errors).not.toContain('DEPENDENCY_UNRESOLVED');
  });

  it('holds on malformed readelf-derived records without exposing input paths', () => {
    const secretPath = 'C:/private/builds/libsecret.so';
    const malformed = {
      abis: { 'arm64-v8a': [{ name: secretPath, machine: null, needed: 'not-an-array' }], x86_64: [] },
    } as unknown as NativeManifestInput;
    const result = validateNativeManifest(malformed, expectation);
    expect(result.errors).toContain('MANIFEST_MALFORMED');
    expect(JSON.stringify(result)).not.toContain(secretPath);
  });

  it('holds when the expectation is malformed', () => {
    const result = validateNativeManifest(valid, {
      ...expectation,
      requiredAbis: 'arm64-v8a',
    } as unknown as NativeManifestExpectation);
    expect(result).toEqual({ status: 'HOLD', errors: ['MANIFEST_MALFORMED'] });
  });

  it('holds when a readelf-derived dependency list contains a sparse entry', () => {
    const sparseDependencies = new Array<string>(1);
    const malformed = {
      abis: {
        ...valid.abis,
        'arm64-v8a': [{ ...valid.abis['arm64-v8a'][0]!, needed: sparseDependencies }],
      },
    };
    expect(validateNativeManifest(malformed, expectation).errors).toContain('MANIFEST_MALFORMED');
  });

  it('holds when required library sets differ between ABIs', () => {
    const result = validateNativeManifest({
      abis: { ...valid.abis, x86_64: [valid.abis.x86_64[0]!] },
    }, expectation);
    expect(result.errors).toContain('ABI_LIBRARY_SET_MISMATCH');
  });

  it('does not mutate manifest inputs or expectations', () => {
    const manifest = structuredClone(valid);
    const expected = structuredClone(expectation);
    const before = JSON.stringify({ manifest, expected });
    validateNativeManifest(manifest, expected);
    expect(JSON.stringify({ manifest, expected })).toBe(before);
  });
});
