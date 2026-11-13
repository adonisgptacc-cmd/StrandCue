import { describe, expect, it } from 'vitest';

import * as domain from '../../packages/domain/src/index.ts';
import type { ExecutionStatus, ExecutionStepState } from '../../packages/domain/src/index.ts';

const projectStatus = Reflect.get(domain, 'projectExecutionCalendarStatus') as
  | ((status: ExecutionStatus, stepStates: readonly ExecutionStepState[]) => string)
  | undefined;
const localDateTime = Reflect.get(domain, 'localDateTime') as
  | ((date: string, time: string) => Date | null)
  | undefined;
const isWithinQuietHours = Reflect.get(domain, 'isWithinQuietHours') as
  | ((time: string, quietHours: { start: string; end: string }) => boolean)
  | undefined;
type ReminderCategory = 'planned_routine' | 'delayed_cue_check' | 'treatment_eligibility' | 'product_review';
type ReminderPlan = {
  id: string;
  ownerKey: string;
  category: ReminderCategory;
  localDate: string;
  localTime: string;
  dismissed: boolean;
};
type ReminderPreferences = {
  ownerKey: string;
  enabled: Record<ReminderCategory, boolean>;
  quietHours: { start: string; end: string } | null;
};
const planReminderSchedules = Reflect.get(domain, 'planReminderSchedules') as
  | ((ownerKey: string, plans: readonly ReminderPlan[], preferences: ReminderPreferences, now: Date) =>
      readonly { reminderId: string; scheduledFor: Date }[])
  | undefined;

const defaultPreferences: ReminderPreferences = {
  ownerKey: 'owner-a',
  enabled: {
    planned_routine: true,
    delayed_cue_check: false,
    treatment_eligibility: false,
    product_review: false,
  },
  quietHours: { start: '22:00', end: '07:00' },
};

describe('execution calendar status', () => {
  it('marks a persisted completed execution completed', () => {
    expect(projectStatus?.('completed', ['confirmed', 'substituted'])).toBe('completed');
  });

  it('marks an active execution with confirmed work partial', () => {
    expect(projectStatus?.('in_progress', ['confirmed', 'pending'])).toBe('partial');
  });

  it('keeps an active execution with no performed steps planned', () => {
    expect(projectStatus?.('paused', ['pending', 'pending'])).toBe('planned');
  });

  it('marks an explicitly abandoned execution with only skipped steps skipped', () => {
    expect(projectStatus?.('abandoned', ['skipped', 'skipped'])).toBe('skipped');
  });

  it('does not infer a skipped outcome from an abandoned execution with no step evidence', () => {
    expect(projectStatus?.('abandoned', ['pending', 'pending'])).toBe('unknown');
  });

  it('shows performed work in an abandoned execution as partial', () => {
    expect(projectStatus?.('abandoned', ['confirmed', 'pending'])).toBe('partial');
  });

  it('converts a valid local date and time without changing its wall-clock fields', () => {
    const result = localDateTime?.('2026-11-01', '08:45');

    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(10);
    expect(result?.getDate()).toBe(1);
    expect(result?.getHours()).toBe(8);
    expect(result?.getMinutes()).toBe(45);
  });

  it('rejects calendar rollover and out-of-range local time values', () => {
    expect(localDateTime?.('2026-02-30', '08:45')).toBeNull();
    expect(localDateTime?.('2026-11-01', '24:00')).toBeNull();
  });

  it('rejects a daylight-saving gap and recalculates wall time after a timezone change', () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(localDateTime?.('2026-03-08', '02:30')).toBeNull();

      const plan: ReminderPlan = {
        id: 'timezone-plan', ownerKey: 'owner-a', category: 'planned_routine',
        localDate: '2030-01-02', localTime: '09:00', dismissed: false,
      };
      process.env.TZ = 'UTC';
      const utc = planReminderSchedules?.('owner-a', [plan], {
        ...defaultPreferences, quietHours: null,
      }, new Date('2026-11-01T00:00:00.000Z'))[0];
      process.env.TZ = 'America/Los_Angeles';
      const losAngeles = planReminderSchedules?.('owner-a', [plan], {
        ...defaultPreferences, quietHours: null,
      }, new Date('2026-11-01T00:00:00.000Z'))[0];

      expect(utc?.reminderId).toBe(losAngeles?.reminderId);
      expect(utc?.scheduledFor.toISOString()).toBe('2030-01-02T09:00:00.000Z');
      expect(losAngeles?.scheduledFor.toISOString()).toBe('2030-01-02T17:00:00.000Z');
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it('detects quiet hours across midnight', () => {
    expect(isWithinQuietHours?.('22:30', { start: '22:00', end: '07:00' })).toBe(true);
    expect(isWithinQuietHours?.('06:59', { start: '22:00', end: '07:00' })).toBe(true);
    expect(isWithinQuietHours?.('07:00', { start: '22:00', end: '07:00' })).toBe(false);
  });

  it('does not treat equal quiet-hour bounds as a full-day block', () => {
    expect(isWithinQuietHours?.('12:00', { start: '08:00', end: '08:00' })).toBe(false);
  });

  it('schedules only enabled, future, non-dismissed plans belonging to the current owner', () => {
    const plans: ReminderPlan[] = [
      { id: 'routine-future', ownerKey: 'owner-a', category: 'planned_routine', localDate: '2026-11-01', localTime: '08:45', dismissed: false },
      { id: 'other-owner', ownerKey: 'owner-b', category: 'planned_routine', localDate: '2026-11-01', localTime: '09:00', dismissed: false },
      { id: 'disabled-kind', ownerKey: 'owner-a', category: 'delayed_cue_check', localDate: '2026-11-01', localTime: '09:15', dismissed: false },
      { id: 'past', ownerKey: 'owner-a', category: 'planned_routine', localDate: '2026-11-01', localTime: '05:00', dismissed: false },
      { id: 'dismissed', ownerKey: 'owner-a', category: 'planned_routine', localDate: '2026-11-01', localTime: '09:30', dismissed: true },
    ];

    expect(planReminderSchedules?.('owner-a', plans, defaultPreferences, new Date(2026, 10, 1, 6, 0))).toEqual([
      { reminderId: 'routine-future', scheduledFor: new Date(2026, 10, 1, 8, 45) },
    ]);
  });

  it('does not schedule reminders during quiet hours or from invalid dates', () => {
    const plans: ReminderPlan[] = [
      { id: 'quiet', ownerKey: 'owner-a', category: 'planned_routine', localDate: '2026-11-01', localTime: '06:30', dismissed: false },
      { id: 'invalid', ownerKey: 'owner-a', category: 'planned_routine', localDate: '2026-02-30', localTime: '09:00', dismissed: false },
    ];

    expect(planReminderSchedules?.('owner-a', plans, defaultPreferences, new Date(2026, 10, 1, 5, 0))).toEqual([]);
  });
});
