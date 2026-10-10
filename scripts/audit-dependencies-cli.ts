import { execFile } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import {
  auditDependencyPolicy,
  countDependencyVulnerabilities,
  summarizeDependencyAudit,
} from './dependency-policy.ts';
import {
  validateWorkspaceManifestPaths,
  workspaceManifestCandidates,
  workspaceManifestGlobs,
} from './workspace-manifests.ts';

const MAX_AUDIT_OUTPUT_BYTES = 20 * 1024 * 1024;

type NpmAuditExecution = {
  exitCode: 0 | 1;
  output: string;
};

function runNpmAudit(): Promise<NpmAuditExecution> {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath?.trim()) {
    return Promise.reject(new Error('npm CLI path is unavailable'));
  }

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [npmExecPath, 'audit', '--include=dev', '--json'],
      {
        encoding: 'utf8',
        maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        const output = typeof stdout === 'string' ? stdout : '';
        if (!error || error.code === 1) {
          if (output.trim()) {
            resolve({ exitCode: error ? 1 : 0, output });
          } else {
            reject(new Error('npm audit returned no JSON'));
          }
          return;
        }

        reject(new Error('npm audit execution failed'));
      },
    );
  });
}

async function readExceptionRegistry(): Promise<unknown> {
  const registryUrl = new URL(
    '../docs/verification/dependency-advisory-exceptions.json',
    import.meta.url,
  );
  return JSON.parse(await readFile(registryUrl, 'utf8')) as unknown;
}

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8')) as unknown;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readRegularJson(
  fileUrl: URL,
  optional = false,
): Promise<unknown | undefined> {
  try {
    const metadata = await lstat(fileUrl);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Workspace metadata must be a regular file');
    }
    return JSON.parse(await readFile(fileUrl, 'utf8')) as unknown;
  } catch (error) {
    if (optional && isMissingFile(error)) return undefined;
    throw error;
  }
}

function readRuntimePlatforms(appConfig: unknown): ('android' | 'web')[] {
  if (!appConfig || typeof appConfig !== 'object' || !('expo' in appConfig)) {
    throw new Error('Expo runtime surface configuration is unavailable');
  }
  const expo = appConfig.expo;
  if (!expo || typeof expo !== 'object' || !('platforms' in expo)) {
    throw new Error('Expo runtime surface configuration is unavailable');
  }
  const platforms = expo.platforms;
  if (!Array.isArray(platforms)
    || platforms.length === 0
    || platforms.some(platform => platform !== 'android' && platform !== 'web')
    || new Set(platforms).size !== platforms.length) {
    throw new Error('Expo runtime surface configuration is invalid');
  }
  return [...platforms];
}

async function readDependencySurfaceContext(): Promise<unknown> {
  const repositoryUrl = new URL('../', import.meta.url);
  const root = await readJson('../package.json');
  const workspaceRoots = workspaceManifestGlobs(root)
    .map(pattern => pattern.split('/')[0]);
  const directoryNamesByRoot: Record<string, string[]> = {};
  const discoveredManifests = new Map<string, unknown>();

  for (const workspaceRoot of workspaceRoots) {
    const entries = await readdir(new URL(`${workspaceRoot}/`, repositoryUrl), {
      withFileTypes: true,
    });
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) {
        throw new Error('Workspace roots cannot contain symbolic links');
      }
      if (entry.isDirectory()) {
        directoryNamesByRoot[workspaceRoot] = [
          ...(directoryNamesByRoot[workspaceRoot] ?? []),
          entry.name,
        ];
      }
    }
  }

  const candidates = workspaceManifestCandidates(root, directoryNamesByRoot);
  await Promise.all(candidates.map(async manifestPath => {
    const manifest = await readRegularJson(
      new URL(manifestPath, repositoryUrl),
      true,
    );
    if (manifest !== undefined) discoveredManifests.set(manifestPath, manifest);
  }));

  const workspaceManifestPaths = validateWorkspaceManifestPaths(
    root,
    [...discoveredManifests.keys()],
  );
  const workspaces = await Promise.all(workspaceManifestPaths.map(async path => {
    const manifest = discoveredManifests.get(path);
    if (manifest === undefined) throw new Error('Workspace manifest inventory changed');
    if (!path.startsWith('apps/')) return { path, manifest };

    const appConfigPath = path.replace(/package\.json$/, 'app.json');
    const appConfig = await readRegularJson(new URL(appConfigPath, repositoryUrl));
    return { path, manifest, runtimePlatforms: readRuntimePlatforms(appConfig) };
  }));

  return {
    root,
    workspaceManifestPaths,
    workspaces,
  };
}

async function main(): Promise<void> {
  try {
    const auditExecution = await runNpmAudit();
    const report = JSON.parse(auditExecution.output) as unknown;
    const vulnerabilityCount = countDependencyVulnerabilities(report);
    if (vulnerabilityCount === undefined
      || (auditExecution.exitCode === 1 && vulnerabilityCount === 0)) {
      throw new Error('npm audit exit status does not match a supported report');
    }
    const [exceptions, surfaceContext] = await Promise.all([
      readExceptionRegistry(),
      readDependencySurfaceContext(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const findings = auditDependencyPolicy(report, exceptions, today, surfaceContext);
    const summary = summarizeDependencyAudit(report, exceptions);

    if (findings.length > 0 || !summary) {
      process.stdout.write(`${JSON.stringify({
        status: 'DEPENDENCY-POLICY-HOLD',
        findingCount: findings.length || 1,
        findingCodes: findings.length > 0
          ? [...new Set(findings.map(({ code }) => code))]
          : ['AUDIT-SCHEMA'],
        summary,
      })}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`DEPENDENCY-POLICY-SUMMARY ${JSON.stringify(summary)}\n`);
    process.stdout.write('DEPENDENCY-POLICY-PASS\n');
    process.exitCode = 0;
  } catch {
    process.stderr.write('DEPENDENCY-POLICY-ERROR Dependency audit could not be executed or parsed.\n');
    process.exitCode = 1;
  }
}

await main();
