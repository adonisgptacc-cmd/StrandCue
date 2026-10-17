import { readFile } from 'node:fs/promises';
import { auditControlPlane } from './audit-control-plane.ts';
import { fileURLToPath } from 'node:url';
import { collectExpoSdkEvidence } from './expo-sdk-evidence.ts';

const readJson = async (name: string) => JSON.parse(await readFile(new URL(`../.assistant/tooling/${name}`, import.meta.url), 'utf8')) as unknown;

try {
  const [desired, observed, claims] = await Promise.all([
    readJson('extensions.yaml'), readJson('extensions.lock'), readJson('external-claims.json'),
  ]);
  const evidence = collectExpoSdkEvidence(fileURLToPath(new URL('../', import.meta.url)));
  const findings = auditControlPlane(desired, observed, claims, new Date().toISOString().slice(0, 10), evidence);
  process.stdout.write(`${JSON.stringify({
    check: 'StrandCue local metadata audit (not the supplied upstream auditor)',
    findings, status: findings.length ? 'HOLD' : 'METADATA-PASS',
    expoEvidence: evidence,
    limitations: 'Expo checks local installed SDK mapping only. Does not verify extension installation, host file integrity, malware safety, native/device compatibility or fresh-session behaviour.',
  }, null, 2)}\n`);
  process.exitCode = findings.length ? 1 : 0;
} catch {
  process.stderr.write('Control-plane metadata could not be read or parsed.\n');
  process.exitCode = 1;
}
