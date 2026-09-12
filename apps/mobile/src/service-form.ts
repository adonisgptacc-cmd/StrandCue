import { z } from 'zod';

import {
  CorrectServiceCommandSchema,
  CreateServiceCommandSchema,
  ServiceZoneSchema,
  type CorrectServiceCommand,
  type CreateServiceCommand,
  type ServiceZone,
} from '../../../packages/domain/src/index';

const zoneKey = (zone: ServiceZone): string => `${zone.region}:${zone.segment}`;

const ZonesSchema = z.array(ServiceZoneSchema).min(1).max(36)
  .superRefine((zones, context) => {
    const keys = zones.map(zoneKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Service zone is already added' });
    }
  })
  .transform(zones => [...zones].sort((left, right) => zoneKey(left).localeCompare(zoneKey(right))));

function parseZones(zones: readonly ServiceZone[]): ServiceZone[] {
  return ZonesSchema.parse(zones);
}

function requireZone(zones: readonly ServiceZone[], zone: ServiceZone): ServiceZone[] {
  const parsedZones = parseZones(zones);
  if (!parsedZones.some(item => zoneKey(item) === zoneKey(zone))) {
    throw new Error('Service zone is not added');
  }
  return parsedZones;
}

export function addZone(zones: readonly ServiceZone[], zone: ServiceZone): readonly ServiceZone[] {
  const parsedZone = ServiceZoneSchema.parse(zone);
  const parsedZones = parseZones(zones);
  if (parsedZones.some(item => zoneKey(item) === zoneKey(parsedZone))) {
    throw new Error('Service zone is already added');
  }
  return ZonesSchema.parse([...parsedZones, parsedZone]);
}

export function removeZone(zones: readonly ServiceZone[], zone: ServiceZone): readonly ServiceZone[] {
  const parsedZone = ServiceZoneSchema.parse(zone);
  const parsedZones = requireZone(zones, parsedZone);
  return ZonesSchema.parse(parsedZones.filter(item => zoneKey(item) !== zoneKey(parsedZone)));
}

export function replaceZone(
  zones: readonly ServiceZone[],
  currentZone: ServiceZone,
  replacementZone: ServiceZone,
): readonly ServiceZone[] {
  const parsedCurrentZone = ServiceZoneSchema.parse(currentZone);
  const parsedReplacementZone = ServiceZoneSchema.parse(replacementZone);
  const parsedZones = requireZone(zones, parsedCurrentZone);
  if (zoneKey(parsedCurrentZone) === zoneKey(parsedReplacementZone)) return parsedZones;
  if (parsedZones.some(item => zoneKey(item) === zoneKey(parsedReplacementZone))) {
    throw new Error('Service zone is already added');
  }
  return ZonesSchema.parse(parsedZones.map(item =>
    zoneKey(item) === zoneKey(parsedCurrentZone) ? parsedReplacementZone : item,
  ));
}

export function buildCreateServiceCommand(
  operationId: string,
  serviceId: string,
  facts: unknown,
  initialObservation?: unknown,
): CreateServiceCommand {
  return CreateServiceCommandSchema.parse({ operationId, serviceId, facts, initialObservation });
}

export function buildCorrectionCommand(
  operationId: string,
  serviceId: string,
  expectedRevision: number,
  correctsId: string,
  reason: string,
  facts: unknown,
): CorrectServiceCommand {
  return CorrectServiceCommandSchema.parse({
    operationId,
    serviceId,
    expectedRevision,
    correctsId,
    reason,
    facts,
  });
}
