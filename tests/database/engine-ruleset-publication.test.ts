import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION } from '../../packages/engine/src/pipeline/state.ts';
import { asUser, database, UNVERIFIED, USER_A, USER_B } from './harness.ts';

let db: PGlite;

beforeAll(async () => { db = await database(); }, 30_000);
afterAll(async () => { await db?.close(); });

const query = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values: unknown[] = []) => db.query<T>(sql, values);

function packet(contentHash: string, overrides: Record<string, unknown> = {}) {
  return {
    ref: { rulesetId: `ruleset-${contentHash.slice(-6)}`, contentHash,
      schemaVersion: ENGINE_SCHEMA_VERSION, evaluatorVersion: ENGINE_EVALUATOR_VERSION },
    capabilities: [], rules: [], ...overrides,
  };
}

async function createDraft(id: string, ruleset: unknown, parentHash: string | null = null) {
  const result = await query<{ publication: { packetDigest: string } }>(
    'select public.create_engine_ruleset_draft($1,$2::jsonb,$3) publication',
    [id, JSON.stringify(ruleset), parentHash],
  );
  return result.rows[0]!.publication;
}

async function enrollReviewer(id = USER_B) {
  await db.exec('set session authorization postgres');
  await query(`insert into strandcue_private.engine_ruleset_reviewers(user_id, qualification)
    values($1, 'independent synthetic ruleset reviewer')
    on conflict(user_id) do update set qualification=excluded.qualification, revoked_at=null`, [id]);
}

async function approveDraft(id: string, digest: string, authorId = USER_A, reviewerId = USER_B) {
  await asUser(db, authorId);
  await query('select public.record_engine_ruleset_review($1,$2,$3)', [id, digest, 'author']);
  await asUser(db, reviewerId);
  await query('select public.record_engine_ruleset_review($1,$2,$3)', [id, digest, 'reviewer']);
}

async function asServiceRole() {
  await db.exec('set session authorization postgres');
  await query("select set_config('request.jwt.claim.sub','',false)");
  await query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('set session authorization service_role');
}

async function verifyDraft(id: string, digest: string, contentHash: string) {
  await asServiceRole();
  await query('select public.record_engine_ruleset_hash_verification($1,$2,$3,$4)',
    [id, digest, contentHash, ENGINE_EVALUATOR_VERSION]);
}

