import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCalendarHistoryPage } from '../../apps/mobile/src/calendar-history';

const mocks = vi.hoisted(() => ({
  listProtocolExecutions: vi.fn(),
  listActivities: vi.fn(),
  getActivity: vi.fn(),
  listCueChecks: vi.fn(),
  listProgrammes: vi.fn(),
  getProgramme: vi.fn(),
  loadServices: vi.fn(),
  loadService: vi.fn(),
  loadPassport: vi.fn(),
}));

vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({ listProtocolExecutions: mocks.listProtocolExecutions }));
vi.mock('../../apps/mobile/src/activity-api', () => ({ listActivities: mocks.listActivities, getActivity: mocks.getActivity }));
vi.mock('../../apps/mobile/src/cue-check-api', () => ({ listCueChecks: mocks.listCueChecks }));
vi.mock('../../apps/mobile/src/programme-api', () => ({ listProgrammes: mocks.listProgrammes, getProgramme: mocks.getProgramme }));
vi.mock('../../apps/mobile/src/services-api', () => ({ loadServices: mocks.loadServices, loadService: mocks.loadService }));
vi.mock('../../apps/mobile/src/passport-api', () => ({ loadPassport: mocks.loadPassport }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProtocolExecutions.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listActivities.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listCueChecks.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listProgrammes.mockResolvedValue({ items: [], nextCursor: null });
  mocks.loadServices.mockResolvedValue({ items: [], nextCursor: null });
  mocks.loadPassport.mockResolvedValue(null);
});

