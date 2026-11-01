# Item 7B weather and travel context implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, consent-gated coarse-city weather context and temporary travel location controls without changing routine decisions or the permanent Hair Passport.

**Architecture:** Extend the existing owner consent registry; add one authenticated Supabase Edge Function that validates consent and calls an Open-Meteo provider adapter; normalize and validate all provider data in `packages/domain`; store selected city and trip dates in owner-keyed SecureStore; show weather in Settings and on Today as informational context. No location, provider response, or weather snapshot is persisted to hosted database tables.

**Tech Stack:** TypeScript, Zod, React Native/Expo, Supabase Edge Functions (Deno), PostgreSQL migrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-item-7b-weather-travel-design.md`

## Global constraints

- Do not request device GPS or use IP-derived location.
- Do not send a city to a provider unless current owner consent is granted and checked server-side.
- Provider calls use an authenticated Edge Function; no provider secret is placed in mobile code.
- Store only the selected provider location ID and display metadata in owner-keyed SecureStore; do not store coordinates, weather results, city or travel dates in hosted Supabase.
- Normal Today guidance, eligibility, safety blocks, product directions and Heat Coach must remain independent of weather.
- `WeatherContext` contains normalized, source-labelled readings and timestamps; raw provider payloads are never rendered or logged.
- Current weather is fresh for at most 60 minutes; missing, invalid, stale or unavailable data has no downstream effect.
- Free Open-Meteo endpoint is allowed only for local non-commercial development/test; production requires the paid customer endpoint and a separately recorded license review.
- No purchase, hosted Supabase operation, deployment, publishing, pushing, merging, or release approval is part of this work order.
- WX-06 Cue Check storage and weather-driven recommendation rules remain separate follow-on work.

## Review focus

- Owner consent revoked during an in-flight lookup: discard the response, clear cached state, and reject the next request.
- Owner switch while SecureStore or provider requests are pending: never show or restore the prior owner's location/weather.
- Same city name matches multiple regions/countries: require explicit selection from at most five candidates.
- Invalid, missing or implausible provider values/timestamps: return unavailable rather than fabricating readings.
- Travel starts/ends across a daylight-saving transition or device timezone change: evaluate the inclusive travel window in the selected destination's timezone.

---

### Task 1: Define weather domain contracts and extend consent purposes

**Files:**
- Create: `packages/domain/src/weather/weather-context.ts`
- Create: `tests/domain/weather-context.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/mobile/src/consent-api.ts`
- Modify: `tests/mobile/consent.test.ts`
- Create migration: `supabase/migrations/20261101130000_weather_context_consent.sql`
- Modify: `tests/database/consent.test.ts`

**Interfaces:**
- Export `WeatherPlace`, `WeatherContext`, `WeatherContextState`, `WeatherSearchCandidate`, and `WeatherTravelWindow` Zod schemas/types.
- Export `classifyWeatherFreshness(context, now)` with `current | stale | unavailable` outcomes. Use an injected `now`; do not read the clock in the domain function.
- Add `weather_context` to `ConsentPurposeSchema`, `ConsentListSchema`, `optionalPurposes`, and `consentPurposeLabel`.
- Extend the existing `consent_set` purpose allowlist without changing the existing consent operation receipt or owner isolation.

- [x] **Step 1: Write failing domain and consent tests.** Assert strict rejection of malformed readings, invalid units, timestamps out of order, overlong/empty city labels, malformed provider IDs, invalid travel windows, unknown consent purposes, and current/stale boundaries at 60 minutes.
- [x] **Step 2: Run focused tests and confirm failure.** Run `npm test -- tests/domain/weather-context.test.ts tests/mobile/consent.test.ts tests/database/consent.test.ts`. Expected: FAIL because the weather schemas and purpose do not exist.
- [x] **Step 3: Implement the schemas and consent-purpose migration.** Add a private owner-scoped rolling-hour counter and `public.reserve_weather_context_request()` RPC capped at 20 requests per owner per hour; store no city or provider data in the counter. Enforce active account, serialize reservations with a row lock, and cascade counters with account deletion.
- [x] **Step 4: Run focused tests.** Run the command in Step 2. Expected: PASS, including a database test proving consent can be granted/revoked and the per-owner quota cannot be bypassed by concurrent calls.
- [x] **Step 5: Commit.** `feat: add weather context contracts and consent gate`

### Task 2: Implement authenticated weather Edge Function and provider adapter

**Files:**
- Create: `supabase/functions/weather-context/handler.ts`
- Create: `supabase/functions/weather-context/index.ts`
- Create: `supabase/functions/weather-context/provider.ts`
- Create: `supabase/functions/weather-context/contracts.ts`
- Create: `supabase/functions/weather-context/runtime.ts`
- Create: `supabase/functions/weather-context/deno.json`
- Create: `tests/server/weather-context-edge.test.ts`
- Create: `tests/server/weather-context-provider.test.ts`

**Interfaces:**
- `WeatherEdgeDependencies` injects `authenticate(token)`, `listConsents(token)`, `reserveRequest(token)`, `provider`, and `now()` for deterministic tests.
- `handleWeatherContextRequest(request, dependencies)` accepts strict POST JSON commands: `{kind:'search', query, countryCode?}` or `{kind:'forecast', providerLocationId}`. Reject non-JSON, bodies over 2 KB, unknown keys, malformed auth and invalid inputs.
- `OpenMeteoWeatherProvider.searchCities(query, countryCode?)` returns no more than five normalized candidates; `getForecast(providerLocationId)` returns validated current conditions and the next 24 hours.
- The Edge Function verifies the bearer token, uses an owner-authorized `consent_list()` call, verifies latest `weather_context === true`, reserves quota, then contacts the provider. It never uses service-role access for consent.
- Use the non-commercial Open-Meteo endpoint only in local development/test with a local Supabase URL. Production must fail closed unless the customer endpoint, server-side API key and release license-review identifier are present; release must separately verify that identifier against the reviewed license record.

- [x] **Step 1: Write failing Edge Function tests.** Cover unauthenticated calls, consent off, quota exceeded, malformed/oversized bodies, extra fields, city query bounds and PII-like input rejection, explicit provider location ID selection, provider errors, and safe error envelopes. Verify no provider call happens before consent and quota checks.
- [x] **Step 2: Write failing provider tests.** Use mocked `fetch`; assert fixed Open-Meteo hosts, bounded query parameters, maximum five search matches, no identifiers/secrets, explicit units, response parsing, valid timestamp ordering, 24-hour bound, attribution metadata, commercial endpoint/key requirements, and malformed provider data returning unavailable.
- [x] **Step 3: Run focused tests to confirm failure.** Run `npm test -- tests/server/weather-context-edge.test.ts tests/server/weather-context-provider.test.ts`. Expected: FAIL because handler/provider modules are absent. RED confirmed.
- [x] **Step 4: Implement the provider and handler.** Reuse the established Edge Function authentication and owner-client pattern. Bound request/provider response bodies, reject redirects, and never log city, coordinates, bearer token, provider key, or raw response.
- [x] **Step 5: Run focused tests and local function checks.** `npm test -- tests/server/weather-context-edge.test.ts tests/server/weather-context-provider.test.ts` passed (14/14); `npm run typecheck:domain` and targeted ESLint passed. Docker-backed local `supabase functions serve weather-context` bundled under Edge Runtime 1.74.3 and returned `authentication-required` for an unauthenticated request; no provider call was made.
- [x] **Step 6: Commit.** `feat: add consent-gated weather provider endpoint` (`2ca3337`)

### Task 3: Add owner-scoped location storage and weather client controller

**Files:**
- Create: `apps/mobile/src/weather/weather-storage.ts`
- Create: `apps/mobile/src/weather/weather-api.ts`
- Create: `apps/mobile/src/weather/weather-controller.ts`
- Create: `tests/mobile/weather-storage.test.ts`
- Create: `tests/mobile/weather-api.test.ts`
- Create: `tests/mobile/weather-controller.test.ts`

**Interfaces:**
- `WeatherLocationSettings` stores selected home/travel provider IDs, labels, destination timezones, and travel dates; it stores no coordinates or forecast payload.
- `createWeatherStorage(storage, ownerKey)` provides serialized `loadVersioned`, `save`, `clearWeatherCache`, `clearOwner`, and revision checks following the existing reminder-store pattern.
- `searchWeatherCities(command)` and `fetchWeatherContext(command)` strictly parse Edge Function requests and responses; the client sends only selected city search text or the selected provider ID.
- `createWeatherController({api, storage, ownerKey, now})` coordinates consent, selection, fetch, stale state, revocation, travel-window selection, and owner epochs. Stale or late responses cannot replace newer owner/location state.

- [ ] **Step 1: Write failing storage, API, and controller tests.** Cover per-owner key isolation, serialized concurrent writes, quota-safe request serialization, strict API response validation, city selection, manual refresh, travel date boundaries in IANA timezones, 60-minute staleness, revocation during fetch, owner switch during fetch, and clear-on-sign-out.
- [ ] **Step 2: Run focused tests to confirm failure.** Run `npm test -- tests/mobile/weather-storage.test.ts tests/mobile/weather-api.test.ts tests/mobile/weather-controller.test.ts`. Expected: FAIL because modules are absent.
- [ ] **Step 3: Implement storage, typed API adapter, and controller.** Inject time and API/storage dependencies. Avoid global mutable state and ensure every write is serialized/revision checked.
- [ ] **Step 4: Run focused tests.** Run the command in Step 2. Expected: PASS with no storage operation able to restore a revoked or departed owner's weather data.
- [ ] **Step 5: Commit.** `feat: manage owner weather context safely`

### Task 4: Add weather and travel controls and informational Today card

**Files:**
- Create: `apps/mobile/src/weather/WeatherSettings.tsx`
- Create: `apps/mobile/src/weather/WeatherContextCard.tsx`
- Create: `apps/mobile/src/weather/weather-copy.ts`
- Modify: `apps/mobile/src/records.tsx`
- Create: `tests/mobile/weather-settings.test.tsx`
- Create: `tests/mobile/weather-context-card.test.tsx`
- Create: `tests/mobile/weather-flow.test.tsx`

**Interfaces:**
- Add a Weather section to Settings with a plainly worded consent explanation, city search/selection, home city, temporary destination, inclusive start/end dates, disable/revoke, and clear-location actions.
- Add a compact Weather Context card above `TodayGuidance`; load failure must not block or alter Today.
- Show selected place, current conditions and next 24-hour values, source attribution, observation/forecast/fetched time, stale/unavailable state, and the informational-use disclaimer.
- Consent off shows no search/fetch affordance that can cause a provider call. Search occurs only after the user enables consent and submits the city. Selecting a result does not silently request GPS.
- Keep all state controlled by the owner-keyed controller; changing owner unmounts the previous card/settings screen.

- [ ] **Step 1: Write failing component/flow tests.** Assert no provider call for city entry with consent off, distinct reviewable consent copy, explicit candidate selection, temporary destination activation/expiry, no Passport mutation, visible attribution/freshness/disclaimer, provider unavailable fallback, and Today remains usable.
- [ ] **Step 2: Run focused tests to confirm failure.** Run `npm test -- tests/mobile/weather-settings.test.tsx tests/mobile/weather-context-card.test.tsx tests/mobile/weather-flow.test.tsx`. Expected: FAIL because components are absent.
- [ ] **Step 3: Implement Settings and Today integration.** Use existing `Page`, `Field`, `Button`, and accessibility patterns. Keep any provider details out of routine steps and notification payloads.
- [ ] **Step 4: Run focused tests and mobile typecheck.** Run the command in Step 2 and `npm run typecheck --workspace @strandcue/mobile`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: show optional weather and travel context`

