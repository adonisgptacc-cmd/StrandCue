import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  generateProtocol,
  GuidanceActivityHistoryPageSchema,
  GuidanceToolOwnerFactsSchema,
  ServiceFactsSchema,
  validatePublishedBundle,
} from '../../../packages/domain/src/index.ts';
import {
  loadGuidanceSnapshotFromSources,
  type GuidanceSnapshotSources,
} from '../../../apps/mobile/src/guidance/guidance-snapshot-core.ts';
import { generateTodayGuidanceFromDependencies } from '../../../apps/mobile/src/guidance/today-guidance-core.ts';
import { CURRENT_REVIEWED_BUNDLE } from '../../../apps/mobile/src/guidance/reviewed-bundle.ts';
import { CHECKED_IN_CAPABILITY_REVIEW } from '../../../apps/mobile/src/guidance/capability-review.ts';
import { CHECKED_IN_EVIDENCE_REGISTRY } from '../../../apps/mobile/src/guidance/evidence-registry.ts';
import { handleTodayGuidanceRequest, type TodayEdgeDependencies } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const url = Deno.env.get('SUPABASE_URL');
const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !publishableKey || !serviceKey) {
  throw new Error('Today guidance server configuration is incomplete');
}

const authClient = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Uuid = z.string().uuid();
const Availability = z.enum(['available', 'low', 'empty', 'out_of_stock', 'archived']);
const Cursor = z.object({ updatedAt: z.string(), id: Uuid }).strict().nullable();
const Summary = z.object({
  id: Uuid,
  revision: z.number().int().nonnegative(),
  availability: Availability,
  manualName: z.string().nullable().optional(),
  manualModel: z.string().nullable().optional(),
}).passthrough();
const OwnedPage = z.object({ items: z.array(Summary).max(100), nextCursor: Cursor }).strict();
const OwnedDetail = Summary.extend({
  versionId: Uuid.nullable(),
  wattageWatts: GuidanceToolOwnerFactsSchema.shape.wattageWatts.optional(),
  adjustableTemp: GuidanceToolOwnerFactsSchema.shape.adjustableTemp.optional(),
  settings: GuidanceToolOwnerFactsSchema.shape.settings.optional(),
  heatMethods: GuidanceToolOwnerFactsSchema.shape.heatMethods.optional(),
}).passthrough();
const ServicePage = z.object({
  items: z.array(z.object({
    serviceId: Uuid,
    currentPresence: z.enum(['present', 'not-present', 'unknown']),
    facts: ServiceFactsSchema,
  }).passthrough()).max(100),
  nextCursor: z.object({
    asOf: z.iso.date(),
    effectiveStart: z.iso.date(),
    recordedAt: z.iso.datetime({ offset: true }),
    serviceId: Uuid,
  }).strict().nullable(),
}).strict();
const Passport = z.object({
  projection: z.object({ values: z.record(z.string(), z.unknown()) }).passthrough(),
}).passthrough();

interface RpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

async function rpc(client: unknown, name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (client as RpcClient).rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}

function ownerClient(token: string) {
  return createClient(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function sources(client: unknown): GuidanceSnapshotSources {
  return {
    loadPassport: async asOf => Passport.nullable().parse(await rpc(client, 'get_passport', { p_as_of: asOf })),
    loadServices: async (asOf, options) => ServicePage.parse(await rpc(client, 'list_services', {
      p_as_of: asOf, p_limit: options.limit, p_cursor: options.cursor ?? null,
    })),
    listGuidanceActivityHistories: async (effectiveAsOf, recordedAsOf, options) =>
      GuidanceActivityHistoryPageSchema.parse(await rpc(client, 'list_guidance_activity_histories', {
        p_effective_as_of: effectiveAsOf, p_recorded_as_of: recordedAsOf,
        p_limit: options.limit, p_cursor: options.cursor ?? null,
      })),
    listUserProducts: async options => OwnedPage.parse(await rpc(client, 'shelf_list', {
      p_limit: options?.limit ?? 100, p_cursor: options?.cursor ?? null,
    })),
    getUserProduct: async id => OwnedDetail.nullable().parse(await rpc(client, 'shelf_history', {
      p_user_product_id: id, p_include_audit: false,
    })),
    listUserTools: async options => OwnedPage.parse(await rpc(client, 'tool_list', {
      p_limit: options?.limit ?? 100, p_cursor: options?.cursor ?? null,
    })),
    getUserTool: async id => OwnedDetail.nullable().parse(await rpc(client, 'tool_history', {
      p_user_tool_id: id, p_include_audit: false,
    })),
  };
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const dependencies: TodayEdgeDependencies = {
  authenticate: async token => {
    const { data, error } = await authClient.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  reserveRequest: async token => {
    await rpc(ownerClient(token), 'reserve_today_guidance_request', {});
  },
  readRevision: async token => {
    const value = await rpc(ownerClient(token), 'get_guidance_source_revision', {});
    const revision = z.number().int().nonnegative().parse(value);
    return revision;
  },
  loadAssessment: (token, assessmentId) => rpc(ownerClient(token), 'get_heat_coach_assessment', {
    p_id: assessmentId,
  }),
  generate: async (request, token) => {
    const client = ownerClient(token);
    return generateTodayGuidanceFromDependencies(request, {
      loadSnapshot: (ownerId, asOf, loadedAt, signal) =>
        loadGuidanceSnapshotFromSources(ownerId, asOf, loadedAt, sources(client), signal),
      generateProtocol,
      currentBundle: () => CURRENT_REVIEWED_BUNDLE,
      evidenceRegistry: () => CHECKED_IN_EVIDENCE_REGISTRY,
      capabilityReview: () => CHECKED_IN_CAPABILITY_REVIEW,
      validateBundle: validatePublishedBundle,
      hashText,
    });
  },
  persistReady: async (ownerId, result, revision) => rpc(admin, 'record_server_recommendation_run', {
    p_owner_id: ownerId,
    p_request_id: result.requestId,
    p_input_fingerprint: result.inputFingerprint,
    p_as_of: result.asOf,
    p_engine_version: result.engineVersion,
    p_bundle_id: result.bundleId,
    p_bundle_version: result.bundleVersion,
    p_status: result.status,
    p_input: result.input,
    p_decision: result.decision,
    p_source_revision: revision,
  }),
  now: () => new Date(),
};

Deno.serve(request => handleTodayGuidanceRequest(request, dependencies));
