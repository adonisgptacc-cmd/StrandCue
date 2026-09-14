import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  auditDependencyPolicy,
  summarizeDependencyAudit,
} from './dependency-policy.ts';

const MAX_AUDIT_OUTPUT_BYTES = 20 * 1024 * 1024;

function runNpmAudit(): Promise<string> {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath?.trim()) {
    return Promise.reject(new Error('npm CLI path is unavailable'));
  }

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [npmExecPath, 'audit', '--omit=dev', '--json'],
      {
        encoding: 'utf8',
        maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        const output = typeof stdout === 'string' ? stdout : '';
        if (!error || error.code === 1) {
          if (output.trim()) {
            resolve(output);
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

async function main(): Promise<void> {
  try {
    const auditOutput = await runNpmAudit();
    const report = JSON.parse(auditOutput) as unknown;
    const exceptions = await readExceptionRegistry();
    const today = new Date().toISOString().slice(0, 10);
    const findings = auditDependencyPolicy(report, exceptions, today);
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
