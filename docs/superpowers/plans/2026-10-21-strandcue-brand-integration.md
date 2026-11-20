# StrandCue brand integration implementation plan

**Goal:** Apply the approved StrandCue identity consistently across mobile, website and store-ready assets.

**Spec:** `docs/superpowers/specs/2026-10-21-strandcue-brand-integration-design.md`

## Tasks

1. Preserve the approved master and generate deterministic icon, adaptive, monochrome, splash, website, favicon and social-preview assets.
2. Add Expo icon/splash/favicon configuration and render the mark in the shared mobile header.
3. Replace the shared mobile colour tokens with the approved balanced palette while preserving accessible contrast and sage semantic states.
4. Replace website palette and lockups, add brand metadata imagery, and keep the static security boundary unchanged.
5. Update asset/content/accessibility tests, run full mobile/website/export gates, inspect rendered assets and commit one reviewable brand integration.

## Boundaries

- Do not alter product behavior, hosted services, Cloudflare, Supabase, Android signing, package identity or publication state.
- Do not push, deploy or submit store artwork.
- Do not use the rejected generated transparent mark.
