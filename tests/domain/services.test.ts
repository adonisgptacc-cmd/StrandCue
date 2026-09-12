import { describe, expect, it } from 'vitest';

import {
  CorrectServiceCommandSchema,
  CreateServiceCommandSchema,
  ObserveServiceCommandSchema,
  ServiceFactsSchema,
  ServiceHeatSchema,
} from '../../packages/domain/src/index.ts';

const operationId = '10000000-0000-4000-8000-000000000001';
const serviceId = '10000000-0000-4000-8000-000000000002';
const revisionId = '10000000-0000-4000-8000-000000000003';

const nanoplasty = {
  operationId,
  serviceId,
  facts: {
    serviceType: 'nanoplasty',
    occurredOn: { precision: 'month', value: '2026-07' },
    productOrSystem: null,
    notes: null,
    zones: [
      { region: 'front', segment: 'roots' },
      { region: 'crown', segment: 'ends' },
    ],
    heat: {
      method: 'unknown',
      temperatureC: null,
      passes: null,
      durationMinutes: null,
      source: 'user-estimated',
    },
  },
  initialObservation: {
    observedOn: { precision: 'day', value: '2026-09-11' },
    effectStatus: 'unknown',
  },
} as const;

describe('Chemical Service contracts', () => {
  it('accepts an explicit Nanoplasty occurrence without inferring chemical facts', () => {
    const parsed = CreateServiceCommandSchema.parse(nanoplasty);

    expect(parsed.facts).not.toHaveProperty('chemicalSystem');
    expect(parsed.facts.heat).toEqual(nanoplasty.facts.heat);
    expect(parsed.initialObservation).toEqual(nanoplasty.initialObservation);
  });

  it('canonically sorts zones without mutating the submitted payload', () => {
    const submitted = structuredClone(nanoplasty);
    const before = structuredClone(submitted);

    const parsed = CreateServiceCommandSchema.parse(submitted);

    expect(parsed.facts.zones).toEqual([
      { region: 'crown', segment: 'ends' },
      { region: 'front', segment: 'roots' },
    ]);
    expect(submitted).toEqual(before);
  });

  it('rejects duplicate zone pairs', () => {
    expect(() => CreateServiceCommandSchema.parse({
      ...nanoplasty,
      facts: {
        ...nanoplasty.facts,
        zones: [nanoplasty.facts.zones[0], nanoplasty.facts.zones[0]],
      },
    })).toThrow(/unique/i);
  });

  it.each([
    ['a top-level unknown key', { ...nanoplasty, userId: serviceId }],
    ['an unknown fact key', { ...nanoplasty, facts: { ...nanoplasty.facts, chemicalSystem: 'guessed' } }],
    ['an unknown zone key', { ...nanoplasty, facts: { ...nanoplasty.facts, zones: [{ region: 'front', segment: 'roots', inferred: true }] } }],
    ['an invalid service type', { ...nanoplasty, facts: { ...nanoplasty.facts, serviceType: 'protein-treatment' } }],
  ])('rejects %s', (_name, command) => {
    expect(() => CreateServiceCommandSchema.parse(command)).toThrow();
  });

  it.each([
    ['other requires its label', { ...nanoplasty.facts, serviceType: 'other', otherLabel: null }],
    ['other rejects a missing label', { ...nanoplasty.facts, serviceType: 'other' }],
    ['named types reject another label', { ...nanoplasty.facts, otherLabel: 'Custom service' }],
  ])('enforces conditional otherLabel: %s', (_name, facts) => {
    expect(() => ServiceFactsSchema.parse(facts)).toThrow();
  });

  it('trims and retains an other label only for other services', () => {
    expect(ServiceFactsSchema.parse({
      ...nanoplasty.facts,
      serviceType: 'other',
      otherLabel: '  bespoke smoothing  ',
      heat: undefined,
    })).toMatchObject({ otherLabel: 'bespoke smoothing' });
  });

  it.each([
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['a negative temperature', -1],
  ])('rejects %s heat temperature', (_name, temperatureC) => {
    expect(() => ServiceHeatSchema.parse({
      method: 'flat-iron', temperatureC, passes: null, durationMinutes: null, source: 'user-reported',
    })).toThrow();
  });

  it.each([
    ['passes', -1],
    ['durationMinutes', -1],
    ['passes', 1.5],
    ['durationMinutes', Number.POSITIVE_INFINITY],
  ])('rejects invalid heat %s values', (field, value) => {
    expect(() => ServiceHeatSchema.parse({
      method: 'blow-dryer', temperatureC: null,
      passes: field === 'passes' ? value : null,
      durationMinutes: field === 'durationMinutes' ? value : null,
      source: 'user-reported',
    })).toThrow();
  });

  it('accepts omitted or explicit null heat without adding heat facts', () => {
    const { heat: _heat, ...factsWithoutHeat } = nanoplasty.facts;

    expect(ServiceFactsSchema.parse(factsWithoutHeat)).not.toHaveProperty('heat');
    expect(ServiceFactsSchema.parse({ ...nanoplasty.facts, heat: null }).heat).toBeNull();
  });

  it.each([
    ['an impossible calendar date', { precision: 'day', value: '2026-02-30' }],
    ['a future date', { precision: 'day', value: '2099-01-01' }],
  ])('rejects %s', (_name, occurredOn) => {
    expect(() => ServiceFactsSchema.parse({ ...nanoplasty.facts, occurredOn })).toThrow();
  });

  it.each([
    ['otherLabel', 'x'.repeat(101)],
    ['productOrSystem', 'x'.repeat(201)],
    ['notes', 'x'.repeat(2_001)],
  ])('enforces UTF-16 limits on %s', (field, value) => {
    expect(() => ServiceFactsSchema.parse({ ...nanoplasty.facts, [field]: value })).toThrow();
  });

  it('requires complete replacement facts and correction metadata', () => {
    expect(CorrectServiceCommandSchema.parse({
      operationId,
      serviceId,
      expectedRevision: 2,
      correctsId: revisionId,
      reason: '  Corrected the zone selection  ',
      facts: nanoplasty.facts,
    })).toMatchObject({ expectedRevision: 2, reason: 'Corrected the zone selection' });

    expect(() => CorrectServiceCommandSchema.parse({
      operationId, serviceId, expectedRevision: 0, correctsId: revisionId, reason: '', facts: { serviceType: 'nanoplasty' },
    })).toThrow();
  });

  it('keeps later observations separate from service facts', () => {
    expect(ObserveServiceCommandSchema.parse({
      operationId,
      serviceId,
      observation: { observedOn: { precision: 'unknown', value: null }, effectStatus: 'not-present' },
    })).toEqual({
      operationId,
      serviceId,
      observation: { observedOn: { precision: 'unknown', value: null }, effectStatus: 'not-present' },
    });
  });
});
