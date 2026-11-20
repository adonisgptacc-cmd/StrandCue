import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

import { canonicalRulesetContentHash } from '../packages/engine/src/canonical-json.ts';
import { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION } from '../packages/engine/src/pipeline/state.ts';
import { parseLocalApiTarget, parseLocalDatabaseTarget } from './verify-engine-ruleset-local-target.ts';

const apiUrl = process.env.STRANDCUE_LOCAL_SUPABASE_URL;
const anonKey = process.env.STRANDCUE_LOCAL_SUPABASE_ANON_KEY;
const serviceKey = process.env.STRANDCUE_LOCAL_SUPABASE_SERVICE_KEY;
const databaseUrl = process.env.STRANDCUE_LOCAL_SUPABASE_DATABASE_URL;

assert(apiUrl && anonKey && serviceKey && databaseUrl, 'Local Supabase environment is incomplete.');

const api = parseLocalApiTarget(apiUrl);
const dbUrl = parseLocalDatabaseTarget(databaseUrl);

type JsonRecord = Record<string, unknown>;
type Packet = {
  ref: { rulesetId: string; contentHash: string; schemaVersion: string; evaluatorVersion: string };
  capabilities: readonly unknown[];
  rules: readonly unknown[];
};

const requestJson = async (url: string, init: RequestInit = {}): Promise<{ response: Response; body: JsonRecord }> => {
  const response = await fetch(url, init);
  let body: JsonRecord = {};
  try {
    const value: unknown = await response.json();
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) body = value as JsonRecord;
  } catch {
    body = {};
  }
  return { response, body };
};

const headers = (key: string, token?: string): HeadersInit => ({
  apikey: key,
  ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  'content-type': 'application/json',
});

const sql = (statement: string): string => {
  const password = decodeURIComponent(dbUrl.password);
  const env = {
    ...process.env,
    PGPASSWORD: password,
    PGHOST: dbUrl.hostname,
    PGPORT: dbUrl.port,
    PGUSER: decodeURIComponent(dbUrl.username),
    PGDATABASE: dbUrl.pathname.slice(1),
  };
  return execFileSync('psql', [
    '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align',
    '--command', statement,
  ], { encoding: 'utf8', env }).trim();
};

const literal = (value: string): string => {
  assert(/^[a-zA-Z0-9:._-]+$/.test(value), 'Unexpected SQL identifier in local test data.');
  return `'${value}'`;
};

const packetSentinels = new Set(['private-packet-sentinel']);
const collectPacketSentinels = (value: unknown): readonly string[] => {
  if (Array.isArray(value)) return value.flatMap(collectPacketSentinels);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const captured = ['candidateId', 'ruleId', 'claimIds', 'evidenceIds', 'invalidField'].includes(key)
      ? typeof child === 'string' ? [child] : Array.isArray(child) ? child.filter((item): item is string => typeof item === 'string') : []
      : [];
    return [...captured, ...collectPacketSentinels(child)];
  });
};

const adminRequest = async (path: string, method: string, body: unknown) => requestJson(`${api.origin}${path}`, {
  method,
  headers: headers(serviceKey, serviceKey),
  body: JSON.stringify(body),
});

const createdUsers: string[] = [];