describe('generic engine ruleset publication authority', () => {
  it('derives author identity from the authenticated request and requires a distinct qualified reviewer', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'a'.repeat(64)}`;
    await enrollReviewer();

    await asUser(db, USER_A);
    const draft = await createDraft(id, packet(contentHash));
    expect(draft.packetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    await query('select public.record_engine_ruleset_review($1,$2,$3)', [id, draft.packetDigest, 'author']);
    await expect(query('select public.record_engine_ruleset_review($1,$2,$3)', [id, draft.packetDigest, 'reviewer']))
      .rejects.toThrow(/engine-ruleset-reviewer-not-distinct/);

    await asUser(db, USER_B);
    const review = await query<{ approval: { reviewerId: string } }>(
      'select public.record_engine_ruleset_review($1,$2,$3) approval', [id, draft.packetDigest, 'reviewer'],
    );
    expect(review.rows[0]!.approval.reviewerId).toBe(USER_B);
  });

  it('rejects fabricated parent hashes and does not let an unqualified identity review', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'b'.repeat(64)}`;
    await asUser(db, USER_A);
    const fabricatedParent = packet(contentHash, { successorReview: {
      parentRulesetHash: `sha256:${'c'.repeat(64)}`,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [],
    } });
    await expect(createDraft(id, fabricatedParent, `sha256:${'c'.repeat(64)}`))
      .rejects.toThrow(/engine-ruleset-parent-not-published/);

    const draftId = crypto.randomUUID();
    const draft = await createDraft(draftId, packet(contentHash));
    await asUser(db, UNVERIFIED);
    await expect(query('select public.record_engine_ruleset_review($1,$2,$3)', [draftId, draft.packetDigest, 'reviewer']))
      .rejects.toThrow(/engine-ruleset-reviewer-not-authorized/);
  });

  it('rejects orphan successor lineage before a draft can enter publication', async () => {
    const contentHash = `sha256:${'c'.repeat(64)}`;
    const orphan = packet(contentHash, { rules: [{
      ruleId: 'rule.successor', version: '2', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
      successorOf: { parentRulesetHash: `sha256:${'a'.repeat(64)}`, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1' },
    }] });
    await asUser(db, USER_A);
    await expect(createDraft(crypto.randomUUID(), orphan)).rejects.toThrow(/engine-ruleset-successor-review-required/);
  });

  it('rejects a successor authorization whose rule does not include its affected action', async () => {
    const id = crypto.randomUUID();
    const childHash = `sha256:${'6'.repeat(64)}`;
    const parentHash = `sha256:${'5'.repeat(64)}`;
    const parentId = crypto.randomUUID();
    await enrollReviewer();
    await asUser(db, USER_A);
    const parent = await createDraft(parentId, packet(parentHash, { rules: [{
      ruleId: 'rule.old', version: '1', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
    }] }));
    await approveDraft(parentId, parent.packetDigest);
    await verifyDraft(parentId, parent.packetDigest, parentHash);
    await asUser(db, USER_A);
    await query('select public.publish_engine_ruleset($1,$2)', [parentId, parent.packetDigest]);

    const invalid = packet(childHash, { rules: [{
      ruleId: 'rule.new', version: '2', effects: [], successorOf: {
        parentRulesetHash: parentHash, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1',
      },
    }], successorReview: {
      parentRulesetHash: parentHash,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
        successorRuleId: 'rule.new', successorRuleVersion: '2', authorId: USER_A, reviewerId: USER_B,
        reviewedAt: '2000-01-01T00:00:00.000Z', reviewRef: id,
      }],
    } });
    await asUser(db, USER_A);
    await expect(createDraft(id, invalid, parentHash)).rejects.toThrow(/engine-ruleset-successor-rule-invalid/);
  });

  it('rejects a privileged direct insert that tries to bypass authenticated approvals', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'7'.repeat(64)}`;
    const candidate = packet(contentHash);
    const digestRows = await query<{ digest: string }>(`select 'sha256:'||encode(sha256(convert_to(
      jsonb_build_object('packet',$1::jsonb,'parentContentHash',null)::text,'UTF8')),'hex') digest`,
    [JSON.stringify(candidate)]);
    await asUser(db, USER_A);
    await db.exec('set session authorization strandcue_mutator');
    await expect(query(`insert into strandcue_private.engine_ruleset_publications
      (id,content_hash,packet,packet_digest,state,authored_by,published_at)
      values($1,$2,$3::jsonb,$4,'published',$5,now())`,
    [id, contentHash, JSON.stringify(candidate), digestRows.rows[0]!.digest, USER_A]))
      .rejects.toThrow(/engine-ruleset-direct-publish-forbidden/);
    await asUser(db, USER_A);
  });

  it('publishes only the exact immutable packet with two distinct authenticated approvals', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'d'.repeat(64)}`;
    await enrollReviewer();
    await asUser(db, USER_A);
    const draft = await createDraft(id, packet(contentHash));
    await query('select public.record_engine_ruleset_review($1,$2,$3)', [id, draft.packetDigest, 'author']);
    await verifyDraft(id, draft.packetDigest, contentHash);
    await asUser(db, USER_A);
    await expect(query('select public.publish_engine_ruleset($1,$2)', [id, draft.packetDigest]))
      .rejects.toThrow(/engine-ruleset-approvals-incomplete/);
    await asUser(db, USER_B);
    await expect(query('select public.record_engine_ruleset_review($1,$2,$3)',
      [id, `sha256:${'0'.repeat(64)}`, 'reviewer']))
      .rejects.toThrow(/engine-ruleset-draft-mismatch/);
    await query('select public.record_engine_ruleset_review($1,$2,$3)', [id, draft.packetDigest, 'reviewer']);
    await asUser(db, USER_A);
    await verifyDraft(id, draft.packetDigest, contentHash);
    await asUser(db, USER_A);
    const published = await query<{ publication: { state: string } }>(
      'select public.publish_engine_ruleset($1,$2) publication', [id, draft.packetDigest],
    );
    expect(published.rows[0]!.publication.state).toBe('published');
    await expect(query(`update strandcue_private.engine_ruleset_publications set packet='{}' where id=$1`, [id]))
      .rejects.toThrow(/permission denied/);
    await expect(query('select strandcue_private.load_engine_ruleset_publication($1)', [contentHash]))
      .rejects.toThrow(/permission denied/);
    await db.exec('set session authorization strandcue_mutator');
    const loaded = await query<{ packet: Record<string, unknown>; state: string }>(
      `select result->'packet' packet,result->>'state' state
       from (select strandcue_private.load_engine_ruleset_publication($1) result) loaded`, [contentHash],
    );
    expect(loaded.rows[0]!.state).toBe('published');
    expect(loaded.rows[0]!.packet).toEqual(packet(contentHash));
    await expect(query(`update strandcue_private.engine_ruleset_publications
      set published_at=published_at + interval '1 day' where id=$1`, [id]))
      .rejects.toThrow(/engine-ruleset-state-transition-invalid/);
    await db.exec('set session authorization postgres');
    await expect(query(`update strandcue_private.engine_ruleset_publications set packet='{}' where id=$1`, [id]))
      .rejects.toThrow(/engine-ruleset-packet-immutable/);
  });

  it('anonymizes deleted author and reviewer identities while retaining the published packet and decisions', async () => {
    const authorId = crypto.randomUUID();
    const reviewerId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const contentHash = `sha256:${'1'.repeat(64)}`;
    await query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())', [authorId, reviewerId]);
    await enrollReviewer(reviewerId);
    await asUser(db, authorId);
    const draft = await createDraft(publicationId, packet(contentHash));
    await query('select public.record_engine_ruleset_review($1,$2,$3)', [publicationId, draft.packetDigest, 'author']);
    await asUser(db, reviewerId);
    await query('select public.record_engine_ruleset_review($1,$2,$3)', [publicationId, draft.packetDigest, 'reviewer']);
    await verifyDraft(publicationId, draft.packetDigest, contentHash);
    await asUser(db, authorId);
    await query('select public.publish_engine_ruleset($1,$2)', [publicationId, draft.packetDigest]);

    await db.exec('set session authorization postgres');
    await expect(query('update strandcue_private.engine_ruleset_publications set authored_by=null where id=$1', [publicationId]))
      .rejects.toThrow(/engine-ruleset-packet-immutable/);
    await expect(query(`update strandcue_private.engine_ruleset_approvals set reviewer_id=null
      where publication_id=$1 and review_kind='reviewer'`, [publicationId]))
      .rejects.toThrow(/engine-ruleset-approval-immutable/);
    await query('delete from auth.users where id in ($1,$2)', [authorId, reviewerId]);

    const publication = await query<{ authored_by: string | null; state: string; packet: Record<string, unknown> }>(
      'select authored_by,state,packet from strandcue_private.engine_ruleset_publications where id=$1', [publicationId],
    );
    const approvals = await query<{ reviewer_id: string | null; review_kind: string }>(
      'select reviewer_id,review_kind from strandcue_private.engine_ruleset_approvals where publication_id=$1 order by review_kind',
      [publicationId],
    );
    expect(publication.rows[0]).toMatchObject({ authored_by: null, state: 'published', packet: packet(contentHash) });
    expect(approvals.rows).toEqual([{ reviewer_id: null, review_kind: 'author' }, { reviewer_id: null, review_kind: 'reviewer' }]);
    expect((await query('select 1 from strandcue_private.engine_ruleset_reviewers where user_id=$1', [reviewerId])).rows).toHaveLength(0);
  });

  it('redacts successor actor bindings without changing opaque packet references', async () => {
    const authorId = crypto.randomUUID();
    const reviewerId = crypto.randomUUID();
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const parentHash = `sha256:${crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')}`;
    const childHash = `sha256:${crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')}`;
    await query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())', [authorId, reviewerId]);
    await enrollReviewer(reviewerId);
    const qualification = await query<{ created_at: string }>(
      'select created_at::text created_at from strandcue_private.engine_ruleset_reviewers where user_id=$1', [reviewerId],
    );
    await asUser(db, authorId);
    const parent = await createDraft(parentId, packet(parentHash, { rules: [{
      ruleId: 'rule.old', version: '1', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
    }] }));
    await approveDraft(parentId, parent.packetDigest, authorId, reviewerId);
    await verifyDraft(parentId, parent.packetDigest, parentHash);
    await asUser(db, authorId);
    await query('select public.publish_engine_ruleset($1,$2)', [parentId, parent.packetDigest]);

    const childPacket = packet(childHash, { rules: [{
      ruleId: 'rule.new', version: '2', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
      successorOf: { parentRulesetHash: parentHash, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1' },
    }], successorReview: {
      parentRulesetHash: parentHash,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
        successorRuleId: 'rule.new', successorRuleVersion: '2', authorId, reviewerId,
        reviewedAt: qualification.rows[0]!.created_at, reviewRef: childId,
      }],
    } });
    await asUser(db, authorId);
    const child = await createDraft(childId, childPacket, parentHash);
    await approveDraft(childId, child.packetDigest, authorId, reviewerId);
    await verifyDraft(childId, child.packetDigest, childHash);
    await asUser(db, authorId);
    await query('select public.publish_engine_ruleset($1,$2)', [childId, child.packetDigest]);

    await db.exec('set session authorization postgres');
    await query('delete from auth.users where id in ($1,$2)', [authorId, reviewerId]);
    const retained = await query<{ author_ref: string; reviewer_ref: string; state: string }>(
      `select packet #>> '{successorReview,authorizations,0,authorId}' author_ref,
              packet #>> '{successorReview,authorizations,0,reviewerId}' reviewer_ref,state
       from strandcue_private.engine_ruleset_publications where id=$1`, [childId],
    );
    const bindings = await query<{ actor_role: string; actor_user_id: string | null; actor_ref: string }>(
      `select actor_role,actor_user_id,actor_ref from strandcue_private.engine_ruleset_successor_actor_bindings
       where publication_id=$1 order by actor_role`, [childId],
    );
    expect(retained.rows[0]!.state).toBe('published');
    expect(retained.rows[0]!.author_ref).not.toBe(authorId);
    expect(retained.rows[0]!.reviewer_ref).not.toBe(reviewerId);
    expect(bindings.rows).toEqual([
      { actor_role: 'author', actor_user_id: null, actor_ref: retained.rows[0]!.author_ref },
      { actor_role: 'reviewer', actor_user_id: null, actor_ref: retained.rows[0]!.reviewer_ref },
    ]);
  });

  it('requires a trusted content-hash verification before an approved draft can publish', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'2'.repeat(64)}`;
    await enrollReviewer();
    await asUser(db, USER_A);
    const draft = await createDraft(id, packet(contentHash));
    await approveDraft(id, draft.packetDigest);
    await asUser(db, USER_A);
    await expect(query('select public.publish_engine_ruleset($1,$2)', [id, draft.packetDigest]))
      .rejects.toThrow(/engine-ruleset-hash-verification-required/);
  });

  it('accepts verification only from the service role and binds it to the exact draft hash', async () => {
    const id = crypto.randomUUID();
    const contentHash = `sha256:${'3'.repeat(64)}`;
    await asUser(db, USER_A);
    const draft = await createDraft(id, packet(contentHash));
    await expect(query('select public.record_engine_ruleset_hash_verification($1,$2,$3,$4)',
      [id, draft.packetDigest, contentHash, ENGINE_EVALUATOR_VERSION]))
      .rejects.toThrow(/permission denied/);

    await asServiceRole();
    await expect(query('select public.record_engine_ruleset_hash_verification($1,$2,$3,$4)',
      [id, draft.packetDigest, `sha256:${'4'.repeat(64)}`, ENGINE_EVALUATOR_VERSION]))
      .rejects.toThrow(/engine-ruleset-draft-mismatch/);
    await query('select public.record_engine_ruleset_hash_verification($1,$2,$3,$4)',
      [id, draft.packetDigest, contentHash, ENGINE_EVALUATOR_VERSION]);
    await expect(query('update strandcue_private.engine_ruleset_hash_verifications set content_hash=$2 where publication_id=$1',
      [id, `sha256:${'4'.repeat(64)}`]))
      .rejects.toThrow(/engine-ruleset-hash-verification-immutable|permission denied/);
  });

  it('binds successor approvals to the parent record and the publication approval pair', async () => {
    const parentId = crypto.randomUUID();
    const parentHash = `sha256:${'e'.repeat(64)}`;
    const childId = crypto.randomUUID();
    const childHash = `sha256:${'f'.repeat(64)}`;
    await enrollReviewer();
    const reviewerQualification = await query<{ created_at: string }>(
      'select created_at::text created_at from strandcue_private.engine_ruleset_reviewers where user_id=$1', [USER_B],
    );

    await asUser(db, USER_A);
    const parent = await createDraft(parentId, packet(parentHash, { rules: [{
      ruleId: 'rule.old', version: '1', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
    }] }));
    await approveDraft(parentId, parent.packetDigest);
    await verifyDraft(parentId, parent.packetDigest, parentHash);
    await asUser(db, USER_A);
    await query('select public.publish_engine_ruleset($1,$2)', [parentId, parent.packetDigest]);

    const successor = packet(childHash, { rules: [{
      ruleId: 'rule.new', version: '2', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }], successorOf: {
        parentRulesetHash: parentHash, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1',
      },
    }], successorReview: {
      parentRulesetHash: parentHash,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
        successorRuleId: 'rule.new', successorRuleVersion: '2', authorId: USER_A, reviewerId: USER_B,
        reviewedAt: reviewerQualification.rows[0]!.created_at, reviewRef: childId,
      }],
    } });
    const child = await createDraft(childId, successor, parentHash);
    await db.exec('set session authorization postgres');
    const storedActorRefs = await query<{ author_id: string; reviewer_id: string }>(
      `select packet #>> '{successorReview,authorizations,0,authorId}' author_id,
              packet #>> '{successorReview,authorizations,0,reviewerId}' reviewer_id
       from strandcue_private.engine_ruleset_publications where id=$1`, [childId],
    );
    expect(storedActorRefs.rows[0]!.author_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storedActorRefs.rows[0]!.reviewer_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storedActorRefs.rows[0]!.author_id).not.toBe(USER_A);
    expect(storedActorRefs.rows[0]!.reviewer_id).not.toBe(USER_B);
    expect(storedActorRefs.rows[0]!.author_id).not.toBe(storedActorRefs.rows[0]!.reviewer_id);
    const actorBindings = await query<{ actor_role: string; actor_user_id: string; actor_ref: string }>(
      `select actor_role,actor_user_id,actor_ref from strandcue_private.engine_ruleset_successor_actor_bindings
       where publication_id=$1 order by actor_role`, [childId],
    );
    expect(actorBindings.rows).toEqual([
      { actor_role: 'author', actor_user_id: USER_A, actor_ref: storedActorRefs.rows[0]!.author_id },
      { actor_role: 'reviewer', actor_user_id: USER_B, actor_ref: storedActorRefs.rows[0]!.reviewer_id },
    ]);
    await expect(query(`update strandcue_private.engine_ruleset_successor_actor_bindings
      set actor_user_id=null where publication_id=$1 and actor_role='author'`, [childId]))
      .rejects.toThrow(/engine-ruleset-successor-actor-binding-immutable/);
    await expect(query(`update strandcue_private.engine_ruleset_successor_actor_bindings
      set actor_ref=$2 where publication_id=$1 and actor_role='author'`, [childId, crypto.randomUUID()]))
      .rejects.toThrow(/engine-ruleset-successor-actor-binding-immutable/);
    await asUser(db, USER_A);
    await approveDraft(childId, child.packetDigest);
    await verifyDraft(childId, child.packetDigest, childHash);
    await asUser(db, USER_A);
    await query('select public.publish_engine_ruleset($1,$2)', [childId, child.packetDigest]);

    const mismatchedReviewerId = crypto.randomUUID();
    const mismatchedChildId = crypto.randomUUID();
    const mismatchedChildHash = `sha256:${'8'.repeat(64)}`;
    await db.exec('set session authorization postgres');
    await query('insert into auth.users(id,email_confirmed_at) values($1,now())', [mismatchedReviewerId]);
    await enrollReviewer(mismatchedReviewerId);
    const mismatchedPacket = packet(mismatchedChildHash, { rules: [{
      ruleId: 'rule.newer', version: '3', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }],
      successorOf: { parentRulesetHash: parentHash, withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1' },
    }], successorReview: {
      parentRulesetHash: parentHash,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
        successorRuleId: 'rule.newer', successorRuleVersion: '3', authorId: USER_A, reviewerId: USER_B,
        reviewedAt: reviewerQualification.rows[0]!.created_at, reviewRef: mismatchedChildId,
      }],
    } });
    await asUser(db, USER_A);
    const mismatchedDraft = await createDraft(mismatchedChildId, mismatchedPacket, parentHash);
    await approveDraft(mismatchedChildId, mismatchedDraft.packetDigest, USER_A, mismatchedReviewerId);
    await verifyDraft(mismatchedChildId, mismatchedDraft.packetDigest, mismatchedChildHash);
    await asUser(db, USER_A);
    await expect(query('select public.publish_engine_ruleset($1,$2)', [mismatchedChildId, mismatchedDraft.packetDigest]))
      .rejects.toThrow(/engine-ruleset-successor-identity-invalid/);

    const fabricatedId = crypto.randomUUID();
    const fabricated = packet(`sha256:${'9'.repeat(64)}`, { rules: [{
      ruleId: 'rule.new', version: '2', effects: [{ kind: 'include_candidate', candidateId: 'action.old' }], successorOf: {
        parentRulesetHash: parentHash, withdrawnRuleId: 'rule.absent', withdrawnRuleVersion: '9',
      },
    }], successorReview: {
      parentRulesetHash: parentHash,
      withdrawals: [{ ruleId: 'rule.absent', version: '9', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.absent', withdrawnRuleVersion: '9', affectedActionId: 'action.old',
        successorRuleId: 'rule.new', successorRuleVersion: '2', authorId: USER_A, reviewerId: USER_B,
        reviewedAt: '2000-01-01T00:00:00.000Z', reviewRef: fabricatedId,
      }],
    } });
    const fabricatedDraft = await createDraft(fabricatedId, fabricated, parentHash);
    await approveDraft(fabricatedId, fabricatedDraft.packetDigest);
    await verifyDraft(fabricatedId, fabricatedDraft.packetDigest, fabricated.ref.contentHash as string);
    await asUser(db, USER_A);
    await expect(query('select public.publish_engine_ruleset($1,$2)', [fabricatedId, fabricatedDraft.packetDigest]))
      .rejects.toThrow(/engine-ruleset-withdrawal-not-in-parent/);

    const missingParentId = crypto.randomUUID();
    const missingParent = packet(`sha256:${'8'.repeat(64)}`, { successorReview: {
      parentRulesetHash: `sha256:${'8'.repeat(64)}`,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [],
    } });
    await expect(createDraft(missingParentId, missingParent,
      `sha256:${'8'.repeat(64)}`)).rejects.toThrow(/engine-ruleset-parent-not-published/);
  });

  it('keeps reviewer roster, packet and approval ledger inaccessible to client roles', async () => {
    await asUser(db, USER_A);
    await expect(query('select * from strandcue_private.engine_ruleset_reviewers')).rejects.toThrow(/permission denied/);
    await expect(query('select * from strandcue_private.engine_ruleset_approvals')).rejects.toThrow(/permission denied/);
    await expect(query('select * from strandcue_private.engine_ruleset_publications')).rejects.toThrow(/permission denied/);
    await expect(query('select strandcue_private.load_engine_ruleset_publication($1)', [`sha256:${'a'.repeat(64)}`]))
      .rejects.toThrow(/permission denied/);
  });
});
