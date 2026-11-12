// Opt-in end-to-end successor publication proof against numeric-loopback PostgreSQL.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { canonicalRulesetContentHash } from '../../packages/engine/src/canonical-json.ts';
import { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION } from '../../packages/engine/src/pipeline/state.ts';
import { refusalReason } from '../helpers/local-postgres-target.ts';

type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;
const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
if (refusal) console.warn(`[engine-ruleset-successor-publication.pg] SKIP/BLOCKED: ${refusal}`);
const suite = refusal === null ? describe : describe.skip;
let Client: PgConstructor;

suite('real-Postgres successor ruleset publication', () => {
  let admin: PgClient;
  const authorId = crypto.randomUUID();
  const reviewerId = crypto.randomUUID();
  const parentId = crypto.randomUUID();
  const childId = crypto.randomUUID();

  beforeAll(async () => {
    ({ Client } = createRequire(import.meta.url)('pg') as { Client: PgConstructor });
    admin = new Client({ connectionString: dsn });
    await admin.connect();
    await admin.query("set statement_timeout='20000'");
  });

  afterAll(async () => {
    if (!admin) return;
    try { await admin.query('rollback'); } catch { /* transaction may already be closed */ }
    await admin.end();
  });

  const asUser = async (id: string) => {
    await admin.query('reset role');
    await admin.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [id, JSON.stringify({ sub: id, role: 'authenticated', email: `${id}@example.test`, is_anonymous: false })]);
    await admin.query('set local role authenticated');
  };

  const asService = async () => {
    await admin.query('reset role');
    await admin.query("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ role: 'service_role' })]);
    await admin.query('set local role service_role');
  };

  const packet = (rulesetId: string, contentHash: string, rules: unknown[], successorReview?: unknown) => ({
    ref: { rulesetId, contentHash, schemaVersion: ENGINE_SCHEMA_VERSION, evaluatorVersion: ENGINE_EVALUATOR_VERSION },
    capabilities: [], rules,
    ...(successorReview === undefined ? {} : { successorReview }),
  });

  const create = async (id: string, value: unknown, parentHash: string | null) => {
    const result = await admin.query<{ publication: { packetDigest: string } }>(
      'select public.create_engine_ruleset_draft($1,$2::jsonb,$3) publication',
      [id, JSON.stringify(value), parentHash],
    );
    return result.rows[0]!.publication;
  };

  const approve = async (id: string, digest: string) => {
    await asUser(authorId);
    await admin.query('select public.record_engine_ruleset_review($1,$2,$3)', [id, digest, 'author']);
    await asUser(reviewerId);
    await admin.query('select public.record_engine_ruleset_review($1,$2,$3)', [id, digest, 'reviewer']);
  };

  const verify = async (id: string, digest: string, contentHash: string) => {
    await asService();
    await admin.query('select public.record_engine_ruleset_hash_verification($1,$2,$3,$4)',
      [id, digest, contentHash, ENGINE_EVALUATOR_VERSION]);
  };

  it('creates, hashes, verifies, separately approves, and publishes an anonymized successor packet', async () => {
    await admin.query('begin');
    try {
      await admin.query('reset role');
      await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())', [authorId, reviewerId]);
      await admin.query(`insert into strandcue_private.engine_ruleset_reviewers(user_id,qualification)
        values($1,'real PostgreSQL synthetic reviewer')`, [reviewerId]);

      const parentRules = [{
        ruleId: 'rule.old', version: '1', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
      }];
      const parentHash = canonicalRulesetContentHash({ capabilities: [], rules: parentRules });
      const parentDraftPacket = packet('parent-ruleset', parentHash, parentRules);
      await asUser(authorId);
      const parentDraft = await create(parentId, parentDraftPacket, null);
      await approve(parentId, parentDraft.packetDigest);
      await verify(parentId, parentDraft.packetDigest, parentHash);
      await asUser(authorId);
      await admin.query('select public.publish_engine_ruleset($1,$2)', [parentId, parentDraft.packetDigest]);

      const childRules = [{
        ruleId: 'rule.new', version: '2', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
        successorOf: { parentRulesetHash: parentHash, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1' },
      }];
      const successorReview = {
        parentRulesetHash: parentHash,
        withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
        authorizations: [{
          withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
          successorRuleId: 'rule.new', successorRuleVersion: '2', authorId, reviewerId,
          reviewedAt: '2026-11-06T12:00:00.000Z', reviewRef: childId,
        }],
      };
      const childHash = canonicalRulesetContentHash({ capabilities: [], rules: childRules, successorReview });
      const childDraftPacket = packet('child-ruleset', childHash, childRules, successorReview);
      await asUser(authorId);
      const childDraft = await create(childId, childDraftPacket, parentHash);

      await admin.query('reset role');
      const stored = await admin.query<{ packet: { capabilities: unknown; rules: unknown; successorReview: {
        authorizations: { authorId: string; reviewerId: string }[];
      } } }>(
        'select packet from strandcue_private.engine_ruleset_publications where id=$1', [childId],
      );
      const storedPacket = stored.rows[0]!.packet;
      expect(storedPacket.successorReview.authorizations[0]!.authorId).not.toBe(authorId);
      expect(storedPacket.successorReview.authorizations[0]!.reviewerId).not.toBe(reviewerId);
      expect(canonicalRulesetContentHash(storedPacket)).toBe(childHash);

      await approve(childId, childDraft.packetDigest);
      await verify(childId, childDraft.packetDigest, childHash);
      await asUser(authorId);
      const published = await admin.query<{ publication: { state: string } }>(
        'select public.publish_engine_ruleset($1,$2) publication', [childId, childDraft.packetDigest],
      );
      expect(published.rows[0]!.publication.state).toBe('published');
    } finally {
      await admin.query('rollback');
    }
  });
});
