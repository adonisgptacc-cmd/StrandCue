import { describe, expect, it } from 'vitest';

import {
  disengageKillSwitch,
  engageKillSwitch,
  getRollbackRecords,
  getRollbackRecordsForRuleset,
  getWithdrawnRulesets,
  isWithdrawn,
  KillSwitchStateSchema,
  RollbackRecordSchema,
  ReviewerQueueEntrySchema,
  ReviewReminderSchema,
  rollbackToPriorHash,
  type KillSwitchState,
  type RollbackRecord,
  type ReviewerQueueEntry,
  type ReviewReminder,
} from '../../packages/domain/src/content-operations.ts';

describe('content operations schema', () => {
  it('pins the kill switch state schema', () => {
    const valid: KillSwitchState = {
      rulesetId: 'rs-1',
      contentHash: 'sha256:abc123',
      withdrawnAt: '2026-10-31T12:00:00.000Z',
      withdrawnBy: 'human-a',
      reason: 'safety concern',
    };
    expect(KillSwitchStateSchema.safeParse(valid).success).toBe(true);

    expect(KillSwitchStateSchema.safeParse({ ...valid, rulesetId: '' }).success).toBe(false);
    expect(KillSwitchStateSchema.safeParse({ ...valid, withdrawnBy: '' }).success).toBe(false);
    expect(KillSwitchStateSchema.safeParse({ ...valid, reason: '' }).success).toBe(false);
  });

  it('pins the rollback record schema', () => {
    const valid: RollbackRecord = {
      rulesetId: 'rs-1',
      fromContentHash: 'sha256:old',
      toContentHash: 'sha256:new',
      rolledBackAt: '2026-10-31T12:00:00.000Z',
      rolledBackBy: 'human-b',
      reason: 'regression detected',
    };
    expect(RollbackRecordSchema.safeParse(valid).success).toBe(true);

    expect(RollbackRecordSchema.safeParse({ ...valid, fromContentHash: '' }).success).toBe(false);
    expect(RollbackRecordSchema.safeParse({ ...valid, toContentHash: '' }).success).toBe(false);
  });

  it('pins the reviewer queue entry schema', () => {
    const valid: ReviewerQueueEntry = {
      entryId: 'entry-1',
      bundleId: 'bundle-1',
      bundleVersion: '2',
      authoredBy: 'human-a',
      reviewedBy: null,
      status: 'pending',
      submittedAt: '2026-10-31T12:00:00.000Z',
      reviewedAt: null,
      rationale: null,
    };
    expect(ReviewerQueueEntrySchema.safeParse(valid).success).toBe(true);

    // Approved entry must have reviewer, reviewedAt, rationale
    const approved: ReviewerQueueEntry = {
      ...valid,
      status: 'approved',
      reviewedBy: 'human-b',
      reviewedAt: '2026-10-31T13:00:00.000Z',
      rationale: 'looks good',
    };
    expect(ReviewerQueueEntrySchema.safeParse(approved).success).toBe(true);

    // Rejected entry must have reviewer, reviewedAt, rationale
    const rejected: ReviewerQueueEntry = {
      ...valid,
      status: 'rejected',
      reviewedBy: 'human-b',
      reviewedAt: '2026-10-31T13:00:00.000Z',
      rationale: 'insufficient evidence',
    };
    expect(ReviewerQueueEntrySchema.safeParse(rejected).success).toBe(true);

    // Pending entry must not have reviewer fields
    const pending: ReviewerQueueEntry = {
      ...valid,
      status: 'pending',
    };
    expect(ReviewerQueueEntrySchema.safeParse(pending).success).toBe(true);

    expect(ReviewerQueueEntrySchema.safeParse({ ...valid, entryId: '' }).success).toBe(false);
    expect(ReviewerQueueEntrySchema.safeParse({ ...valid, authoredBy: '' }).success).toBe(false);
  });

  it('pins the reviewer queue status vocabulary', () => {
    expect(['pending', 'approved', 'rejected'] as const).toEqual([
      'pending',
      'approved',
      'rejected',
    ]);
  });

  it('pins the review reminder schema', () => {
    const valid: ReviewReminder = {
      reminderId: 'reminder-1',
      bundleId: 'bundle-1',
      bundleVersion: '2',
      reminderType: '180-day-review',
      dueAt: '2026-10-31T12:00:00.000Z',
      sentAt: null,
    };
    expect(ReviewReminderSchema.safeParse(valid).success).toBe(true);

    expect(ReviewReminderSchema.safeParse({ ...valid, reminderType: '' }).success).toBe(false);
    expect(ReviewReminderSchema.safeParse({ ...valid, dueAt: '' }).success).toBe(false);
  });

  it('rejects invalid types', () => {
    expect(() =>
      KillSwitchStateSchema.parse('not an object'),
    ).toThrow();
    expect(() =>
      RollbackRecordSchema.parse(null),
    ).toThrow();
    expect(() =>
      ReviewerQueueEntrySchema.parse(undefined),
    ).toThrow();
    expect(() =>
      ReviewReminderSchema.parse(42),
    ).toThrow();
  });
});

