import {
  ToolDetailSchema,
  ToolSearchRequestSchema,
  ToolSearchResultSchema,
  type ToolDetail,
  type ToolSearchResult,
} from '../../../packages/domain/src/index';
import { supabase } from './client';
import { z } from 'zod';

const DetailRequestSchema = z.object({
  versionId: z.string().uuid(),
  // An owner context: the server binds it to the signed-in owner and to this exact version.
  userToolId: z.string().uuid().nullable().default(null),
}).strict();

/**
 * Search the tool catalogue for exact versions. The request is validated and normalized before any network call,
 * and the answer is parsed against a strict identity-and-lifecycle shape: a response that carries a capability, a
 * claim, a source or any other field, or more rows than were asked for, is refused whole.
 */
export async function searchToolCatalogue(request: unknown): Promise<ToolSearchResult> {
  const parsed = ToolSearchRequestSchema.parse(request);
  if (!supabase) throw new Error('Tool search is unavailable until the client is configured');
  const { data, error } = await supabase.rpc('tool_catalogue_search', { p_query: parsed.query, p_limit: parsed.limit });
  if (error) throw error;
  const result = ToolSearchResultSchema.parse(data);
  if (result.results.length > parsed.limit) throw new Error('Tool search returned more than was requested');
  return result;
}

/**
 * Read the consumer detail of one exact tool version. The answer is parsed against the strict detail contract and
 * must be for the version asked for, and carry the owner's record only when an owner context was asked for. Nothing
 * is logged here.
 */
export async function getToolCatalogueDetail(request: unknown): Promise<ToolDetail> {
  const { versionId, userToolId } = DetailRequestSchema.parse(request);
  if (!supabase) throw new Error('Tool details are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('tool_catalogue_detail', { p_version_id: versionId, p_user_tool_id: userToolId });
  if (error) throw error;
  const detail = ToolDetailSchema.parse(data);
  if (detail.identity.versionId !== versionId) throw new Error('detail-mismatch');
  if ((userToolId === null) !== (detail.owner === null)) throw new Error('detail-mismatch');
  if (detail.owner !== null && detail.owner.userToolId !== userToolId) throw new Error('detail-mismatch');
  return detail;
}
