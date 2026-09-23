import { auditNodeVersion } from './runtime-policy.ts';

const findings = auditNodeVersion(process.version);

if (findings.length > 0) {
  process.stderr.write(`${findings[0].message}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`NODE-RUNTIME-PASS ${process.version}\n`);
}
