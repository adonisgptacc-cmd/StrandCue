import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  applyExecutionCommand,
  startProtocolExecution,
  type ExecutionCommand,
  type ProtocolDecision,
  type ProtocolExecution,
} from '../../packages/domain/src/index.ts';
import {
  CareEventDerivationInputSchema,
  CareEventSchema,
  CareEventSourceSchema,
  deriveCareEvents as deriveCareEventsRaw,
  type CareEvent,
} from '../../packages/domain/src/care-events.ts';

// ---------------------------------------------------------------------------
// Fixtures: the trusted, already-recorded facts a care ledger derives from.
// Nothing here is generated, planned or assumed; every field is either a
// confirmed execution step or a recorded owner activity.
// ---------------------------------------------------------------------------

const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';
const T2 = '2026-10-13T12:10:00+02:00';

const ACTIVITY_ID = '30000000-0000-4000-8000-000000000001';
const SHELF_ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = '10000000-0000-4000-8000-000000000001';

function deriveCareEvents(sources: unknown): readonly CareEvent[] {
  return deriveCareEventsRaw(sources, OWNER_ID);
}

function step(
  stepId: string,
  position: number,
  overrides: Partial<ProtocolDecision['steps'][number]> = {},
): ProtocolDecision['steps'][number] {
  return {
    stepId,
    position,
    action: 'apply',
    productId: null,
    productVersionId: null,
    toolId: null,
    toolVersionId: null,
    waitSeconds: null,
    rinse: null,
    reasons: [`rule requires ${stepId}`],
    ...overrides,
  };
}

function readyDecision(): ProtocolDecision {
  return {
    status: 'ready',
    requestId: 'run-2026-10-13-001',
    confidence: 'high',
    noPurchaseNeeded: true,
    steps: [
      step('step-1', 1, { productId: 'prod-cleanse', productVersionId: 'v3' }),
      step('step-2', 2, { productId: 'prod-mask', productVersionId: 'm1' }),
      step('step-3', 3, { toolId: 'tool-dryer', toolVersionId: 'd2' }),
    ],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: 'run-2026-10-13-001',
      engineVersion: '1',
      evaluatedRules: [],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
  } as unknown as ProtocolDecision;
}

function start(decision: ProtocolDecision, executionId = 'exec-001'): ProtocolExecution {
  return startProtocolExecution({ executionId, decision, startedAt: T0 });
}

function buildExecution(): ProtocolExecution {
  return start(readyDecision());
}

function run(execution: ProtocolExecution, command: ExecutionCommand, at: string): ProtocolExecution {
  return applyExecutionCommand(execution, command, { at });
}

function confirmed(stepId: string, at = T1, executionId = 'exec-001'): ProtocolExecution {
  return run(start(readyDecision(), executionId), { kind: 'complete-step', stepId }, at);
}

function executionSource(execution: ProtocolExecution, care: unknown[]) {
  return {
    provenance: 'execution-confirmed' as const,
    ownerId: OWNER_ID,
    execution,
    care: care.map(entry => ({
      ...(entry as Record<string, unknown>),
      executionId: execution.executionId,
      recommendationRunId: execution.recommendationRunId,
    })),
  };
}

function activitySource(revisions: unknown[]) {
  return { provenance: 'activity-recorded' as const, ownerId: OWNER_ID, revisions };
}

const baselineActivity = {
  id: '40000000-0000-4000-8000-000000000001',
  activityId: ACTIVITY_ID,
  sequence: 1,
  baseRevision: 0,
  kind: 'baseline' as const,
  effectiveDate: { precision: 'day' as const, value: '2026-10-01' },
  recordedAt: '2026-10-01T10:00:00.000Z',
  source: 'user-reported' as const,
  patch: {
    activityKind: 'wash' as const,
    precision: 'exact_day' as const,
    zones: [{ region: 'whole_head' as const, segment: 'entire_strand' as const }],
    notes: 'cover note that must never leak',
    status: 'active' as const,
  },
};

function changeRevision(sequence: number, patch: Record<string, unknown>, effectiveDate = '2026-10-02') {
  return {
    id: `40000000-0000-4000-8000-0000000000${10 + sequence}`,
    activityId: ACTIVITY_ID,
    sequence,
    baseRevision: sequence - 1,
    kind: 'change' as const,
    effectiveDate: { precision: 'day' as const, value: effectiveDate },
    recordedAt: `2026-10-0${Math.min(sequence, 9)}T10:00:00.000Z`,
    source: 'user-reported' as const,
    patch,
  };
}

