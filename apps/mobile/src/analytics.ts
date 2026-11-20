import { z } from 'zod';

import {
  ActivityKindSchema,
  ServiceTypeSchema,
  ToolTypeSchema,
} from '../../../packages/domain/src/index';

// Documented event taxonomy: the only events that may ever be emitted.
// Properties are coarse enums only — never email, username, notes, free
// text, hair payloads or raw record identifiers. The PostHog provider
// decision stays a Beta external gate; until then the default sink is
// a no-op and nothing leaves the device.

const productCategorySchema = z.enum([
  'shampoo', 'clarifier', 'conditioner', 'mask', 'bond/protein treatment',
  'leave-in', 'heat protectant', 'anti-humidity', 'styling cream', 'mousse',
  'gel', 'serum', 'oil', 'scalp', 'colour', 'other',
]);

const eventSchemas = {
  session_start: z.object({}).strict(),
  hair_passport_saved: z.object({}).strict(),
  chemical_service_added: z.object({ serviceType: ServiceTypeSchema }).strict(),
  product_added: z.object({ category: productCategorySchema }).strict(),
  tool_added: z.object({ toolType: ToolTypeSchema }).strict(),
  activity_added: z.object({ kind: ActivityKindSchema }).strict(),
  export_completed: z.object({}).strict(),
  deletion_requested: z.object({}).strict(),
} as const;

export type AnalyticsEventName = keyof typeof eventSchemas;

export const documentedEvents: readonly { name: AnalyticsEventName; description: string }[] = [
  { name: 'session_start', description: 'App foregrounded with a valid session.' },
  { name: 'hair_passport_saved', description: 'Hair Passport baseline or change saved.' },
  { name: 'chemical_service_added', description: 'Chemical service recorded, by service type.' },
  { name: 'product_added', description: 'Shelf product added, by category.' },
  { name: 'tool_added', description: 'Tool added, by tool type.' },
  { name: 'activity_added', description: 'Activity recorded, by kind.' },
  { name: 'export_completed', description: 'Data export completed.' },
  { name: 'deletion_requested', description: 'Account deletion requested.' },
];

export interface AnalyticsSinkEvent {
  readonly name: AnalyticsEventName;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
}

export type AnalyticsSink = (event: AnalyticsSinkEvent) => void;

const emailLike = /@/;
// UUIDs, tokens and long free text never belong in telemetry.
const identifierLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Defense in depth: even a future documented string property is scanned.
function assertNoPii(value: unknown): void {
  if (typeof value === 'string') {
    if (emailLike.test(value) || identifierLike.test(value) || value.length > 100) {
      throw new Error('analytics-pii-rejected');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoPii(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertNoPii(item);
  }
}

export function createAnalytics(options: { sink?: AnalyticsSink } = {}) {
  const sink = options.sink ?? (() => undefined);
  let consented = false;
  return {
    get enabled() {
      return consented;
    },
    setConsent(granted: boolean) {
      consented = granted;
    },
    track(name: AnalyticsEventName, properties: unknown) {
      const schema = (eventSchemas as Record<string, z.ZodType>)[name];
      if (!schema) throw new Error('analytics-unknown-event');
      assertNoPii(properties);
      const parsed = schema.parse(properties) as Record<string, unknown>;
      if (!consented) return;
      try {
        sink({ name, properties: parsed, timestamp: new Date().toISOString() });
      } catch {
        // Telemetry must never break recordkeeping.
      }
    },
  };
}
