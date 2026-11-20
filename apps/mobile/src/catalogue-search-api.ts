import {
  CatalogueSearchRequestSchema,
  CatalogueSearchResultSchema,
  type CatalogueSearchResult,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

/**
 * Search the trusted catalogue for exact product versions.
 *
 * The request is validated and normalized here, before any network call, and
 * the answer is parsed against a strict identity-and-lifecycle shape: a
 * response that carries claims, evidence, ingredients or any other field, or
 * more rows than were asked for, is refused whole. The server decides what a
 * caller may read; nothing is trusted from the client.
 */
export async function searchCatalogue(request: unknown): Promise<CatalogueSearchResult> {
  const parsed = CatalogueSearchRequestSchema.parse(request);
  if (!supabase) throw new Error('Catalogue search is unavailable until the client is configured');
  const { data, error } = await supabase.rpc('catalogue_search', { p_query: parsed.query, p_limit: parsed.limit });
  if (error) throw error;
  const result = CatalogueSearchResultSchema.parse(data);
  if (result.results.length > parsed.limit) throw new Error('Catalogue search returned more than was requested');
  return result;
}
