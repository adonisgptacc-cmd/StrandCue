import type { GuidanceEvidenceRegistry } from '../../../../packages/domain/src/index';

/**
 * The evidence registry this build executes against.
 *
 * It mirrors `docs/product/evidence/basic-wash-v1/evidence-registry.json`
 * exactly and is updated with it. It holds no records: this repository has no
 * approved catalogue row and no reviewed claim about one, so the only honest
 * registry is an empty one. Nothing in the app may act on it — the
 * publication gate refuses any bundle whose citations it cannot resolve here.
 *
 * The artifact is deliberately handed on unvalidated. `GuidanceEvidenceRegistrySchema`
 * is applied once, inside the publication gate, so a malformed registry becomes
 * one named refusal rather than a module-load crash on a phone.
 */
export const CHECKED_IN_EVIDENCE_REGISTRY: GuidanceEvidenceRegistry = {
  registryId: 'basic-wash-evidence',
  version: '1',
  records: [],
};