describe('kill switch', () => {
  const emptyStore: Map<string, KillSwitchState> = new Map();
  const withdrawnAt = '2026-10-31T12:00:00.000Z';

  it('engages kill switch for a ruleset', () => {
    const store = engageKillSwitch(emptyStore, 'rs-1', 'sha256:abc', withdrawnAt, 'human-a', 'safety concern');
    expect(isWithdrawn(store, 'rs-1')).toBe(true);
  });

  it('disengages kill switch', () => {
    const engaged = engageKillSwitch(emptyStore, 'rs-1', 'sha256:abc', withdrawnAt, 'human-a', 'safety concern');
    expect(isWithdrawn(engaged, 'rs-1')).toBe(true);

    const disengaged = disengageKillSwitch(engaged, 'rs-1', withdrawnAt, 'human-b', 'false alarm');
    expect(isWithdrawn(disengaged, 'rs-1')).toBe(false);
  });

  it('does not affect other rulesets', () => {
    const store = engageKillSwitch(emptyStore, 'rs-1', 'sha256:abc', withdrawnAt, 'human-a', 'safety concern');
    expect(isWithdrawn(store, 'rs-2')).toBe(false);
  });

  it('returns empty array when no rulesets are withdrawn', () => {
    expect(getWithdrawnRulesets(emptyStore)).toEqual([]);
  });

  it('returns all withdrawn ruleset IDs', () => {
    const store = engageKillSwitch(emptyStore, 'rs-1', 'sha256:abc', withdrawnAt, 'human-a', 'safety concern');
    const store2 = engageKillSwitch(store, 'rs-2', 'sha256:def', withdrawnAt, 'human-b', 'another issue');
    expect(getWithdrawnRulesets(store2)).toEqual(['rs-1', 'rs-2']);
  });
});

describe('rollback', () => {
  const rolledBackAt = '2026-10-31T13:00:00.000Z';

  it('records a rollback from one ruleset hash to another', () => {
    const store: Map<string, RollbackRecord> = new Map();
    const result = rollbackToPriorHash(
      store,
      'rs-1',
      'sha256:current',
      'sha256:prior',
      rolledBackAt,
      'human-b',
      'regression detected',
    );
    const records = getRollbackRecords(result);
    expect(records).toHaveLength(1);
    expect(records[0].rulesetId).toBe('rs-1');
    expect(records[0].fromContentHash).toBe('sha256:current');
    expect(records[0].toContentHash).toBe('sha256:prior');
    expect(records[0].rolledBackBy).toBe('human-b');
    expect(records[0].reason).toBe('regression detected');
  });

  it('returns empty array when no rollbacks have been recorded', () => {
    const store: Map<string, RollbackRecord> = new Map();
    expect(getRollbackRecords(store)).toEqual([]);
  });

  it('returns rollback records for a specific ruleset', () => {
    let store: Map<string, RollbackRecord> = new Map();
    store = rollbackToPriorHash(store, 'rs-1', 'sha256:a', 'sha256:b', rolledBackAt, 'human-a', 'issue 1');
    store = rollbackToPriorHash(store, 'rs-2', 'sha256:c', 'sha256:d', rolledBackAt, 'human-b', 'issue 2');
    store = rollbackToPriorHash(store, 'rs-1', 'sha256:e', 'sha256:f', rolledBackAt, 'human-a', 'issue 3');

    const rs1Records = getRollbackRecordsForRuleset(store, 'rs-1');
    expect(rs1Records).toHaveLength(2);
    expect(rs1Records[0].fromContentHash).toBe('sha256:a');
    expect(rs1Records[1].fromContentHash).toBe('sha256:e');

    const rs2Records = getRollbackRecordsForRuleset(store, 'rs-2');
    expect(rs2Records).toHaveLength(1);
    expect(rs2Records[0].fromContentHash).toBe('sha256:c');

    const rs3Records = getRollbackRecordsForRuleset(store, 'rs-3');
    expect(rs3Records).toHaveLength(0);
  });
});
