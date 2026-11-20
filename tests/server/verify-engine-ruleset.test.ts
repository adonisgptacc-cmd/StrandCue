import { describe, expect, it, vi } from 'vitest';

import { canonicalRulesetContentHash } from '../../packages/engine/src/canonical-json.ts';
import { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION } from '../../packages/engine/src/pipeline/state.ts';
import { handleVerifyEngineRulesetRequest, type VerifyEngineRulesetDependencies } from '../../supabase/functions/verify-engine-ruleset/handler.ts';

const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const publicationId = '123e4567-e89b-42d3-a456-426614174001';
const packetDigest = `sha256:${'a'.repeat(64)}`;

function validPacket(contentHash?: string) {
  const ruleset = {
    ref: { rulesetId: 'engine-hash-proof', contentHash: contentHash ?? '',
      schemaVersion: ENGINE_SCHEMA_VERSION, evaluatorVersion: ENGINE_EVALUATOR_VERSION },
    capabilities: [],
    rules: [],
  };
  return { ...ruleset, ref: { ...ruleset.ref,
    contentHash: contentHash ?? canonicalRulesetContentHash(ruleset) } };
}

function draft(packet: ReturnType<typeof validPacket>) {
  return { publicationId, packetDigest, contentHash: packet.ref.contentHash,
    parentContentHash: null, packet };
}

function dependencies(overrides: Partial<VerifyEngineRulesetDependencies> = {}) {
  return {
    authenticate: vi.fn(async (token: string) => token === 'owner-token' ? { id: ownerId } : null),
    loadDraft: vi.fn(async () => draft(validPacket())),
    recordVerification: vi.fn(async () => undefined),
    ...overrides,
  } satisfies VerifyEngineRulesetDependencies;
}

function request(body: unknown, token = 'owner-token') {
  return new Request('http://localhost/verify-engine-ruleset', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('verify-engine-ruleset Edge handler', () => {
  it('requires an authenticated owner before reading a draft', async () => {
    const deps = dependencies();
    const response = await handleVerifyEngineRulesetRequest(request({ publicationId, packetDigest }, 'bad-token'), deps);
    expect(response.status).toBe(401);
    expect(deps.loadDraft).not.toHaveBeenCalled();
    expect(deps.recordVerification).not.toHaveBeenCalled();
  });

  it('does not write a verification record when the packet content hash is wrong', async () => {
    const badPacket = validPacket(`sha256:${'b'.repeat(64)}`);
    const deps = dependencies({ loadDraft: vi.fn(async () => draft(badPacket)) });
    const response = await handleVerifyEngineRulesetRequest(request({ publicationId, packetDigest }), deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'content-hash-mismatch' });
    expect(deps.recordVerification).not.toHaveBeenCalled();
  });

  it('records only the exact canonical hash for a valid owner draft', async () => {
    const packetValue = validPacket();
    const deps = dependencies({ loadDraft: vi.fn(async () => draft(packetValue)) });
    const response = await handleVerifyEngineRulesetRequest(request({ publicationId, packetDigest }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'verified', publicationId, packetDigest,
      contentHash: packetValue.ref.contentHash });
    expect(deps.recordVerification).toHaveBeenCalledWith({ publicationId, packetDigest,
      contentHash: packetValue.ref.contentHash, evaluatorVersion: ENGINE_EVALUATOR_VERSION });
  });

  it('fails closed when the requested draft is not readable to the authenticated owner', async () => {
    const deps = dependencies({ loadDraft: vi.fn(async () => null) });
    const response = await handleVerifyEngineRulesetRequest(request({ publicationId, packetDigest }), deps);
    expect(response.status).toBe(409);
    expect(deps.recordVerification).not.toHaveBeenCalled();
  });

  it('fails closed for a packet that does not satisfy the compiled engine contract', async () => {
    const invalidDraft = { ...draft(validPacket()), packet: { ref: {}, capabilities: [], rules: [] } };
    const deps = dependencies({ loadDraft: vi.fn(async () => invalidDraft) });
    const response = await handleVerifyEngineRulesetRequest(request({ publicationId, packetDigest }), deps);
    expect(response.status).toBe(409);
    expect(deps.recordVerification).not.toHaveBeenCalled();
  });
});
