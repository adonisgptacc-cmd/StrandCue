import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const tree = 'tools/eas-runner/package.json';
const lock = '{\n  "packages": {}\n}\n';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const advisory = { name: 'braces', severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' };
const report = { auditReportVersion: 2, vulnerabilities: {
  braces: { name: 'braces', severity: 'high', via: [advisory], effects: [], nodes: ['node_modules/braces'] },
} };
const review = () => ({ tree, lockSha256: hash(lock), reviewedOn: '2026-10-17',
  recheckOn: '2026-10-24', expiresOn: '2026-10-31', owner: 'StrandCue maintainer',
  audit: report,
  advisories: [{ advisoryId: 'GHSA-vfj7-8cjw-p6xm', package: 'braces', severity: 'high',
    versions: ['3.0.3'], paths: ['eas-cli > fast-glob > micromatch > braces'],
    reachability: 'Build only; callable by trusted patterns.', exposure: 'Build credential present.',
    upstream: 'No patched 3.x release.', compatibility: 'Keep exact EAS major.',
    controls: 'Manual trusted builds and pinned CI.' }],
});
async function evaluate(input: unknown = review(), audit: unknown = report, path = tree, source = lock, today = '2026-10-17') {
  const { auditRunnerDependencyPolicy } = await import('../../scripts/runner-dependency-policy');
  return auditRunnerDependencyPolicy(audit, input, path, source, today);
}

describe('isolated runner advisory gate', () => {
  it('counts the runner review rather than application exceptions', async () => {
    const policy = await import('../../scripts/runner-dependency-policy');
    expect(policy.summarizeRunnerDependencyAudit(report, review())).toEqual({ critical: 0, high: 1, moderate: 0, reviewedAdvisories: 1 });
    expect(policy.summarizeRunnerDependencyAudit({}, null)).toBeUndefined();
  });
  it('accepts only the exact reviewed tree, lock and advisory evidence', async () => {
    expect(await evaluate()).toEqual([]);
  });
  it.each(['tools/mutation-runner/package.json', 'package.json', '../tools/eas-runner/package.json'])('rejects a different tree %s', async path => {
    expect(await evaluate(review(), report, path)).not.toEqual([]);
  });
  it('rejects any lock change, even if the audit report is unchanged', async () => {
    expect(await evaluate(review(), report, tree, lock + ' ')).not.toEqual([]);
  });
  it('accepts CRLF versus LF checkout line endings without changing lock contents', async () => {
    expect(await evaluate(review(), report, tree, lock.replaceAll('\n', '\r\n'))).toEqual([]);
  });
  it('treats npm graph edge order as a set while retaining every edge', async () => {
    const first = { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, via: [advisory, 'a', 'b'] } } };
    const reordered = { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, via: ['b', advisory, 'a'] } } };
    expect(await evaluate({ ...review(), audit: first }, reordered)).toEqual([]);
  });
  it('ignores only npm derived propagation/remediation metadata, which varies by invocation', async () => {
    const audit = { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces,
      effects: ['npm-selected-parent'], fixAvailable: { name: 'eas-cli', version: '13.4.2', isSemVerMajor: true },
    } } };
    expect(await evaluate(review(), audit)).toEqual([]);
  });
  it.each(['2026-10-16', '2026-10-25', '2026-11-01', '2026-02-30', 'invalid'])('rejects a noncurrent date %s', async today => {
    expect(await evaluate(review(), report, tree, lock, today)).not.toEqual([]);
  });
  it.each([
    null, {}, { ...review(), owner: '' }, { ...review(), expiresOn: '2027-01-01' },
    { ...review(), recheckOn: '2026-10-16' }, { ...review(), reviewedOn: '2026-02-30' },
    { ...review(), advisories: [] }, { ...review(), advisories: [...review().advisories, ...review().advisories] },
    { ...review(), advisories: [{ ...review().advisories[0], controls: '' }] },
  ])('rejects incomplete, duplicate or overlong review %j', async input => {
    expect(await evaluate(input)).not.toEqual([]);
  });
  it.each([
    {}, { auditReportVersion: 1, vulnerabilities: {} },
    { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, severity: 'critical' } } },
    { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, via: [{ ...advisory, severity: 'critical' }] } } },
    { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, via: [advisory, 'new-dependency-edge'] } } },
    { ...report, vulnerabilities: { braces: { ...report.vulnerabilities.braces, nodes: ['new-install-path'] } } },
  ])('rejects unknown, changed or critical audit evidence %j', async audit => {
    expect(await evaluate(review(), audit)).not.toEqual([]);
  });
  it('accepts a clean report with no exception records', async () => {
    const audit = { auditReportVersion: 2, vulnerabilities: {} };
    expect(await evaluate({ ...review(), audit, advisories: [] }, audit)).toEqual([]);
  });
  it('ignores JSON object key order while comparing exact evidence', async () => {
    expect(await evaluate(review(), { vulnerabilities: report.vulnerabilities, auditReportVersion: 2 })).toEqual([]);
  });
});
