import type { ExecutionStatus, ExecutionStepState } from './protocol-execution.ts';

export type CalendarStatus = 'planned' | 'completed' | 'partial' | 'skipped' | 'unknown';
export type ReminderCategory = 'planned_routine' | 'delayed_cue_check' | 'product_review';

export interface ReminderScheduleInput {
  readonly id: string;
  readonly ownerKey: string;
  readonly category: ReminderCategory;
  readonly localDate: string;
  readonly localTime: string;
  readonly dismissed: boolean;
}

export interface ReminderPreferences {
  readonly ownerKey: string;
  readonly enabled: Readonly<Record<ReminderCategory, boolean>>;
  readonly quietHours: { readonly start: string; readonly end: string } | null;
}

export interface PlannedReminderSchedule {
  readonly reminderId: string;
  readonly scheduledFor: Date;
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

const performedStepStates: readonly ExecutionStepState[] = ['confirmed', 'substituted', 'modified'];

function hasPerformedWork(stepStates: readonly ExecutionStepState[]): boolean {
  return stepStates.some(state => performedStepStates.includes(state));
}

export function projectExecutionCalendarStatus(
  status: ExecutionStatus,
  stepStates: readonly ExecutionStepState[],
): CalendarStatus {
  if (stepStates.length === 0) return 'unknown';

  if (status === 'completed') {
    return stepStates.every(state => state === 'skipped') ? 'skipped' : 'completed';
  }

  if (status === 'abandoned') {
    if (hasPerformedWork(stepStates)) return 'partial';
    return stepStates.every(state => state === 'skipped') ? 'skipped' : 'unknown';
  }

  if (status === 'in_progress' || status === 'paused') {
    return hasPerformedWork(stepStates) ? 'partial' : 'planned';
  }

  return 'unknown';
}

/**
 * Converts owner-entered wall-clock values in the device's current timezone.
 * A daylight-saving gap or calendar rollover is rejected instead of silently
 * moving a reminder to a different time.
 */
export function localDateTime(date: string, time: string): Date | null {
  const dateParts = datePattern.exec(date);
  const timeParts = timePattern.exec(time);
  if (!dateParts || !timeParts) return null;

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  const hour = Number(timeParts[1]);
  const minute = Number(timeParts[2]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59) return null;

  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1
    || result.getDate() !== day || result.getHours() !== hour
    || result.getMinutes() !== minute) return null;
  return result;
}

function clockMinutes(value: string): number | null {
  const parts = timePattern.exec(value);
  if (!parts) return null;
  const hour = Number(parts[1]);
  const minute = Number(parts[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

export function isWithinQuietHours(
  time: string,
  quietHours: { readonly start: string; readonly end: string },
): boolean {
  const current = clockMinutes(time);
  const start = clockMinutes(quietHours.start);
  const end = clockMinutes(quietHours.end);
  if (current === null || start === null || end === null || start === end) return false;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function planReminderSchedules(
  ownerKey: string,
  plans: readonly ReminderScheduleInput[],
  preferences: ReminderPreferences,
  now: Date,
): PlannedReminderSchedule[] {
  if (preferences.ownerKey !== ownerKey) return [];

  return plans.flatMap(plan => {
    if (plan.ownerKey !== ownerKey || plan.dismissed || !preferences.enabled[plan.category]
      || (preferences.quietHours !== null && isWithinQuietHours(plan.localTime, preferences.quietHours))) return [];
    const scheduledFor = localDateTime(plan.localDate, plan.localTime);
    if (scheduledFor === null || scheduledFor.getTime() <= now.getTime()) return [];
    return [{ reminderId: plan.id, scheduledFor }];
  });
}
