import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inspectAndroidNativeManifest,
  inspectAndroidNativeZipEntries,
  parseArtifactInspectionOutputs,
  verifyAndroidArtifact,
  type AndroidArtifactMetadata,
} from './verify-android-artifact.ts';

/**
 * The verifier profile for the INTERNAL Task 2.5 emulator artifact. It is deliberately a separate module: the release
 * verifier (`verify-android-artifact.ts`) pins the locally signed alpha identity and is unchanged, so it still rejects
 * this artifact. This profile accepts only a debug-signed APK built for the loopback local Supabase test stack, whose
 * receipt carries the internal classification, whose cleartext allowance is restricted to the emulator's host alias, and
 * whose bundled configuration holds no hosted Supabase project, service-role material or secret key.
 */
export const INTERNAL_ARTIFACT_STATEMENT = 'Internal debug-signed emulator acceptance artifact configured for the loopback local Supabase test stack. This artifact is not approved for distribution.';
const CLASSIFICATION = 'internal-debug-signed-emulator-acceptance';
const BACKEND = 'loopback-local-supabase';
const CLEARTEXT_SCOPE = 'loopback-test-backend-only';
const LOCAL_BACKEND_PORT = '54321';

export interface InternalArtifactProfile {
  readonly packageName: string;
  readonly versionName: string;
  readonly versionCode: string;
  readonly sourceCommit: string;
  readonly abis: readonly string[];
  readonly nativeManifestSha256: string;
  /** The Gradle debug certificate. Never the alpha identity. */
  readonly signerSha256: string;
  readonly localBackendHost: string;
}

/** Pinned in tracked code after the build, exactly as the release pins are. */
export const TASK_2_5_INTERNAL_PROFILE: InternalArtifactProfile = Object.freeze({
  packageName: 'za.co.strandcue.app',
  versionName: '0.1.0',
  versionCode: '1',
  sourceCommit: '2e18aba9573d800f632952e0b8d5d1306694222e',
  abis: Object.freeze(['arm64-v8a', 'x86_64']),
  nativeManifestSha256: 'c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd',
  // The standard Gradle debug certificate (CN=Android Debug), read from the built artifact. It is not the alpha identity.
  signerSha256: 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c',
  localBackendHost: '10.0.2.2',
});

export interface BundleScan {
  readonly productionSupabaseHosts: readonly string[];
  readonly serviceRoleMaterial: number;
  /** Known secret values (given by the caller, never stored here) found in the bundle. */
  readonly secretKeys: number;
  /** Bare `sb_secret_` literals. Libraries carry the prefix as a string, so this is information, not a finding. */
  readonly secretKeyPrefixLiterals: number;
  readonly supabaseEndpoints: readonly string[];
  readonly otherCleartextHosts: readonly string[];
}

export interface InternalArtifactEvidence {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly globalCleartext: boolean;
  readonly networkSecurityConfig: { readonly baseCleartext: boolean; readonly cleartextDomains: readonly string[] } | null;
  readonly scan: BundleScan;
}

const SUPABASE_HOST = /\.supabase\.(?:co|in|net)$/i;

function isServiceRoleToken(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded !== null && typeof decoded === 'object' && (decoded as { role?: unknown }).role === 'service_role';
  } catch { return false; }
}

/**
 * Scans a bundle (or any file) for what must never ship in the internal artifact. It returns counts and hostnames only:
 * a token or key value is never returned, so the result is safe to print and to commit.
 */
export function scanBundleStrings(data: Buffer, knownSecretValues: readonly string[] = []): BundleScan {
  const text = data.toString('latin1');
  const production = new Set<string>();
  const endpoints = new Set<string>();
  const cleartext = new Set<string>();
  for (const match of text.matchAll(/(https?):\/\/([A-Za-z0-9.-]+)(?::(\d+))?/g)) {
    const [, scheme, host, port] = match;
    if (SUPABASE_HOST.test(host)) production.add(host.toLowerCase());
    // A backend endpoint is a Supabase host or the local stack's port. The React Native dev-server and inspector
    // literals (localhost:8081 and the like) are not the backend: they are listed as other cleartext hosts.
    const isEndpoint = SUPABASE_HOST.test(host) || port === LOCAL_BACKEND_PORT;
    if (isEndpoint) endpoints.add(`${scheme}://${host}${port ? `:${port}` : ''}`);
    else if (scheme === 'http') cleartext.add(host.toLowerCase());
  }
  const tokens = [...text.matchAll(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g)].map(match => match[0]);
  return {
    productionSupabaseHosts: [...production].sort(),
    serviceRoleMaterial: tokens.filter(isServiceRoleToken).length,
    secretKeys: knownSecretValues.filter(value => value.length >= 8 && text.includes(value)).length,
    secretKeyPrefixLiterals: [...text.matchAll(/sb_secret_/g)].length,
    supabaseEndpoints: [...endpoints].sort(),
    otherCleartextHosts: [...cleartext].sort(),
  };
}

