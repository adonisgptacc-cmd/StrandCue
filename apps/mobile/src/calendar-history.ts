import {
  projectExecutionCalendarStatus,
  ProtocolExecutionSchema,
  type CalendarStatus,
} from '@strandcue/domain';
import { getActivity, listActivities, type ActivityCursor } from './activity-api';
import { listCueChecks, type CueCheckCursor } from './cue-check-api';
import { listProtocolExecutions } from './guidance/protocol-execution-api';
import { loadPassport } from './passport-api';
import { getProgramme, listProgrammes } from './programme-api';
import { loadService, loadServices, type ServiceCursor } from './services-api';

const pageSize = 25;
const detailBatchSize = 8;

export type CalendarHistorySource = 'activity' | 'cue_check' | 'passport' | 'programme' | 'protocol' | 'service';

export type CalendarHistoryItem = {
  id: string;
  source: CalendarHistorySource;
  title: string;
  date: string;
  dateKey: string | null;
  sortAt: number;
  status: CalendarStatus;
  kind: 'history';
};

export type CalendarHistoryCursor = {
  protocol: unknown | null;
  activity: ActivityCursor | null;
  cueCheck: CueCheckCursor | null;
  programme: unknown | null;
  service: ServiceCursor | null;
  passportLoaded: boolean;
};

export type CalendarHistoryPage = {
  items: CalendarHistoryItem[];
  nextCursor: CalendarHistoryCursor | null;
};

function dateValue(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const isoDay = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(value);
  if (isoDay) return isoDay[1]!;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return null;
}

function dateSortAt(value: string | null): number {
  if (value === null) return 0;
  const normalized = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const parsed = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: string | null, precision: unknown): string {
  if (value === null || precision === 'unknown') return 'Date unknown';
  if (value.length === 10) return value;
  return `Approximately ${value}`;
}

function effectiveDateItem(
  id: string,
  source: CalendarHistorySource,
  title: string,
  effectiveDate: { precision?: unknown; value?: unknown } | null | undefined,
  status: CalendarStatus,
): CalendarHistoryItem {
  const value = dateValue(effectiveDate?.value);
  return {
    id,
    source,
    title,
    date: dateLabel(value, effectiveDate?.precision),
    dateKey: value,
    sortAt: dateSortAt(value),
    status,
    kind: 'history',
  };
}

function instantItem(
  id: string,
  source: CalendarHistorySource,
  title: string,
  instant: unknown,
  status: CalendarStatus,
): CalendarHistoryItem {
  const parsed = typeof instant === 'string' ? new Date(instant) : null;
  const valid = parsed !== null && Number.isFinite(parsed.getTime());
  const dateKey = valid
    ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed!)
    : null;
  return {
    id,
    source,
    title,
    date: dateKey ?? 'Date unknown',
    dateKey,
    sortAt: valid ? parsed!.getTime() : 0,
    status,
    kind: 'history',
  };
}

function todayInProductTimezone(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function hasMore(cursor: CalendarHistoryCursor): boolean {
  return cursor.protocol !== null || cursor.activity !== null || cursor.cueCheck !== null
    || cursor.programme !== null || cursor.service !== null;
}

async function mapInBatches<T, R>(items: readonly T[], load: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += detailBatchSize) {
    results.push(...await Promise.all(items.slice(offset, offset + detailBatchSize).map(load)));
  }
  return results;
}