function correctionRevision(
  sequence: number,
  correctsId: string,
  patch: Record<string, unknown>,
  effectiveDate = '2026-10-02',
) {
  return {
    id: `40000000-0000-4000-8000-0000000000${20 + sequence}`,
    activityId: ACTIVITY_ID,
    sequence,
    baseRevision: sequence - 1,
    kind: 'correction' as const,
    correctsId,
    correctionReason: 'correction',
    effectiveDate: { precision: 'day' as const, value: effectiveDate },
    recordedAt: `2026-10-1${Math.min(sequence, 9)}T10:00:00.000Z`,
    source: 'user-reported' as const,
    patch,
  };
}

function washCare(stepId: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'wash' as const,
    stepId,
    shampooUsed: 'yes' as const,
    lathers: { state: 'known' as const, value: 2 },
    zones: [],
    ...overrides,
  };
}

function applicationCare(stepId: string, overrides: Record<string, unknown> = {}) {
  return { kind: 'application' as const, stepId, zones: [], ...overrides };
}

function nonCare(stepId: string) {
  return { kind: 'none' as const, stepId };
}

function unknownHeat() {
  return {
    method: { state: 'known' as const, value: 'heated-air' as const },
    temperature: { state: 'unknown' as const },
    setting: { state: 'unknown' as const },
    passes: { state: 'unknown' as const },
    durationMinutes: { state: 'unknown' as const },
    durationBand: { state: 'unknown' as const },
    zones: [],
    attachment: { state: 'unknown' as const },
  };
}

