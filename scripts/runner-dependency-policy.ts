import { createHash } from 'node:crypto';
import { z } from 'zod';
import { summarizeDependencyAudit, type DependencyFinding } from './dependency-policy.ts';

const text = z.string().trim().min(1);
const severity = z.enum(['info', 'low', 'moderate', 'high', 'critical']);
const advisory = z.object({ name: text, severity, url: z.string().regex(/^https:\/\/github\.com\/advisories\/GHSA-[\w-]+$/) }).passthrough();
const reportSchema = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(text, z.object({
    name: text, severity, via: z.array(z.union([text, advisory])),
    effects: z.array(text), nodes: z.array(text),
  }).passthrough()),
}).passthrough();
const reviewSchema = z.object({
  tree: z.enum(['tools/eas-runner/package.json', 'tools/mutation-runner/package.json']),
  lockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedOn: text, recheckOn: text, expiresOn: text, owner: text,
  audit: reportSchema,
  advisories: z.array(z.object({
    advisoryId: text, package: text, severity: z.enum(['low', 'moderate', 'high']),
    versions: z.array(text).min(1), paths: z.array(text).min(1),
    reachability: text, exposure: text, upstream: text, compatibility: text, controls: text,
  }).strict()),
}).strict();

export function summarizeRunnerDependencyAudit(report: unknown, review: unknown) {
  const parsed = reviewSchema.safeParse(review);
  const summary = summarizeDependencyAudit(report, []);
  if (!parsed.success || !summary) return undefined;
  return { ...summary, reviewedAdvisories: parsed.data.advisories.length };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function auditGraph(report: z.infer<typeof reportSchema>) {
  // npm nondeterministically chooses one propagation parent for `effects` and
  // the corresponding `fixAvailable` suggestion. Neither describes an installed
  // edge: the lock binds the dependency tree and `via` binds audit propagation.
  return Object.fromEntries(Object.entries(report.vulnerabilities).map(([key, node]) => [key, {
    name: node.name, severity: node.severity, via: node.via, nodes: node.nodes,
    ...(node.range === undefined ? {} : { range: node.range }),
  }]));
}

/** Separate, exact-lock review for executable CI tools. This does not broaden
 * the application policy's Expo-only high-severity exception scope. Any new
 * advisory, severity, dependency path, lock change or overdue review fails shut.
 * A PASS means reviewed residual risk; it never means the advisories are fixed. */
export function auditRunnerDependencyPolicy(
  report: unknown, review: unknown, tree: string, lockSource: string, today: string,
): DependencyFinding[] {
  const observed = reportSchema.safeParse(report);
  const reviewed = reviewSchema.safeParse(review);
  const fail = (code: string): DependencyFinding[] => [{ code, message: `Runner dependency review requires attention: ${tree}.` }];
  if (!observed.success || !reviewed.success) return fail('RUNNER-REVIEW-SCHEMA');
  const evidence = reviewed.data;
  if (evidence.tree !== tree) return fail('RUNNER-REVIEW-TREE');
  if (evidence.lockSha256 !== createHash('sha256').update(lockSource.replaceAll('\r\n', '\n')).digest('hex')) {
    return fail('RUNNER-REVIEW-LOCK');
  }
  const dates = [today, evidence.reviewedOn, evidence.recheckOn, evidence.expiresOn];
  const duration = (Date.parse(evidence.expiresOn) - Date.parse(evidence.reviewedOn)) / 86_400_000;
  if (!dates.every(validDate) || evidence.reviewedOn > today || today > evidence.recheckOn
    || today > evidence.expiresOn || evidence.reviewedOn > evidence.recheckOn
    || evidence.recheckOn > evidence.expiresOn || duration > 14) return fail('RUNNER-REVIEW-DATE');

  const vulnerabilities = Object.values(observed.data.vulnerabilities);
  const advisories = vulnerabilities.flatMap(item => item.via)
    .filter((item): item is z.infer<typeof advisory> => typeof item !== 'string');
  if (vulnerabilities.some(item => item.severity === 'critical')
    || advisories.some(item => item.severity === 'critical')) return fail('ADVISORY-SEVERITY');
  const identities = (items: { name: string; severity: string; url: string }[]) => [...new Set(items.map(item => `${item.url}:${item.name}:${item.severity}`))].sort();
  const expected = evidence.advisories.map(item => ({ name: item.package,
    severity: item.severity, url: `https://github.com/advisories/${item.advisoryId}` }));
  if (new Set(expected.map(item => item.url)).size !== expected.length
    || canonical(identities(advisories)) !== canonical(identities(expected))) return fail('RUNNER-REVIEW-ADVISORIES');
  if (canonical(auditGraph(observed.data)) !== canonical(auditGraph(evidence.audit))) {
    return fail('RUNNER-REVIEW-DRIFT');
  }
  return [];
}