export async function loadCalendarHistoryPage(
  cursor: CalendarHistoryCursor | null,
  now = new Date(),
): Promise<CalendarHistoryPage> {
  const asOf = todayInProductTimezone(now);
  const passportNeeded = cursor === null || !cursor.passportLoaded;
  const [protocolPage, activityPage, cueCheckPage, programmePage, servicePage, passport] = await Promise.all([
    cursor === null || cursor.protocol !== null
      ? listProtocolExecutions({ limit: pageSize, cursor: cursor?.protocol ?? null })
      : Promise.resolve({ items: [], nextCursor: null }),
    cursor === null || cursor.activity !== null
      ? listActivities(asOf, { limit: pageSize, cursor: cursor?.activity ?? null })
      : Promise.resolve({ items: [], nextCursor: null }),
    cursor === null || cursor.cueCheck !== null
      ? listCueChecks({ limit: pageSize, cursor: cursor?.cueCheck ?? null })
      : Promise.resolve({ items: [], nextCursor: null }),
    cursor === null || cursor.programme !== null
      ? listProgrammes({ limit: pageSize, cursor: cursor?.programme ?? null })
      : Promise.resolve({ items: [], nextCursor: null }),
    cursor === null || cursor.service !== null
      ? loadServices(asOf, { limit: pageSize, cursor: cursor?.service ?? null })
      : Promise.resolve({ items: [], nextCursor: null }),
    passportNeeded ? loadPassport() : Promise.resolve(null),
  ]);

  const [activities, programmes, services] = await Promise.all([
    mapInBatches(activityPage.items, item => getActivity(item.id, true)),
    mapInBatches(programmePage.items, item => getProgramme(item.enrolmentId)),
    mapInBatches(servicePage.items, item => loadService(item.serviceId)),
  ]);

  const items: CalendarHistoryItem[] = [];
  for (const receipt of protocolPage.items) {
    const parsed = ProtocolExecutionSchema.safeParse(receipt.execution);
    if (!parsed.success) continue;
    const execution = parsed.data;
    const timestamp = execution.finishedAt ?? execution.updatedAt;
    items.push(instantItem(
      execution.executionId,
      'protocol',
      'Saved routine history',
      timestamp,
      projectExecutionCalendarStatus(execution.status, execution.steps.map(step => step.state)),
    ));
  }

  for (const detail of activities) {
    if (detail === null || detail.voided) continue;
    const superseded = new Set(detail.revisions.flatMap(revision => revision.correctsId ? [revision.correctsId] : []));
    for (const revision of detail.revisions) {
      if (revision.kind === 'void' || superseded.has(revision.id)) continue;
      items.push(effectiveDateItem(
        `${detail.id}:${revision.id}`,
        'activity',
        'Recorded activity',
        null,
        'unknown',
      ));
    }
  }

  for (const receipt of cueCheckPage.items) {
    if (receipt.lifecycle === 'voided') continue;
    const status: CalendarStatus = receipt.executionStatus === 'completed'
      ? (receipt.confirmedSteps.length > 0 ? 'completed' : 'unknown')
      : (receipt.confirmedSteps.length > 0 ? 'partial' : 'unknown');
    items.push(instantItem(receipt.recordId, 'cue_check', 'Saved check-in', receipt.observedAt, status));
  }

  for (const detail of programmes) {
    for (const entry of detail.history) {
      const isComplete = entry.kind === 'complete' && detail.status === 'completed';
      const date = entry.kind === 'enrol'
        ? detail.startDate.value
        : entry.occurredAt ?? entry.recordedAt;
      items.push(entry.kind === 'enrol'
        ? effectiveDateItem(`${detail.enrolmentId}:enrol`, 'programme', 'Programme enrolment', detail.startDate, 'unknown')
        : instantItem(`${detail.enrolmentId}:${entry.sequence}`, 'programme',
          entry.kind === 'complete' ? 'Programme completed' : 'Programme history', date,
          isComplete ? 'completed' : 'unknown'));
    }
  }

  for (const detail of services) {
    if (detail === null) continue;
    const superseded = new Set(detail.revisions.flatMap(revision => revision.correctsId ? [revision.correctsId] : []));
    for (const revision of detail.revisions) {
      if (superseded.has(revision.id)) continue;
      items.push(effectiveDateItem(
        `${detail.serviceId}:${revision.id}`,
        'service',
        'Recorded service',
        revision.facts.occurredOn,
        'completed',
      ));
    }
  }

  if (passport !== null) {
    const superseded = new Set(passport.projection.supersededRevisionIds);
    for (const revision of passport.revisions) {
      if (superseded.has(revision.id)) continue;
      items.push(effectiveDateItem(
        revision.id,
        'passport',
        revision.kind === 'correction' ? 'Passport correction' : 'Passport record',
        revision.effectiveDate,
        'unknown',
      ));
    }
  }

  const next: CalendarHistoryCursor = {
    protocol: protocolPage.nextCursor,
    activity: activityPage.nextCursor,
    cueCheck: cueCheckPage.nextCursor,
    programme: programmePage.nextCursor,
    service: servicePage.nextCursor,
    passportLoaded: true,
  };
  return {
    items: items.sort((left, right) => left.sortAt - right.sortAt || left.id.localeCompare(right.id)),
    nextCursor: hasMore(next) ? next : null,
  };
}
