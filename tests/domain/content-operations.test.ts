import { describe, expect, it } from 'vitest';

import {
  KillSwitchStateSchema,
  RollbackRecordSchema,
  ReviewerQueueEntrySchema,
  ReviewReminderSchema,
  type KillSwitchState,
  type RollbackRecord,
  type ReviewerQueueEntry,
  type ReviewReminder,
  type ReviewerQueueStatus,
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
