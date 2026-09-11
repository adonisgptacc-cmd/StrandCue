import { z } from 'zod';

export type Finding = { code: string; message: string };
const object = z.record(z.string(), z.unknown());
const policySchema = z.object({ extensions: z.array(z.object({
  name: z.string().min(1), approved_ref: z.string().min(1),
  targets: z.array(z.string().min(1)).min(1), mode: z.string(),
})) });
const lockSchema = z.object({
  schema: z.literal('ai-project-extensions-lock.v2'),
  observed: z.record(z.string(), object), bootstrap_status: z.string().optional(),
});
const claimSchema = z.array(z.object({ id: z.string(), checked_at: z.string(), review_after: z.string() }));
const finding = (code: string, message: string): Finding => ({ code, message });
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function auditClaims(input: unknown, today: string): Finding[] {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success || !validDate(today)) return [finding('CLAIM-DATE', 'Invalid claim/date structure')];
  return parsed.data.flatMap(claim => {
    if (!validDate(claim.checked_at) || !validDate(claim.review_after)
      || claim.checked_at > today || claim.review_after < claim.checked_at) {
      return [finding('CLAIM-DATE', `Invalid dates: ${claim.id}`)];
    }
    return claim.review_after < today ? [finding('CLAIM-STALE', `Review required: ${claim.id}`)] : [];
  });
}

export function auditControlPlane(desired: unknown, observed: unknown, claims: unknown, today: string): Finding[] {
  const policy = policySchema.safeParse(desired);
  const lock = lockSchema.safeParse(observed);
  if (!policy.success) return [finding('MANIFEST-SCHEMA', 'Invalid desired extension policy')];
  if (!lock.success) return [finding('LOCK-SCHEMA', 'Expected v2 observed mapping')];
  const names = policy.data.extensions.map(extension => extension.name);
  const duplicates = names.length !== new Set(names).size
    ? [finding('MANIFEST-DUPLICATE', 'Each extension must appear once')] : [];
  const partial = lock.data.bootstrap_status && !['completed', 'not-run'].includes(lock.data.bootstrap_status)
    ? [finding('BOOTSTRAP-PARTIAL', 'Bootstrap is not complete')] : [];
  const unapproved = Object.keys(lock.data.observed)
    .filter(name => !['desired_manifest', 'preinstall_scans'].includes(name) && !names.includes(name))
    .map(name => finding('EXT-UNAPPROVED', `Not in desired policy: ${name}`));
  const extensions = policy.data.extensions.flatMap(extension => {
    const actual = lock.data.observed[extension.name];
    if (!actual) return [finding('EXT-MISSING', `No observation: ${extension.name}`)];
    const drift = actual.resolved_ref !== extension.approved_ref
      ? [finding('EXT-DRIFT', `Reference differs: ${extension.name}`)] : [];
    const targets = extension.targets.flatMap(target => {
      const host = object.safeParse(actual[target]);
      return !host.success || typeof host.data.scope !== 'string' || !host.data.scope
        ? [finding('TARGET-MISSING', `No target evidence: ${extension.name}/${target}`)] : [];
    });
    const boundary = actual.bounded_mode === 'enforced-bounded' && actual.negative_conformance_passed !== true
      ? [finding('BOUNDARY-UNPROVEN', `No negative-test evidence: ${extension.name}`)] : [];
    return [...drift, ...targets, ...boundary];
  });
  return [...duplicates, ...partial, ...unapproved, ...extensions, ...auditClaims(claims, today)];
}
