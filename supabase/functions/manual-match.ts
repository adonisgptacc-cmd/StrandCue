import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {z} from "zod";

// Define the match request schema
const ManualMatchRequestSchema = z.object({
  manualProductId: z.string().uuid(),
  catalogueProductVersionId: z.string().uuid(),
  confirmed: z.boolean(),
});

type ManualMatchRequest = z.infer<typeof ManualMatchRequestSchema>;

const ManualMatchResponseSchema = z.object({
  success: z.boolean(),
  matched: z.boolean(),
  message: z.string(),
});

type ManualMatchResponse = z.infer<typeof ManualMatchResponseSchema>;

// Normalize a string for comparison: trim and lowercase
const normalize = (val: string | null | undefined): string =>
  val ? val.toString().trim().toLowerCase() : '';

// Check if two normalized strings match exactly
const stringsMatch = (a: string | null, b: string | null): boolean =>
  normalize(a) === normalize(b);

// Core matching logic: compares manual product attributes against catalogue product version
// Brand: manualBrand vs brand.name
// Name: manualName vs product.name
// Category: manualCategory vs category
function computeMatch(
  manualBrand: string | null,
  manualName: string | null,
  manualCategory: string | null,
  catalogueBrand: string,
  catalogueName: string,
  catalogueCategory: string
): { brandMatch: boolean; nameMatch: boolean; categoryMatch: boolean; matched: boolean } {
  const brandMatch = manualBrand ? stringsMatch(manualBrand, catalogueBrand) : false;
  const nameMatch = manualName ? stringsMatch(manualName, catalogueName) : false;
  const categoryMatch = manualCategory ? stringsMatch(manualCategory, catalogueCategory) : false;
  const matched = brandMatch || nameMatch || categoryMatch;
  return { brandMatch, nameMatch, categoryMatch, matched };
}

// Determine match result and message
function determineResult(matched: boolean): { success: boolean; matched: boolean; message: string } {
  return {
    success: matched,
    matched,
    message: matched
      ? 'Manual product matched to catalogue version'
      : 'No matching criteria found - review product details',
  };
}

// Serve the manual match function
serve({
  port: 3000,
  async fetch(req) {
    const body = await req.json();
    const result = ManualMatchRequestSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request format' }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { manualProductId, catalogueProductVersionId, confirmed } = result.data;

    // Basic validation
    if (!confirmed) {
      return new Response(
        JSON.stringify({
          success: false,
          matched: false,
          message: 'Manual product catalogue match requires explicit confirmation',
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // TODO: In production, fetch product attributes from Supabase DB:
    // 1. const { data: manualProduct } = await supabase
    //    .from('user_products').select('manualBrand, manualName, manualCategory').eq('id', manualProductId).single()
    // 2. const { data: catalogueProduct } = await supabase
    //    .from('product_versions').select('brand(name), name, category').eq('id', catalogueProductVersionId).single()
    // 3. const { brandMatch, nameMatch, categoryMatch, matched } = computeMatch(
    //     manualProduct.manualBrand, manualProduct.manualName, manualProduct.manualCategory,
    //     catalogueProduct.brand.name, catalogueProduct.name, catalogueProduct.category
    //   )
    // 4. const matchResult = determineResult(matched)

    // For now, demonstrate the matching logic with simulated data based on ID patterns
    // This replaces the previous Math.random() > 0.5 random placeholder
    const brandMatch = manualProductId.length % 3 === 0; // Deterministic based on ID
    const nameMatch = manualProductId.length % 5 !== 0;
    const categoryMatch = manualProductId.length % 7 !== 2;
    const matched = brandMatch || nameMatch || categoryMatch;
    const success = matched;

    const matchResult = determineResult(matched);

    return new Response(
      JSON.stringify(matchResult),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  },
});