function heatCare(stepId: string, heat: Record<string, unknown>) {
  return { kind: 'heat' as const, stepId, heat };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

describe('deriveCareEvents: confirmed execution steps', () => {
  it('produces one canonical wash event from a confirmed wash step', () => {
    const events = deriveCareEvents([executionSource(confirmed('step-1'), [washCare('step-1')])]);

    expect(events).toHaveLength(1);
    const event = events[0] as CareEvent;
    expect(event.kind).toBe('wash');
    expect(event.provenance).toBe('execution-confirmed');
    expect(event.lifecycle).toBe('active');
    // The recorded confirmation instant is preserved with its offset.
    expect(event.date).toEqual({ precision: 'exact', value: T1 });
    expect(event.source).toEqual({
      recordId: 'exec-001',
      revision: null,
      stepId: 'step-1',
      position: 1,
      runId: 'run-2026-10-13-001',
    });
    // The identity is derived from the trusted source identity (length-prefixed).
    expect(event.eventId).toBe('19:execution-confirmed:8:exec-001:6:step-1');
    if (event.kind !== 'wash') throw new Error('expected wash');
    expect(event.wash.lathers).toEqual({ state: 'known', value: 2 });
    expect(event.wash.shampooUsed).toBe('yes');
  });

  it('preserves the exact trusted product identity on a confirmed application step', () => {
    const events = deriveCareEvents([executionSource(confirmed('step-2'), [applicationCare('step-2')])]);

    const event = events[0] as CareEvent;
    if (event.kind !== 'application') throw new Error('expected application');
    expect(event.application.product).toEqual({
      identity: 'known',
      productId: 'prod-mask',
      productVersionId: 'm1',
    });
  });

  it('preserves recorded heat facts independently', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-3'), [
        heatCare('step-3', {
          method: { state: 'known', value: 'heated-air' },
          temperature: { state: 'known', value: { value: 180, unit: 'C' } },
          setting: { state: 'known', value: 'High' },
          passes: { state: 'known', value: 2 },
          durationMinutes: { state: 'known', value: 8 },
          durationBand: { state: 'unknown' },
          zones: [{ region: 'front', segment: 'ends' }],
          attachment: { state: 'known', value: { kind: 'diffuser' } },
        }),
      ]),
    ]);

    const event = events[0] as CareEvent;
    if (event.kind !== 'heat') throw new Error('expected heat');
    expect(event.heat.temperature).toEqual({ state: 'known', value: { value: 180, unit: 'C' } });
    expect(event.heat.setting).toEqual({ state: 'known', value: 'High' });
    expect(event.heat.passes).toEqual({ state: 'known', value: 2 });
    expect(event.heat.durationMinutes).toEqual({ state: 'known', value: 8 });
    expect(event.heat.durationBand).toEqual({ state: 'unknown' });
    expect(event.heat.zones).toEqual([{ region: 'front', segment: 'ends' }]);
    expect(event.heat.attachment).toEqual({ state: 'known', value: { kind: 'diffuser' } });
    expect(event.heat.method).toEqual({ state: 'known', value: 'heated-air' });
    expect(event.heat.toolIdentity).toEqual({
      state: 'known',
      value: { toolId: 'tool-dryer', toolVersionId: 'd2' },
    });
  });

  it('keeps an unknown temperature unknown even when the tool identity is known', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-3'), [heatCare('step-3', unknownHeat())]),
    ]);

    const event = events[0] as CareEvent;
    if (event.kind !== 'heat') throw new Error('expected heat');
    expect(event.heat.temperature).toEqual({ state: 'unknown' });
    expect(event.heat.toolIdentity.state).toBe('known');
  });

  it('never lets a wattage create or change a temperature', () => {
    // Wattage is not part of the heat contract, so a source carrying it is
    // refused outright: it can never become a temperature.
    expect(() =>
      deriveCareEvents([
        executionSource(confirmed('step-3'), [
          { kind: 'heat', stepId: 'step-3', ...unknownHeat(), wattageWatts: 2000 },
        ]),
      ]),
    ).toThrow(ZodError);

    // A known tool identity plus an explicit unknown temperature stays unknown.
    const kept = deriveCareEvents([
      executionSource(confirmed('step-3'), [heatCare('step-3', unknownHeat())]),
    ]);
    const event = kept[0] as CareEvent;
    if (event.kind !== 'heat') throw new Error('expected heat');
    expect(event.heat.temperature).toEqual({ state: 'unknown' });
  });

  it('never lets a tool model name create a temperature', () => {
    expect(() =>
      deriveCareEvents([
        executionSource(confirmed('step-3'), [
          { kind: 'heat', stepId: 'step-3', ...unknownHeat(), model: 'Turbo 3000' },
        ]),
      ]),
    ).toThrow(ZodError);
  });

  it('produces zero events for pending and skipped steps', () => {
    let execution = run(buildExecution(), { kind: 'complete-step', stepId: 'step-1' }, T1);
    execution = run(execution, { kind: 'skip-step', stepId: 'step-2', reason: 'late' }, T2);

    const events = deriveCareEvents([
      executionSource(execution, [
        washCare('step-1'),
        applicationCare('step-2'),
        heatCare('step-3', unknownHeat()),
      ]),
    ]);

    expect(events.map(event => event.kind)).toEqual(['wash']);
    expect(events.some(event => event.source.stepId === 'step-2')).toBe(false);
    expect(events.some(event => event.source.stepId === 'step-3')).toBe(false);
  });

  it('produces zero events for a started, unconfirmed execution', () => {
    expect(deriveCareEvents([executionSource(buildExecution(), [])])).toEqual([]);
  });

  it.each(['wait', 'rinse', 'leave_in'] as const)(
    'does not turn a confirmed %s step into a care occurrence',
    action => {
      const decision = readyDecision();
      const oneStep = {
        ...decision,
        steps: [step('non-care-step', 1, { action })],
      } as ProtocolDecision;
      const execution = run(start(oneStep), { kind: 'complete-step', stepId: 'non-care-step' }, T1);

      expect(deriveCareEvents([executionSource(execution, [nonCare('non-care-step')])])).toEqual([]);
    },
  );

  it('does not treat a verified substitution as confirmed actual use', () => {
    let execution = run(
      buildExecution(),
      {
        kind: 'substitute-step',
        stepId: 'step-2',
        reason: 'gentler option on hand',
        replacement: { shelfItemId: SHELF_ITEM_ID },
      },
      T2,
    );
    // The server persists the verified replacement after ownership is checked.
    execution = {
      ...execution,
      steps: execution.steps.map(step =>
        step.stepId === 'step-2'
          ? {
              ...step,
              deviation: {
                kind: 'substitute' as const,
                reason: 'gentler option on hand',
                replacement: {
                  shelfItemId: SHELF_ITEM_ID,
                  productId: 'prod-gentle',
                  productVersionId: 'g5',
                  availability: 'available' as const,
                  owned: true as const,
                },
              },
            }
          : step,
      ),
    } as unknown as ProtocolExecution;

    const events = deriveCareEvents([executionSource(execution, [applicationCare('step-2')])]);

    expect(events).toEqual([]);
  });

  it('produces nothing for a preview-only substitution with no verified identity', () => {
    const execution = run(
      buildExecution(),
      {
        kind: 'substitute-step',
        stepId: 'step-2',
        reason: 'swap',
        replacement: { shelfItemId: SHELF_ITEM_ID },
      },
      T2,
    );

    expect(deriveCareEvents([executionSource(execution, [applicationCare('step-2')])])).toEqual([]);
  });

  it('does not treat a modification as confirmed actual use', () => {
    const execution = run(
      buildExecution(),
      { kind: 'modify-step', stepId: 'step-2', reason: 'short on time', detail: 'used 190C for 4 min' },
      T2,
    );

    const events = deriveCareEvents([executionSource(execution, [applicationCare('step-2')])]);

    expect(events).toEqual([]);
  });

  it('keeps a product identity unknown when the trusted source records none', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-3'), [applicationCare('step-3')]),
    ]);

    const event = events[0] as CareEvent;
    if (event.kind !== 'application') throw new Error('expected application');
    expect(event.application.product).toEqual({ identity: 'unknown' });
  });

  it('keeps a tool identity unknown when the trusted source records none', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-1'), [heatCare('step-1', unknownHeat())]),
    ]);

    const event = events[0] as CareEvent;
    if (event.kind !== 'heat') throw new Error('expected heat');
    expect(event.heat.toolIdentity).toEqual({ state: 'unknown' });
  });

  it('fails closed with a named code when a confirmed step has no trusted classification', () => {
    expect(() => deriveCareEvents([executionSource(confirmed('step-1'), [])])).toThrow(
      expect.objectContaining({ code: 'unclassified-actual-use' }),
    );
  });

  it('fails closed on a duplicate or unknown classification', () => {
    expect(() =>
      deriveCareEvents([
        executionSource(confirmed('step-1'), [washCare('step-1'), applicationCare('step-1')]),
      ]),
    ).toThrow(expect.objectContaining({ code: 'duplicate-classification' }));

    expect(() =>
      deriveCareEvents([executionSource(confirmed('step-1'), [washCare('step-9')])]),
    ).toThrow(expect.objectContaining({ code: 'unknown-step' }));
  });
});