### Task 5: Verify local integration, privacy and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-01-item-7b-weather-travel-design.md` with implementation evidence and remaining release gates.
- Modify: `docs/superpowers/plans/2026-11-01-item-7b-weather-travel.md` with completed task states and command results.
- Modify: `docs/product/full-product-capability-matrix.md` and the canonical traceability matrix for WX-01 through WX-05 only; leave WX-06 Partial/Deferred.
- Create or modify: weather-specific `tests/database/*` only for migration, consent, quota and account deletion behavior.

- [ ] **Step 1: Run focused test suites.** Run weather domain, mobile, server and database tests.
- [ ] **Step 2: Run local Supabase verification.** Start/confirm the Docker-backed local Supabase stack; apply migrations only to local Supabase; run database tests and serve the Edge Function with mocked provider requests.
- [ ] **Step 3: Run static verification.** Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- [ ] **Step 4: Run full suite.** Run `npm test`; record exact counts and skipped suites. No live weather provider request is allowed in tests.
- [ ] **Step 5: Review changes and security boundaries.** Confirm only the worktree/local database changed; inspect all log paths, source attribution, consent-off behavior, production commercial-license configuration, owner switch cleanup, and unchanged Today decision output.
- [ ] **Step 6: Request independent code and security review.** Resolve all critical/high findings and rerun affected tests.
- [ ] **Step 7: Commit the completed isolated work.** Commit with conventional commit subjects. Report base SHA, branch, changed files, test results, unresolved WX-06/product-release gates. Do not merge to `main`; final integration waits for Codex review and owner approval.

## Follow-on work order (not included here)

WX-06 is a separate work order to decide exact Cue Check fields, independent
consent, immutable revision/correction/void behavior, provider data retention
rights, export/deletion, and evidence review before changing Cue Check schemas.
Any weather-driven ranking rule also requires its own evidence-backed rule
review and Human A/B approval before it can affect decisions.