/** Whether the manifest declares a global cleartext allowance (`android:usesCleartextTraffic` true). */
export function manifestDeclaresGlobalCleartext(manifestTree: string): boolean {
  return /android:usesCleartextTraffic[^\r\n]*\(type 0x12\)(0x[0-9a-f]+)/i.exec(manifestTree)?.[1] === '0xffffffff';
}

/** Whether the manifest points at a network security config. */
export const manifestHasNetworkSecurityConfig = (manifestTree: string): boolean => /android:networkSecurityConfig/.test(manifestTree);

/** Reads the cleartext policy out of an `aapt dump xmltree` of the network security config. */
export function parseNetworkSecurityConfig(tree: string): { baseCleartext: boolean; cleartextDomains: string[] } | null {
  if (!/E: network-security-config/.test(tree)) return null;
  const flag = (block: string): boolean | null => {
    const value = /cleartextTrafficPermitted[^\r\n]*\(type 0x12\)(0x[0-9a-f]+)/i.exec(block)?.[1];
    return value === undefined ? null : value !== '0x0';
  };
  const base = /E: base-config[\s\S]*?(?=\r?\n\s*E: domain-config|$)/.exec(tree)?.[0] ?? '';
  const domains: string[] = [];
  for (const block of tree.split(/\r?\n\s*E: domain-config/).slice(1)) {
    if (flag(block) === true) for (const match of block.matchAll(/C: "([^"]+)"/g)) domains.push(match[1]);
  }
  // A base config that says nothing permits cleartext only if the platform default does, which it does not for this target.
  return { baseCleartext: flag(base) === true, cleartextDomains: domains };
}

/** The file a named resource lives in, from `aapt dump --values resources` (a release build renames it, e.g. res/8G.xml). */
export function locateResourceFile(resourcesDump: string, resourceName: string): string | null {
  const line = new RegExp(`resource 0x[0-9a-f]+ [^\\s:]+:${resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[^\\r\\n]*\\r?\\n\\s*\\(string8\\) "(res/[^"]+)"`).exec(resourcesDump);
  return line?.[1] ?? null;
}

export function verifyAndroidInternalArtifact(
  metadata: AndroidArtifactMetadata,
  evidence: InternalArtifactEvidence,
  profile: InternalArtifactProfile = TASK_2_5_INTERNAL_PROFILE,
): { status: 'PASS' | 'HOLD'; errors: string[] } {
  // The ordinary checks, with this profile's pins. Nothing was re-signed, so the input APK is the signed APK.
  const base = verifyAndroidArtifact(metadata, {
    packageName: profile.packageName, sourceCommit: profile.sourceCommit, inputApkSha256: metadata.apkSha256 ?? '', abis: [...profile.abis],
    nativeManifestSha256: profile.nativeManifestSha256, versionName: profile.versionName, expectedVersionCode: profile.versionCode, signerCount: 1, signerSha256: profile.signerSha256,
  });
  const errors = [...base.errors];
  if (evidence.receipt.classification !== CLASSIFICATION) errors.push('CLASSIFICATION_MISMATCH');
  if (evidence.receipt.backend !== BACKEND) errors.push('BACKEND_CLASSIFICATION_MISMATCH');
  if (evidence.receipt.statement !== INTERNAL_ARTIFACT_STATEMENT) errors.push('STATEMENT_MISMATCH');
  if (evidence.receipt.notApprovedForDistribution !== true) errors.push('DISTRIBUTION_FLAG_MISMATCH');
  if (evidence.receipt.cleartextScope !== CLEARTEXT_SCOPE) errors.push('CLEARTEXT_SCOPE_MISMATCH');
  if (evidence.globalCleartext) errors.push('GLOBAL_CLEARTEXT');
  const policy = evidence.networkSecurityConfig;
  if (policy === null) errors.push('NETWORK_SECURITY_CONFIG_MISSING');
  else {
    if (policy.baseCleartext) errors.push('CLEARTEXT_NOT_RESTRICTED');
    // Exactly the emulator's host alias: no other host, and not an empty list that would mean nothing was granted.
    if (policy.cleartextDomains.length !== 1 || policy.cleartextDomains[0] !== profile.localBackendHost) errors.push('CLEARTEXT_HOST_MISMATCH');
  }
  const { scan } = evidence;
  if (scan.productionSupabaseHosts.length > 0) errors.push('PRODUCTION_HOST_BUNDLED');
  if (scan.serviceRoleMaterial > 0) errors.push('SERVICE_ROLE_BUNDLED');
  if (scan.secretKeys > 0) errors.push('SECRET_KEY_BUNDLED');
  if (scan.supabaseEndpoints.length === 0) errors.push('BACKEND_ENDPOINT_MISSING');
  else if (scan.supabaseEndpoints.some(endpoint => endpoint !== `http://${profile.localBackendHost}:${LOCAL_BACKEND_PORT}`)) errors.push('BACKEND_ENDPOINT_MISMATCH');
  const distinct = [...new Set(errors)];
  return { status: distinct.length === 0 ? 'PASS' : 'HOLD', errors: distinct };
}