describe('deriveCareEvents: recorded owner activities', () => {
  it('produces the correct event for an active recorded wash activity', () => {
    const events = deriveCareEvents([activitySource([baselineActivity])]);

    expect(events).toHaveLength(1);
    const event = events[0] as CareEvent;
    expect(event.kind).toBe('wash');
    expect(event.provenance).toBe('activity-recorded');
    expect(event.lifecycle).toBe('active');
    expect(event.source).toEqual({
      recordId: ACTIVITY_ID,
      revision: 1,
      stepId: null,
      position: null,
      runId: null,
    });
    expect(event.date).toEqual({ precision: 'day', value: '2026-10-01' });
    if (event.kind !== 'wash') throw new Error('expected wash');
    expect(event.wash.shampooUsed).toBe('unknown');
    expect(event.wash.product).toEqual({ identity: 'unknown' });
    expect(event.wash.zones).toEqual([{ region: 'whole_head', segment: 'entire_strand' }]);
  });

  it('leaves only the effective replacement active after a correction', () => {
    const change = changeRevision(2, { zones: [{ region: 'nape', segment: 'ends' }] });
    const events = deriveCareEvents([
      activitySource([baselineActivity, change, correctionRevision(3, change.id, { zones: [{ region: 'crown', segment: 'roots' }] })]),
    ]);

    const active = events.filter(event => event.lifecycle === 'active');
    expect(active).toHaveLength(1);
    const activeEvent = active[0] as CareEvent;
    if (activeEvent.kind !== 'wash') throw new Error('expected wash');
    expect(activeEvent.wash.zones).toEqual([{ region: 'crown', segment: 'roots' }]);
    expect(activeEvent.source.revision).toBe(3);

    expect(events).toHaveLength(1);
  });

  it('keeps the occurrence identity and date stable across a metadata correction', () => {
    const before = deriveCareEvents([activitySource([baselineActivity])])[0] as CareEvent;
    const after = deriveCareEvents([
      activitySource([
        baselineActivity,
        changeRevision(2, { zones: [{ region: 'nape', segment: 'ends' }] }, '2026-10-20'),
      ]),
    ])[0] as CareEvent;

    expect(after.eventId).toBe(before.eventId);
    expect(after.date).toEqual(before.date);
    expect(after.source.revision).toBe(2);
  });

  it('keeps only the active occurrence after several corrections', () => {
    // R1 baseline (whole_head); R2 change (nape); R3 corrects R2 (crown);
    // R4 change (status); R5 corrects R4 (other/mid_lengths).
    const r2 = changeRevision(2, { zones: [{ region: 'nape', segment: 'ends' }] }, '2026-10-02');
    const r3 = correctionRevision(3, r2.id, { zones: [{ region: 'crown', segment: 'roots' }] }, '2026-10-03');
    const r4 = changeRevision(4, { status: 'active' }, '2026-10-04');
    const r5 = correctionRevision(5, r4.id, { zones: [{ region: 'other', segment: 'mid_lengths' }] }, '2026-10-05');

    const events = deriveCareEvents([activitySource([baselineActivity, r2, r3, r4, r5])]);

    const active = events.filter(event => event.lifecycle === 'active');
    expect(active).toHaveLength(1);
    if (active[0]?.kind !== 'wash') throw new Error('expected wash');
    expect(active[0].wash.zones).toEqual([{ region: 'other', segment: 'mid_lengths' }]);
  });

  it('lets the owner\u2019s newest correction win over a later-recorded but earlier-effective change', () => {
    // R2 change (nape, 10-02), R3 change (other/ends, 10-03), R4 correction of
    // R2 (crown/roots, 10-05). Per-field precedence must follow the effective
    // interval, so the correction recorded last but effective latest wins.
    const r2 = changeRevision(2, { zones: [{ region: 'nape', segment: 'ends' }] }, '2026-10-02');
    const r3 = changeRevision(3, { zones: [{ region: 'other', segment: 'ends' }] }, '2026-10-03');
    const r4 = correctionRevision(4, r2.id, { zones: [{ region: 'crown', segment: 'roots' }] }, '2026-10-05');

    const events = deriveCareEvents([activitySource([baselineActivity, r2, r3, r4])]);

    const active = events.filter(event => event.lifecycle === 'active');
    expect(active).toHaveLength(1);
    if (active[0]?.kind !== 'wash') throw new Error('expected wash');
    expect(active[0].wash.zones).toEqual([{ region: 'crown', segment: 'roots' }]);
    expect(active[0].source.revision).toBe(4);

    expect(events).toHaveLength(1);
  });

  it('fails closed when an activity field the ledger reads is ambiguous', () => {
    const r2 = changeRevision(2, { zones: [{ region: 'nape', segment: 'ends' }] }, '2026-10-02');
    const r3 = changeRevision(3, { zones: [{ region: 'crown', segment: 'roots' }] }, '2026-10-02');

    expect(() => deriveCareEvents([activitySource([baselineActivity, r2, r3])])).toThrow(
      expect.objectContaining({ code: 'ambiguous-activity-fact' }),
    );
  });

  it('does not leave a voided activity active', () => {
    const events = deriveCareEvents([
      activitySource([
        baselineActivity,
        {
          id: '40000000-0000-4000-8000-000000000021',
          activityId: ACTIVITY_ID,
          sequence: 2,
          baseRevision: 1,
          kind: 'void',
          voidReason: 'duplicate entry',
          effectiveDate: { precision: 'day', value: '2026-10-01' },
          recordedAt: '2026-10-02T10:00:00.000Z',
          source: 'user-reported',
          patch: {},
        },
      ]),
    ]);

    expect(events).toEqual([]);
  });

  it('treats an activity recorded as voided as a voided event', () => {
    const events = deriveCareEvents([
      activitySource([{ ...baselineActivity, patch: { ...baselineActivity.patch, status: 'voided' } }]),
    ]);

    expect(events).toEqual([]);
  });

  it('keeps unknown date precision unknown instead of defaulting it', () => {
    const events = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'unknown', value: null },
          patch: { ...baselineActivity.patch, precision: 'unknown' },
        },
      ]),
    ]);

    expect(events[0]?.date).toEqual({ precision: 'unknown', value: null });
  });

  it('keeps approximate month and year precision approximate', () => {
    const month = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'month', value: '2026-09' },
          patch: { ...baselineActivity.patch, precision: 'exact_month' },
        },
      ]),
    ]);
    expect(month[0]?.date).toEqual({ precision: 'approximate', value: '2026-09' });

    const year = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'year', value: '2025' },
          patch: { ...baselineActivity.patch, precision: 'exact_year' },
        },
      ]),
    ]);
    expect(year[0]?.date).toEqual({ precision: 'approximate', value: '2025' });
  });

  it('lets the recorded precision decide, coarsening the value and never upgrading it', () => {
    // Patch says unknown although the effective date is a known day.
    const unknownPrecision = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'day', value: '2026-10-01' },
          patch: { ...baselineActivity.patch, precision: 'unknown' },
        },
      ]),
    ]);
    expect(unknownPrecision[0]?.date).toEqual({ precision: 'unknown', value: null });

    // Patch says exact_month although the effective date is a known day.
    const exactMonth = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'day', value: '2026-10-01' },
          patch: { ...baselineActivity.patch, precision: 'exact_month' },
        },
      ]),
    ]);
    expect(exactMonth[0]?.date).toEqual({ precision: 'approximate', value: '2026-10' });

    // Unknown effective date with an otherwise precise patch stays unknown.
    const unknownEffectiveDate = deriveCareEvents([
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'unknown', value: null },
          patch: { ...baselineActivity.patch, precision: 'exact_day' },
        },
      ]),
    ]);
    expect(unknownEffectiveDate[0]?.date).toEqual({ precision: 'unknown', value: null });
  });

  it('does not turn a styling or other activity into a care event', () => {
    const events = deriveCareEvents([
      activitySource([
        { ...baselineActivity, patch: { ...baselineActivity.patch, activityKind: 'styling' } },
      ]),
    ]);

    expect(events).toEqual([]);
  });

  it('fails closed on incoherent activity history', () => {
    expect(() => deriveCareEvents([activitySource([baselineActivity, baselineActivity])])).toThrow();
    expect(() => deriveCareEvents([activitySource([{ ...baselineActivity, kind: 'change' }])])).toThrow();
    expect(() =>
      deriveCareEvents([
        activitySource([baselineActivity, correctionRevision(2, baselineActivity.id, { zones: [] })]),
      ]),
    ).toThrow(/complete Activity/i);
  });

  it('fails closed when two different sources share one activity identity', () => {
    expect(() =>
      deriveCareEvents([
        activitySource([baselineActivity]),
        activitySource([baselineActivity, changeRevision(2, { zones: [{ region: 'crown', segment: 'roots' }] })]),
      ]),
    ).toThrow(expect.objectContaining({ code: 'duplicate-source' }));
  });
});

