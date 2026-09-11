import { describe, expect, it } from 'vitest';
import { auditControlPlane } from '../../scripts/audit-control-plane';

const desired = { extensions: [{ name: 'superpowers', approved_ref: '6.3.0', targets: ['codex'], mode: 'primary' }] };
const observed = { schema: 'ai-project-extensions-lock.v2', observed: { superpowers: {
  resolved_ref: '6.3.0', codex: { scope: 'host-plugin', pin_enforced: false },
} } };
const claims = [{ id: 'expo', checked_at: '2026-09-09', review_after: '2026-10-09' }];

describe('control-plane audit', () => {
  it('accepts aligned observed metadata without claiming runtime conformance', () => {
    expect(auditControlPlane(desired, observed, claims, '2026-09-09')).toEqual([]);
  });
  it('fails version drift', () => {
    const lock = { ...observed, observed: { superpowers: { ...observed.observed.superpowers, resolved_ref: '6.4.0' } } };
    expect(auditControlPlane(desired, lock, claims, '2026-09-09').map(x => x.code)).toContain('EXT-DRIFT');
  });
  it('requires evidence for every selected target', () => {
    const policy = { extensions: [{ ...desired.extensions[0], targets: ['codex', 'claude-code'] }] };
    expect(auditControlPlane(policy, observed, claims, '2026-09-09').map(x => x.code)).toContain('TARGET-MISSING');
  });
  it('rejects a manifest-shaped observed lock', () => {
    expect(auditControlPlane(desired, { extensions: [] }, claims, '2026-09-09').map(x => x.code)).toContain('LOCK-SCHEMA');
  });
  it('flags stale external claims and malformed dates', () => {
    expect(auditControlPlane(desired, observed, claims, '2026-10-10').map(x => x.code)).toContain('CLAIM-STALE');
    expect(auditControlPlane(desired, observed, [{ id: 'bad', checked_at: 'yesterday', review_after: 'never' }], '2026-09-09').map(x => x.code)).toContain('CLAIM-DATE');
  });
  it('does not mistake bookkeeping for an installed extension', () => {
    const lock = { ...observed, observed: { ...observed.observed, desired_manifest: {}, preinstall_scans: {} } };
    expect(auditControlPlane(desired, lock, claims, '2026-09-09')).toEqual([]);
  });
  it('reports undeclared extensions and interrupted bootstrap', () => {
    const lock = { ...observed, bootstrap_status: 'interrupted', observed: { ...observed.observed, surprise: {} } };
    const codes = auditControlPlane(desired, lock, claims, '2026-09-09').map(x => x.code);
    expect(codes).toContain('EXT-UNAPPROVED');
    expect(codes).toContain('BOOTSTRAP-PARTIAL');
  });
  it('rejects enforced-bounded claims without negative test evidence', () => {
    const lock = { ...observed, observed: { superpowers: { ...observed.observed.superpowers, bounded_mode: 'enforced-bounded' } } };
    expect(auditControlPlane(desired, lock, claims, '2026-09-09').map(x => x.code)).toContain('BOUNDARY-UNPROVEN');
  });
});
