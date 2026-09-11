import { z } from 'zod';

const DAY_PATTERN = /^([1-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_PATTERN = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/;
const YEAR_PATTERN = /^[1-9]\d{3}$/;
const DOMAIN_CALENDAR_TIME_ZONE = 'Africa/Johannesburg';

const domainCalendarDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: DOMAIN_CALENDAR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return day <= daysInMonth(year, month);
}

export function currentDateOnly(now: Date = new Date()): string {
  const dateParts = new Map(
    domainCalendarDateFormatter
      .formatToParts(now)
      .map((part) => [part.type, part.value] as const),
  );
  const year = dateParts.get('year');
  const month = dateParts.get('month');
  const day = dateParts.get('day');

  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(
      `Could not resolve a date in ${DOMAIN_CALENDAR_TIME_ZONE}`,
    );
  }

  return `${year}-${month}-${day}`;
}

function monthEnd(value: string): string {
  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = String(daysInMonth(year, month)).padStart(2, '0');
  return `${value}-${day}`;
}

export const DateOnlySchema = z.string().refine(isCalendarDay, {
  message: 'Expected a valid ISO calendar date',
});

const EffectiveDateInputSchema = z.discriminatedUnion('precision', [
  z.object({ precision: z.literal('day'), value: z.string() }).strict(),
  z.object({ precision: z.literal('month'), value: z.string() }).strict(),
  z.object({ precision: z.literal('year'), value: z.string() }).strict(),
  z.object({ precision: z.literal('unknown'), value: z.null() }).strict(),
]);

export const EffectiveDateSchema = EffectiveDateInputSchema.superRefine(
  (effectiveDate, context) => {
    if (
      effectiveDate.precision === 'day' &&
      !isCalendarDay(effectiveDate.value)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Expected a valid ISO calendar day',
      });
      return;
    }

    if (
      effectiveDate.precision === 'month' &&
      !MONTH_PATTERN.test(effectiveDate.value)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Expected a valid ISO calendar month',
      });
      return;
    }

    if (
      effectiveDate.precision === 'year' &&
      !YEAR_PATTERN.test(effectiveDate.value)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Expected a valid four-digit year',
      });
      return;
    }

    const interval = effectiveDateToIntervalUnchecked(effectiveDate);
    if (interval.start !== null && interval.start > currentDateOnly()) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Future-dated factual changes are not supported',
      });
    }
  },
);

export type EffectiveDate = z.output<typeof EffectiveDateSchema>;

export interface EffectiveInterval {
  readonly start: string | null;
  readonly end: string | null;
}

function effectiveDateToIntervalUnchecked(
  effectiveDate: EffectiveDate,
): EffectiveInterval {
  switch (effectiveDate.precision) {
    case 'day':
      return { start: effectiveDate.value, end: effectiveDate.value };
    case 'month':
      return {
        start: `${effectiveDate.value}-01`,
        end: monthEnd(effectiveDate.value),
      };
    case 'year':
      return {
        start: `${effectiveDate.value}-01-01`,
        end: `${effectiveDate.value}-12-31`,
      };
    case 'unknown':
      return { start: null, end: null };
  }
}

export function effectiveDateToInterval(
  effectiveDate: EffectiveDate,
): EffectiveInterval {
  return effectiveDateToIntervalUnchecked(EffectiveDateSchema.parse(effectiveDate));
}
