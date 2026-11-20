import { withSupabase } from '@supabase/server';

import { handleVerifyEngineRulesetRequest, type VerifyEngineRulesetDependencies } from './handler.ts';

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void;
};

interface RpcClient {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

async function rpc(client: unknown, name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (client as RpcClient).rpc(name, parameters);
  if (error) throw new Error('engine-ruleset-verification-rpc-unavailable');
  return data;
}

Deno.serve(withSupabase({ auth: 'user' }, async (request, context) => {
  const dependencies: VerifyEngineRulesetDependencies = {
    authenticate: async token => {
      const { data, error } = await context.supabase.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    loadDraft: async (_token, publicationId, packetDigest) => rpc(context.supabase,
      'read_engine_ruleset_draft_for_verification', {
        p_publication_id: publicationId,
        p_packet_digest: packetDigest,
      }),
    recordVerification: async ({ publicationId, packetDigest, contentHash, evaluatorVersion }) => {
      await rpc(context.supabaseAdmin, 'record_engine_ruleset_hash_verification', {
        p_publication_id: publicationId,
        p_packet_digest: packetDigest,
        p_content_hash: contentHash,
        p_evaluator_version: evaluatorVersion,
      });
    },
  };
  return handleVerifyEngineRulesetRequest(request, dependencies);
}));