// --- The command-line inspection (the same tools as the release verifier) -----------------------------------------

type Run = (command: string, args: string[], cwd?: string) => string;
const run: Run = (command, args, cwd) => execFileSync(command, args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });

export function inspectInternalArtifact(apkPath: string, env: Readonly<Record<string, string | undefined>>, runCommand: Run = run): { metadata: AndroidArtifactMetadata; evidence: InternalArtifactEvidence } {
  const apk = resolve(apkPath);
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : '');
  const tools = env.ANDROID_BUILD_TOOLS || join(sdk, 'build-tools', '36.0.0');
  const aapt = join(tools, 'aapt.exe');
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'java.exe') : 'java.exe';
  const jar = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'jar.exe') : 'jar.exe';
  const zipalign = join(tools, 'zipalign.exe');
  if (!/\bVerification successful\b/i.test(runCommand(zipalign, ['-c', '-P', '16', '-v', '4', apk]))) throw new Error('ZIPALIGN_OUTPUT_MISSING');
  const badging = runCommand(aapt, ['dump', 'badging', apk]);
  const manifestTree = runCommand(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml']);
  const signer = runCommand(java, ['-jar', join(tools, 'lib', 'apksigner.jar'), 'verify', '--verbose', '--print-certs', apk]);
  const archiveListing = runCommand(jar, ['tf', apk]);
  const nativeManifestSha256 = inspectAndroidNativeManifest(apk, archiveListing, env, runCommand);
  const receiptPath = env.STRANDCUE_ANDROID_SOURCE_RECEIPT || `${apk}.source-receipt.json`;
  const receiptText = readFileSync(receiptPath, 'utf8');
  const apkSha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
  const metadata = parseArtifactInspectionOutputs({
    badging, signer, archiveListing, nativeManifestSha256, sourceReceipt: receiptText, apkSha256, manifestTree, nativeZipEntries: inspectAndroidNativeZipEntries(apk),
  });
  let receipt: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(receiptText); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) receipt = parsed as Record<string, unknown>; } catch { /* a malformed receipt is a HOLD below */ }

  const temporary = mkdtempSync(join(tmpdir(), 'strandcue-internal-'));
  try {
    runCommand(jar, ['xf', apk, 'assets/index.android.bundle'], temporary);
    // The secret values to look for come from the caller's process environment and are only compared, never stored or printed.
    const known = [env.SUPABASE_ACCEPTANCE_ADMIN_KEY, env.STRANDCUE_SUPABASE_SECRET_KEY].filter((value): value is string => typeof value === 'string' && value !== '');
    const scan = scanBundleStrings(readFileSync(join(temporary, 'assets', 'index.android.bundle')), known);
    const file = manifestHasNetworkSecurityConfig(manifestTree) ? locateResourceFile(runCommand(aapt, ['dump', '--values', 'resources', apk]), 'xml/network_security_config') : null;
    const networkSecurityConfig = file ? parseNetworkSecurityConfig(runCommand(aapt, ['dump', 'xmltree', apk, file])) : null;
    return { metadata: { ...metadata, nativeManifestSha256 }, evidence: { receipt, globalCleartext: manifestDeclaresGlobalCleartext(manifestTree), networkSecurityConfig, scan } };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const apk = process.argv[2];
    if (!apk) throw new Error('APK_PATH_REQUIRED');
    const { metadata, evidence } = inspectInternalArtifact(apk, process.env);
    const result = verifyAndroidInternalArtifact(metadata, evidence);
    if (result.status === 'PASS') {
      process.stdout.write(`ANDROID-INTERNAL-ARTIFACT-PASS package=${metadata.packageName} version=${metadata.versionName} source=${metadata.sourceCommit} abi=${metadata.abi.join(',')} signerSha256=${metadata.signerSha256} apkSha256=${metadata.apkSha256} backend=${evidence.receipt.backend} classification=${evidence.receipt.classification}\n`);
    } else {
      process.stderr.write(`ANDROID-INTERNAL-ARTIFACT-HOLD:${result.errors.join(',')}\n`);
      process.exitCode = 1;
    }
    process.stdout.write(`scan: endpoints=${evidence.scan.supabaseEndpoints.join(',')} otherCleartextHosts=${evidence.scan.otherCleartextHosts.join(',') || 'none'} networkSecurityConfig=${JSON.stringify(evidence.networkSecurityConfig)}\n`);
  } catch (error) {
    process.stderr.write(`ANDROID-INTERNAL-ARTIFACT-HOLD:${error instanceof Error ? error.message : 'INSPECTION_FAILED'}\n`);
    process.exitCode = 1;
  }
}