try {
  const suffix = randomUUID();
  const createUser = async (role: string): Promise<{ id: string; token: string; email: string }> => {
    const email = `wo-c-${role}-${randomUUID()}@example.test`;
    const password = randomBytes(32).toString('base64url');
    const created = await adminRequest('/auth/v1/admin/users', 'POST', {
      email,
      password,
      email_confirm: true,
    });
    assert(created.response.ok && typeof created.body.id === 'string', `Could not create local ${role} test user.`);
    const id = created.body.id;
    createdUsers.push(id);
    const signedIn = await requestJson(`${api.origin}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(anonKey),
      body: JSON.stringify({ email, password }),
    });
    assert(signedIn.response.ok && typeof signedIn.body.access_token === 'string',
      `Could not sign in the local ${role} test user.`);
    return { id, token: signedIn.body.access_token, email };
  };

  const author = await createUser('author');
  const reviewer = await createUser('reviewer');
  sql(`insert into strandcue_private.engine_ruleset_reviewers(user_id,qualification)
    values(${literal(author.id)},'WO-C synthetic author'),(${literal(reviewer.id)},'WO-C synthetic reviewer')`);

  const makePacket = (rulesetId: string): Packet => {
    const candidateId = `candidate-${randomUUID()}`;
    const ruleId = `rule-${candidateId}`;
    const packet = {
      ref: { rulesetId, contentHash: '', schemaVersion: ENGINE_SCHEMA_VERSION,
        evaluatorVersion: ENGINE_EVALUATOR_VERSION },
      capabilities: [],
      rules: [{ ruleId, version: '1', stageId: 'load_verified_facts',
        when: { kind: 'fact_equals', factId: 'f-ready', value: true },
        effects: [{ kind: 'include_candidate', candidateId }], severity: 'hard', capabilityIds: [],
        claimIds: [`claim-${ruleId}`], evidenceIds: [`ev-${ruleId}`] }],
    };
    for (const value of collectPacketSentinels(packet)) packetSentinels.add(value);
    return { ...packet, ref: { ...packet.ref, contentHash: canonicalRulesetContentHash(packet) } };
  };

  const createDraft = async (packet: JsonRecord): Promise<{ publicationId: string; packetDigest: string }> => {
    const publicationId = randomUUID();
    const result = await requestJson(`${api.origin}/rest/v1/rpc/create_engine_ruleset_draft`, {
      method: 'POST',
      headers: headers(anonKey, author.token),
      body: JSON.stringify({ p_publication_id: publicationId, p_packet: packet, p_parent_content_hash: null }),
    });
    if (!result.response.ok || typeof result.body.packetDigest !== 'string') {
      const code = typeof result.body.code === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(result.body.code)
        ? result.body.code : 'unavailable';
      const message = typeof result.body.message === 'string' && /^engine-ruleset-[a-z-]{1,64}$/.test(result.body.message)
        ? result.body.message : 'request-rejected';
      throw new Error(`Could not create local test draft: HTTP ${result.response.status}, ${code}, ${message}.`);
    }
    return { publicationId, packetDigest: result.body.packetDigest };
  };

  const goodPacket = makePacket(`wo-c-${suffix}`);
  const goodDraft = await createDraft(goodPacket);
  const endpoint = `${api.origin}/functions/v1/verify-engine-ruleset`;
  const command = { publicationId: goodDraft.publicationId, packetDigest: goodDraft.packetDigest };
  const ownerHeaders = headers(anonKey, author.token);
  const exposedValues = [serviceKey, author.token, reviewer.token, author.email, reviewer.email,
    author.id, reviewer.id, suffix];
  const assertNoDisclosure = (body: JsonRecord, allowedActorIds: readonly string[] = []): void => {
    const serialized = JSON.stringify(body);
    for (const value of exposedValues) {
      if (!allowedActorIds.includes(value)) {
        assert(!serialized.includes(value), 'A response disclosed a credential or another account identifier.');
      }
    }
    for (const value of packetSentinels) assert(!serialized.includes(value), 'A response disclosed a ruleset packet value.');
  };

  const unauthenticated = await requestJson(endpoint, {
    method: 'POST', headers: headers(anonKey), body: JSON.stringify(command),
  });
  assert(unauthenticated.response.status === 401, 'Unauthenticated HTTP request was not rejected.');
  assertNoDisclosure(unauthenticated.body);

  const wrongOwner = await createUser('reviewer');
  exposedValues.push(wrongOwner.email, wrongOwner.id, wrongOwner.token);
  const wrongOwnerResponse = await requestJson(endpoint, {
    method: 'POST', headers: headers(anonKey, wrongOwner.token), body: JSON.stringify(command),
  });
  assert(wrongOwnerResponse.response.status === 503
    && wrongOwnerResponse.body.error === 'verification-source-unavailable',
  'Wrong-owner request did not fail closed through the authenticated draft reader.');
  assertNoDisclosure(wrongOwnerResponse.body);

  const staleDigest = `sha256:${'0'.repeat(64)}`;
  const stale = await requestJson(endpoint, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify({ ...command, packetDigest: staleDigest }),
  });
  assert(stale.response.status === 503 && stale.body.error === 'verification-source-unavailable',
    'Stale packet digest did not fail closed through the authenticated draft reader.');
  assertNoDisclosure(stale.body);

  const changedPacket = await createDraft(makePacket(`wo-c-tampered-${suffix}`));
  sql(`begin;
    alter table strandcue_private.engine_ruleset_publications disable trigger user;
    update strandcue_private.engine_ruleset_publications
       set packet=jsonb_set(packet,'{rules,0,version}',to_jsonb('2'::text))
     where id=${literal(changedPacket.publicationId)};
    alter table strandcue_private.engine_ruleset_publications enable trigger user;
    commit;`);
  const changed = await requestJson(endpoint, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ publicationId: changedPacket.publicationId, packetDigest: changedPacket.packetDigest }),
  });
  if (!(changed.response.status === 409 && changed.body.error === 'content-hash-mismatch')) {
    const safeError = typeof changed.body.error === 'string' && /^[a-z-]{1,64}$/.test(changed.body.error)
      ? changed.body.error : 'unavailable';
    console.error(`Changed packet probe returned HTTP ${changed.response.status}, ${safeError}.`);
  }
  assert(changed.response.status === 409 && changed.body.error === 'content-hash-mismatch',
    'Changed packet did not fail the server-computed content-hash check.');
  assertNoDisclosure(changed.body);

  const invalidBase = makePacket(`wo-c-invalid-${suffix}`);
  const invalidPacket = { ...invalidBase, invalidField: 'private-packet-sentinel' };
  for (const value of collectPacketSentinels(invalidPacket)) packetSentinels.add(value);
  invalidPacket.ref.contentHash = canonicalRulesetContentHash(invalidPacket);
  const invalidDraft = await createDraft(invalidPacket);
  const invalidSchema = await requestJson(endpoint, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ publicationId: invalidDraft.publicationId, packetDigest: invalidDraft.packetDigest }),
  });
  assert(invalidSchema.response.status === 409 && invalidSchema.body.error === 'draft-invalid',
    'Invalid packet schema was accepted.');
  assertNoDisclosure(invalidSchema.body);

  const hashMismatchWrite = await requestJson(`${api.origin}/rest/v1/rpc/record_engine_ruleset_hash_verification`, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest,
      p_content_hash: `sha256:${'1'.repeat(64)}`, p_evaluator_version: ENGINE_EVALUATOR_VERSION }),
  });
  assert([401, 403, 404].includes(hashMismatchWrite.response.status),
    'Authenticated client wrote a privileged verification record or received a server failure.');
  assertNoDisclosure(hashMismatchWrite.body);

  const verified = await requestJson(endpoint, {
    method: 'POST', headers: ownerHeaders, body: JSON.stringify(command),
  });
  assert(verified.response.status === 200
    && verified.body.status === 'verified'
    && verified.body.publicationId === goodDraft.publicationId
    && verified.body.packetDigest === goodDraft.packetDigest
    && verified.body.contentHash === goodPacket.ref.contentHash,
  'Authenticated owner verification did not return the exact verified tuple.');
  assertNoDisclosure(verified.body);

  const rowCount = sql(`select count(*) from strandcue_private.engine_ruleset_hash_verifications
    where publication_id=${literal(goodDraft.publicationId)}
      and packet_digest=${literal(goodDraft.packetDigest)}
      and content_hash=${literal(String(goodPacket.ref.contentHash))}
      and evaluator_version=${literal(ENGINE_EVALUATOR_VERSION)}`);
  assert(rowCount === '1', 'The exact successful verification row was not persisted.');
  const invalidRowCount = sql(`select count(*) from strandcue_private.engine_ruleset_hash_verifications
    where publication_id in (${[changedPacket.publicationId, invalidDraft.publicationId].map(literal).join(',')})`);
  assert(invalidRowCount === '0', 'A rejected packet created a verification row.');

  const authorApproval = await requestJson(`${api.origin}/rest/v1/rpc/record_engine_ruleset_review`, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest,
      p_review_kind: 'author' }),
  });
  assert(authorApproval.response.ok, 'The authenticated author approval could not be recorded.');
  assertNoDisclosure(authorApproval.body, [author.id]);
  const selfReview = await requestJson(`${api.origin}/rest/v1/rpc/record_engine_ruleset_review`, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest,
      p_review_kind: 'reviewer' }),
  });
  assert(selfReview.response.status === 400, 'The author was allowed to supply the distinct reviewer approval.');
  assertNoDisclosure(selfReview.body);
  const publication = await requestJson(`${api.origin}/rest/v1/rpc/publish_engine_ruleset`, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest }),
  });
  assert(publication.response.status === 400, 'A draft without distinct author/reviewer approvals was published.');
  assert(sql(`select state from strandcue_private.engine_ruleset_publications where id=${literal(goodDraft.publicationId)}`) === 'draft',
    'Publication state changed without a distinct reviewer approval.');
  assertNoDisclosure(publication.body);

  const reviewerApproval = await requestJson(`${api.origin}/rest/v1/rpc/record_engine_ruleset_review`, {
    method: 'POST', headers: headers(anonKey, reviewer.token),
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest,
      p_review_kind: 'reviewer' }),
  });
  assert(reviewerApproval.response.ok, 'A separately authenticated qualified reviewer approval could not be recorded.');
  assertNoDisclosure(reviewerApproval.body, [reviewer.id]);
  const published = await requestJson(`${api.origin}/rest/v1/rpc/publish_engine_ruleset`, {
    method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ p_publication_id: goodDraft.publicationId, p_packet_digest: goodDraft.packetDigest }),
  });
  assert(published.response.ok, 'The author could not publish after both distinct approvals were recorded.');
  assertNoDisclosure(published.body);
  assert(sql(`select state from strandcue_private.engine_ruleset_publications where id=${literal(goodDraft.publicationId)}`) === 'published',
    'Publication did not transition after the distinct author/reviewer approvals.');

  console.log('WO-C local HTTP proof passed: authenticated owner, negative cases, exact DB verification tuple, and distinct-reviewer approval/publish gate.');
} finally {
  for (const id of createdUsers) {
    await adminRequest(`/auth/v1/admin/users/${id}`, 'DELETE', {}).catch(() => undefined);
  }
}
