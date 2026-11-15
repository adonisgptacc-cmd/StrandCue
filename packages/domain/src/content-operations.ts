/**
 * Content operations for content publication governance.
 *
 * Provides the operational content types and pure functions for:
 * - Kill switch: emergency withdrawal of a ruleset (faster than normal withdrawal)
 * - Rollback: revert to a prior published ruleset hash
 * - Reviewer queue: Human A assembles, Human B independently reviews/approves/rejects
 *   (distinct persons required - EV-05)
 * - 180-day review reminders: scheduled reminders when published content is due for review
 *
 * All functions are pure: they never mutate inputs, never read the wall clock,
 * never touch I/O. Timestamps are injected by the caller.
 */
import { z } from 'zod';

const IsoTimestampSchema = z.iso.datetime({ offset: true });

/**
 * Vocabulary for reviewer queue entry status.
 */
export const ReviewerQueueStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ReviewerQueueStatus = z.infer<typeof ReviewerQueueStatusSchema>;

/**
 * Kill switch state: records an emergency withdrawal of a ruleset.
 * Faster than normal withdrawal and intended for safety incidents.
 */
export const KillSwitchStateSchema = z
  .object({
    rulesetId: z.string().min(1),
    contentHash: z.string().min(1),
    withdrawnAt: IsoTimestampSchema,
    withdrawnBy: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict()
  .readonly();
export type KillSwitchState = z.infer<typeof KillSwitchStateSchema>;

/**
 * Rollback record: records reverting to a prior published ruleset hash.
 */
export const RollbackRecordSchema = z
  .object({
    rulesetId: z.string().min(1),
    fromContentHash: z.string().min(1),
    toContentHash: z.string().min(1),
    rolledBackAt: IsoTimestampSchema,
    rolledBackBy: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict()
  .readonly();
export type RollbackRecord = z.infer<typeof RollbackRecordSchema>;

/**
 * One entry in the reviewer queue: Human A authors/assembles, Human B
 * independently reviews. The author and reviewer must be different people.
 */
export const ReviewerQueueEntrySchema = z
  .object({
    entryId: z.string().min(1),
    bundleId: z.string().min(1),
    bundleVersion: z.string().min(1),
    authoredBy: z.string().min(1),
    reviewedBy: z.string().min(1).optional().nullable(),
    status: ReviewerQueueStatusSchema,
    submittedAt: IsoTimestampSchema,
    reviewedAt: IsoTimestampSchema.optional().nullable(),
    rationale: z.string().min(1).optional().nullable(),
  })
  .strict()
  .readonly()
  .superRefine((entry, context) => {
    if (entry.status === 'pending') {
      if (entry.reviewedBy !== null && entry.reviewedBy !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedBy'],
          message: 'Pending entry must not have a reviewer',
        });
      }
      if (entry.reviewedAt !== null && entry.reviewedAt !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedAt'],
          message: 'Pending entry must not have a review date',
        });
      }
      if (entry.rationale !== null && entry.rationale !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['rationale'],
          message: 'Pending entry must not have a rationale',
        });
      }
    }
    if (entry.status === 'approved' || entry.status === 'rejected') {
      if (!entry.reviewedBy || entry.reviewedBy.trim() === '') {
        context.addIssue({
          code: 'custom',
          path: ['reviewedBy'],
          message: `${entry.status} entry must name a reviewer`,
        });
      }
      if (!entry.reviewedAt) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedAt'],
          message: `${entry.status} entry must have a review date`,
        });
      }
      if (!entry.rationale || entry.rationale.trim() === '') {
        context.addIssue({
          code: 'custom',
          path: ['rationale'],
          message: `${entry.status} entry must have a rationale`,
        });
      }
      if (entry.authoredBy === entry.reviewedBy) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedBy'],
          message: 'Author and reviewer must be different people (EV-05)',
        });
      }
    }
  });
export type ReviewerQueueEntry = z.infer<typeof ReviewerQueueEntrySchema>;

/**
 * 180-day review reminder: tracks when published content is due for review.
 */
export const ReviewReminderSchema = z
  .object({
    reminderId: z.string().min(1),
    bundleId: z.string().min(1),
    bundleVersion: z.string().min(1),
    reminderType: z.string().min(1),
    dueAt: IsoTimestampSchema,
    sentAt: IsoTimestampSchema.optional().nullable(),
  })
  .strict()
  .readonly();
export type ReviewReminder = z.infer<typeof ReviewReminderSchema>;

/**
 * Kill switch store: maps rulesetId to its kill switch state.
 * A ruleset present in this map is withdrawn and cannot execute.
 */
export type KillSwitchStore = ReadonlyMap<string, KillSwitchState>;

/**
 * Create an empty kill switch store.
 */
export function createKillSwitchStore(): KillSwitchStore {
  return new Map<string, KillSwitchState>();
}

/**
 * Engage the kill switch for a ruleset, marking it as withdrawn.
 * Returns a new store with the kill switch engaged.
 * Does not mutate the input store.
 */
export function engageKillSwitch(
  store: KillSwitchStore,
  rulesetId: string,
  contentHash: string,
  withdrawnAt: string,
  withdrawnBy: string,
  reason: string,
): KillSwitchStore {
  const newStore = new Map(store);
  newStore.set(rulesetId, {
    rulesetId,
    contentHash,
    withdrawnAt,
    withdrawnBy,
    reason,
  });
  return newStore;
}

/**
 * Disengage the kill switch for a ruleset, allowing it to execute again.
 * Returns a new store with the kill switch disengaged.
 * Does not mutate the input store.
 */
export function disengageKillSwitch(
  store: KillSwitchStore,
  rulesetId: string,
  disengagedBy: string,
  reason: string,
): KillSwitchStore {
  const newStore = new Map(store);
  newStore.delete(rulesetId);
  return newStore;
}

/**
 * Check whether a ruleset is currently withdrawn by the kill switch.
 */
export function isWithdrawn(store: KillSwitchStore, rulesetId: string): boolean {
  return store.has(rulesetId);
}

/**
 * Return all ruleset IDs that are currently withdrawn by the kill switch.
 */
export function getWithdrawnRulesets(store: KillSwitchStore): readonly string[] {
  return [...store.keys()];
}

