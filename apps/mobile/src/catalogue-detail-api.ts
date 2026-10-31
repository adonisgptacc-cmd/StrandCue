import { z } from 'zod';

import { ProductDetailSchema, type ProductDetail } from '../../../packages/domain/src/index';
import { supabase } from './client';

const DetailRequestSchema = z.object({
  versionId: z.string().uuid(),
  // A Shelf context: the server binds it to the signed-in owner and to this exact version.
  userProductId: z.string().uuid().nullable().default(null),
}).strict();

/**
 * Read the consumer detail of one exact catalogue version.
 *
 * The request is validated before any network call and the answer is parsed
 * against the strict detail contract: a response with an unknown or internal
 * field, a missing or unreadable publication state, or content on a section
 * that is not published is refused whole, so a draft can never be painted. The
 * answer must also be for the version asked for, and carry the owner's record
 * only when a Shelf context was asked for. Nothing is logged here.
 */
export async function getCatalogueProductDetail(request: unknown): Promise<ProductDetail> {
  const { versionId, userProductId } = DetailRequestSchema.parse(request);
  if (!supabase) throw new Error('Product details are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('catalogue_product_detail', {
    p_version_id: versionId,
    p_user_product_id: userProductId,
  });
  if (error) throw error;
  const detail = ProductDetailSchema.parse(data);
  if (detail.identity.versionId !== versionId) throw new Error('detail-mismatch');
  if ((userProductId === null) !== (detail.owner === null)) throw new Error('detail-mismatch');
  if (detail.owner !== null && detail.owner.userProductId !== userProductId) throw new Error('detail-mismatch');
  return detail;
}
