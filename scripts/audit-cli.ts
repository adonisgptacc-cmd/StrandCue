import { readFile } from 'node:fs/promises';
import { auditControlPlane } from './audit-control-plane.ts';

const readJson = async (name: string) => JSON.parse(await readFile(new URL(`../.assistant/tooling/${name}`, import.meta.url), 'utf8')) as unknown;

try {
  const [desired, observed, claims] = await Promise.all([
    readJson('extensions.yaml'), readJson('extensions.lock'), readJson('external-claims.json'),
  ]);
  const findings = auditControlPlane(desired, observed, claims, new Date().toISOString().slice(0, 10));
  process.stdout.write(`${JSON.stringify({
    check: 'StrandCue local metadata audit (not the supplied upstream auditor)',
    findings, status: findings.length ? 'HOLD' : 'METADATA-PASS',
    limitations: 'Does not verify installation, host file integrity, malware safety or fresh-session behaviour.',
  }, null, 2)}\n`);
  process.exitCode = findings.length ? 1 : 0;
} catch {
  process.stderr.write('Control-plane metadata could not be read or parsed.\n');
  process.exitCode = 1;
}