describe('account calendar history', () => {
  it('combines owner history sources with source dates and conservative canonical status', async () => {
    mocks.listActivities.mockResolvedValue({ items: [{ id: 'activity-1', revision: 1 }], nextCursor: null });
    mocks.getActivity.mockResolvedValue({
      id: 'activity-1', revision: 1, voided: false,
      revisions: [{ id: 'activity-revision-1', kind: 'baseline', precision: 'unknown', correctsId: null, voidReason: null, patch: {} }],
    });
    mocks.listCueChecks.mockResolvedValue({ items: [{
      recordId: 'check-1', observedAt: '2026-10-30T10:00:00.000Z', lifecycle: 'active',
      executionStatus: 'abandoned', confirmedSteps: [{ stepId: 'step-1' }], revision: 1,
    }], nextCursor: null });
    mocks.listProgrammes.mockResolvedValue({ items: [{ enrolmentId: 'programme-1' }], nextCursor: null });
    mocks.getProgramme.mockResolvedValue({
      enrolmentId: 'programme-1',
      startDate: { precision: 'day', value: '2026-10-20' },
      status: 'completed',
      history: [
        { sequence: 1, kind: 'enrol', recordedAt: '2026-10-20T09:00:00.000Z' },
        { sequence: 2, kind: 'complete', occurredAt: '2026-10-27T09:00:00.000Z', recordedAt: '2026-10-27T09:02:00.000Z' },
      ],
    });
    mocks.loadServices.mockResolvedValue({ items: [{ serviceId: 'service-1' }], nextCursor: null });
    mocks.loadService.mockResolvedValue({ serviceId: 'service-1', revisions: [{
      id: 'service-revision-1', kind: 'baseline', correctsId: null, recordedAt: '2026-10-18T12:00:00.000Z',
      facts: { occurredOn: { precision: 'day', value: '2026-10-18' } },
    }] });
    mocks.loadPassport.mockResolvedValue({
      projection: { supersededRevisionIds: ['passport-old'] },
      revisions: [
        { id: 'passport-old', kind: 'baseline', effectiveDate: { precision: 'day', value: '2026-10-10' }, recordedAt: '2026-10-10T10:00:00.000Z' },
        { id: 'passport-new', kind: 'correction', effectiveDate: { precision: 'day', value: '2026-10-11' }, recordedAt: '2026-10-12T10:00:00.000Z', correctsId: 'passport-old' },
        { id: 'passport-year', kind: 'change', effectiveDate: { precision: 'approximate', value: '2026' }, recordedAt: '2026-10-14T10:00:00.000Z' },
      ],
    });

    const page = await loadCalendarHistoryPage(null);

    expect(page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'activity-1:activity-revision-1', source: 'activity', dateKey: null, status: 'unknown' }),
      expect.objectContaining({ id: 'check-1', source: 'cue_check', dateKey: '2026-10-30', status: 'partial' }),
      expect.objectContaining({ id: 'programme-1:2', source: 'programme', dateKey: '2026-10-27', status: 'completed' }),
      expect.objectContaining({ id: 'programme-1:enrol', source: 'programme', dateKey: '2026-10-20', status: 'unknown' }),
      expect.objectContaining({ id: 'service-1:service-revision-1', source: 'service', dateKey: '2026-10-18', status: 'completed' }),
      expect.objectContaining({ id: 'passport-new', source: 'passport', dateKey: '2026-10-11', status: 'unknown' }),
      expect.objectContaining({ id: 'passport-year', source: 'passport', dateKey: null, date: 'Date unknown', status: 'unknown' }),
    ]));
    expect(page.items.some(item => item.id === 'passport-old')).toBe(false);
    expect(mocks.getActivity).toHaveBeenCalledWith('activity-1', true);
    expect(mocks.getProgramme).toHaveBeenCalledWith('programme-1');
    expect(mocks.loadService).toHaveBeenCalledWith('service-1');
  });

  it('advances each source cursor and does not reload the unpaged Passport history', async () => {
    const cursor = {
      protocol: 'p2', activity: { id: 'a2', updatedAt: '2026-10-31T10:00:00.000000Z' },
      cueCheck: { id: 'c2', createdAt: '2026-10-31T10:00:00.000000Z' },
      programme: { id: 'g2' }, service: { serviceId: 's2', asOf: '2026-11-01', effectiveStart: '2026-11-01', recordedAt: '2026-10-31T10:00:00.000000Z' }, passportLoaded: true,
    };
    await loadCalendarHistoryPage(cursor);

    expect(mocks.listProtocolExecutions).toHaveBeenCalledWith({ limit: 25, cursor: 'p2' });
    expect(mocks.listActivities).toHaveBeenCalledWith(expect.any(String), { limit: 25, cursor: { id: 'a2', updatedAt: '2026-10-31T10:00:00.000000Z' } });
    expect(mocks.listCueChecks).toHaveBeenCalledWith({ limit: 25, cursor: { id: 'c2', createdAt: '2026-10-31T10:00:00.000000Z' } });
    expect(mocks.listProgrammes).toHaveBeenCalledWith({ limit: 25, cursor: { id: 'g2' } });
    expect(mocks.loadServices).toHaveBeenCalledWith(expect.any(String), { limit: 25, cursor: { serviceId: 's2', asOf: '2026-11-01', effectiveStart: '2026-11-01', recordedAt: '2026-10-31T10:00:00.000000Z' } });
    expect(mocks.loadPassport).not.toHaveBeenCalled();
  });

  it('does not restart history sources after their cursor is exhausted', async () => {
    mocks.listProtocolExecutions.mockResolvedValueOnce({ items: [], nextCursor: null });
    mocks.listActivities.mockResolvedValueOnce({ items: [], nextCursor: { id: 'activity-next', updatedAt: '2026-10-31T10:00:00.000000Z' } });
    mocks.listCueChecks.mockResolvedValueOnce({ items: [], nextCursor: null });
    mocks.listProgrammes.mockResolvedValueOnce({ items: [], nextCursor: { id: 'programme-next' } });
    mocks.loadServices.mockResolvedValueOnce({ items: [], nextCursor: null });

    const firstPage = await loadCalendarHistoryPage(null);
    expect(firstPage.nextCursor).not.toBeNull();
    await loadCalendarHistoryPage(firstPage.nextCursor);

    expect(mocks.listProtocolExecutions).toHaveBeenCalledTimes(1);
    expect(mocks.listCueChecks).toHaveBeenCalledTimes(1);
    expect(mocks.loadServices).toHaveBeenCalledTimes(1);
  });

  it('bounds concurrent detail lookups while mapping a history page', async () => {
    let active = 0;
    let peak = 0;
    mocks.listActivities.mockResolvedValue({
      items: Array.from({ length: 25 }, (_, index) => ({ id: `activity-${index}`, revision: 1 })),
      nextCursor: null,
    });
    mocks.getActivity.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return null;
    });

    await loadCalendarHistoryPage(null);

    expect(mocks.getActivity).toHaveBeenCalledTimes(25);
    expect(peak).toBeLessThanOrEqual(8);
  });
});