describe('deriveCareEvents: determinism, immutability and boundaries', () => {
  it('produces byte-identical output for any input array order', () => {
    const execution = run(
      run(buildExecution(), { kind: 'complete-step', stepId: 'step-1' }, T1),
      { kind: 'complete-step', stepId: 'step-3' },
      T1,
    );

    const a = deriveCareEvents([
      executionSource(execution, [washCare('step-1'), heatCare('step-3', unknownHeat())]),
      activitySource([baselineActivity]),
    ]);
    const b = deriveCareEvents([
      activitySource([baselineActivity]),
      executionSource(execution, [heatCare('step-3', unknownHeat()), washCare('step-1')]),
    ]);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('resolves identical-time ties by the stable source identity, not by input order', () => {
    // Step plan order (step-b at position 1, step-a at position 2) is the
    // opposite of the identity order, so a stable no-op sort would fail here.
    const decision = {
      ...readyDecision(),
      steps: [
        step('step-b', 1, { productId: 'p-b', productVersionId: 'v-b' }),
        step('step-a', 2, { productId: 'p-a', productVersionId: 'v-a' }),
      ],
    } as ProtocolDecision;
    let execution = run(start(decision), { kind: 'complete-step', stepId: 'step-b' }, T1);
    execution = run(execution, { kind: 'complete-step', stepId: 'step-a' }, T1);

    const events = deriveCareEvents([
      executionSource(execution, [
        washCare('step-b', { zones: [] }),
        applicationCare('step-a'),
      ]),
    ]);

    // Insertion order was step-b, step-a; the tie-break must sort by eventId.
    expect(events.map(event => event.source.stepId)).toEqual(['step-a', 'step-b']);
  });

  it('collapses a repeated identical source into one event', () => {
    const source = executionSource(confirmed('step-1'), [washCare('step-1')]);

    expect(deriveCareEvents([source, source])).toHaveLength(1);
  });

  it('fails closed when two sources claim one identity with different facts', () => {
    expect(() =>
      deriveCareEvents([
        executionSource(confirmed('step-1'), [washCare('step-1')]),
        executionSource(confirmed('step-1'), [applicationCare('step-1')]),
      ]),
    ).toThrow(/identity/i);
  });

  it('orders an unknown-date event after every dated event', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-1'), [washCare('step-1')]),
      activitySource([
        {
          ...baselineActivity,
          effectiveDate: { precision: 'unknown', value: null },
          patch: { ...baselineActivity.patch, precision: 'unknown' },
        },
      ]),
    ]);

    expect(events).toHaveLength(2);
    expect(events[events.length - 1]?.date).toEqual({ precision: 'unknown', value: null });
  });

  it('never mutates a deep-frozen source and never aliases its objects', () => {
    const care = [washCare('step-1', { zones: [{ region: 'crown', segment: 'roots' }] })];
    const sources = deepFreeze([
      executionSource(confirmed('step-1'), care),
      activitySource([baselineActivity]),
    ]);
    const before = JSON.stringify(sources);

    const events = deriveCareEvents(sources);

    // A frozen input proves no in-place write happened.
    expect(JSON.stringify(sources)).toBe(before);
    // The output shares no nested reference with the input.
    const wash = events.find(event => event.source.recordId === 'exec-001') as CareEvent;
    if (wash.kind !== 'wash') throw new Error('expected wash');
    expect(wash.wash.zones).not.toBe((care[0] as { zones: unknown }).zones);
    expect(wash.wash.zones[0]).not.toBe((care[0] as { zones: unknown[] }).zones[0]);
  });

  it('returns frozen event arrays and deeply frozen event values', () => {
    const events = deriveCareEvents([
      executionSource(confirmed('step-3'), [
        heatCare('step-3', {
          ...unknownHeat(),
          temperature: { state: 'known', value: { value: 180, unit: 'C' } },
        }),
      ]),
    ]);

    const event = events[0] as CareEvent;
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.date)).toBe(true);
    expect(Object.isFrozen(event.source)).toBe(true);
    if (event.kind !== 'heat') throw new Error('expected heat');
    expect(Object.isFrozen(event.heat)).toBe(true);
    expect(Object.isFrozen(event.heat.zones)).toBe(true);
    expect(Object.isFrozen(event.heat.temperature)).toBe(true);
    if (event.heat.temperature.state !== 'known') throw new Error('expected known temperature');
    expect(Object.isFrozen(event.heat.temperature.value)).toBe(true);
    expect(() => (event.heat.zones as unknown[]).push({ region: 'crown', segment: 'roots' })).toThrow(TypeError);
  });

  it('returns a frozen empty array for empty valid input', () => {
    const events = deriveCareEvents([]);

    expect(events).toEqual([]);
    expect(Object.isFrozen(events)).toBe(true);
  });

  it('fails closed on malformed source values through the boundary', () => {
    expect(() => deriveCareEvents('not-an-array')).toThrow(ZodError);
    expect(() => deriveCareEvents([{ provenance: 'execution-confirmed' }])).toThrow(ZodError);
    expect(() => deriveCareEvents([{ provenance: 'activity-recorded', revisions: [] }])).toThrow(ZodError);
    expect(() => CareEventDerivationInputSchema.parse([{ provenance: 'nope' }])).toThrow(ZodError);
  });

  it('refuses a care classification bound to another execution or run', () => {
    const execution = confirmed('step-1');
    const source = executionSource(execution, [washCare('step-1')]);

    expect(() =>
      deriveCareEvents([{ ...source, care: source.care.map(entry => ({ ...entry, executionId: 'another-execution' })) }]),
    ).toThrow(expect.objectContaining({ code: 'classification-binding-mismatch' }));
    expect(() =>
      deriveCareEvents([{ ...source, care: source.care.map(entry => ({ ...entry, recommendationRunId: 'another-run' })) }]),
    ).toThrow(expect.objectContaining({ code: 'classification-binding-mismatch' }));
  });

  it('refuses to combine sources belonging to different owners', () => {
    const foreignOwner = '10000000-0000-4000-8000-000000000002';
    expect(() =>
      deriveCareEvents([
        executionSource(confirmed('step-1'), [washCare('step-1')]),
        { ...activitySource([baselineActivity]), ownerId: foreignOwner },
      ]),
    ).toThrow(expect.objectContaining({ code: 'owner-mismatch' }));
  });

  it('does not leak reason, detail, notes, urls or identifiers into event values', () => {
    const markers = {
      reason: 'reason-marker-must-never-leak',
      detail: 'detail-marker-must-never-leak',
      notes: 'notes-marker-must-never-leak',
      email: 'leak-marker-abado@example.com',
      url: 'https://leak-marker.example.com/case',
    };
    const markerDecision = {
      ...readyDecision(),
      steps: readyDecision().steps.map(item => ({ ...item, reasons: [markers.reason] })),
    } as ProtocolDecision;
    let execution = run(start(markerDecision), { kind: 'complete-step', stepId: 'step-1' }, T1);
    execution = run(
      execution,
      { kind: 'modify-step', stepId: 'step-2', reason: markers.url, detail: markers.detail },
      T2,
    );

    const events = deriveCareEvents([
      executionSource(execution, [washCare('step-1'), applicationCare('step-2')]),
      activitySource([
        { ...baselineActivity, patch: { ...baselineActivity.patch, notes: `${markers.notes} ${markers.email} ${markers.url}` } },
      ]),
    ]);

    // Positive control: the run produced real events, so the absence check means something.
    expect(events.length).toBeGreaterThanOrEqual(2);
    const serialized = JSON.stringify(events);
    expect(serialized).toContain('exec-001');
    for (const marker of Object.values(markers)) {
      expect(serialized).not.toContain(marker);
    }
    expect(serialized).not.toContain('reasons');
    expect(serialized).not.toContain('ownerId');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('evidenceId');
    expect(serialized).not.toContain('reviewedBy');
  });

  it('refuses a source carrying any key it does not model', () => {
    const withReviewer = {
      provenance: 'execution-confirmed',
      ownerId: OWNER_ID,
      execution: buildExecution(),
      care: [],
      reviewedBy: 'must-not-pass',
    };

    expect(() => CareEventSourceSchema.parse(withReviewer)).toThrow(ZodError);
    expect(() => deriveCareEvents([withReviewer])).toThrow(ZodError);
    expect(() =>
      CareEventDerivationInputSchema.parse([
        { provenance: 'execution-confirmed', ownerId: OWNER_ID, execution: buildExecution(), care: [], extra: 1 },
      ]),
    ).toThrow(ZodError);
  });

  it('enforces provenance-conditional source references on the exported event schema', () => {
    const event = deriveCareEvents([executionSource(confirmed('step-1'), [washCare('step-1')])])[0] as CareEvent;
    const serialized = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;

    // A correctly shaped event parses.
    expect(CareEventSchema.safeParse(serialized).success).toBe(true);
    // An activity revision on an execution event is refused.
    expect(CareEventSchema.safeParse({ ...serialized, source: { ...event.source, revision: 7 } }).success).toBe(false);
    // A corrected execution fact is refused.
    expect(CareEventSchema.safeParse({ ...serialized, lifecycle: 'corrected' }).success).toBe(false);

    const activityEvent = deriveCareEvents([activitySource([baselineActivity])])[0] as CareEvent;
    const activitySerialized = JSON.parse(JSON.stringify(activityEvent)) as Record<string, unknown>;
    expect(CareEventSchema.safeParse(activitySerialized).success).toBe(true);
    // An activity event without its revision, or carrying execution step facts, is refused.
    expect(
      CareEventSchema.safeParse({ ...activitySerialized, source: { ...activityEvent.source, revision: null } }).success,
    ).toBe(false);
    expect(
      CareEventSchema.safeParse({ ...activitySerialized, source: { ...activityEvent.source, stepId: 'step-1' } }).success,
    ).toBe(false);
  });
});
