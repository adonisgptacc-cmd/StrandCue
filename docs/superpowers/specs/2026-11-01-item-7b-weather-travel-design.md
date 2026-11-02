# Item 7B: weather and travel context

**Status:** design approved 2026-11-01 after builder check; location boundary
selected by the owner. Implementation is in `codex/item-7b-weather-travel`.

**Parent:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`,
WX-01 through WX-06; roadmap item 7.

**Baseline:** `codex/item-7b-weather-travel`, branched from local `main` at
`06762f6` after 7A integration.

## Intent

Give an owner optional, source-labelled weather context for a manually selected
coarse city or temporary travel destination, with clear consent, visible
freshness, and a useful base routine when weather is stale or unavailable.
Weather is contextual information; this slice does not make or change a hair
recommendation.

## Goals

- Let an owner save a home city and an optional temporary travel city without
  changing the permanent Hair Passport.
- Require a separate, revocable weather-provider consent before any city or
  approximate city-centre coordinate leaves StrandCue for a weather lookup.
- Offer the same weather context for a temporary destination only while its
  owner-entered travel window is active.
- Show the provider, requested city, observed/forecast time, last fetch time,
  and a current/stale/unavailable state.
- Show temperature, humidity, dew point, precipitation chance and wind only
  when returned with valid units and timestamps.
- Keep the normal routine usable when location, consent, network, provider,
  response validation, or freshness checks fail.
- Make weather-provider calls server-side; never ship provider credentials in
  the mobile application.
- Let the owner revoke consent, clear home/travel locations and clear cached
  weather data.
- Keep travel context separate from permanent profile values and from routine
  eligibility, safety restrictions, treatment directions, and Heat Coach.

## Non-goals

- Precise device GPS, background location collection, or IP-derived location.
- Changing a routine, product choice, safety block, or eligibility from weather.
- Automatically attaching weather to Cue Checks or other durable personal
  records in this first delivery. WX-06 remains a separately consented follow-on
  because Cue Check revisions are immutable and provider data reuse/retention
  needs its own contract and data-lifecycle review.
- Weather alerts for safety-critical decisions; always direct users to official
  meteorological services for those decisions.
- Hosted Supabase changes, provider account creation, purchase, key creation,
  deployment, publication, or release approval.

## Approaches

### A. Manually selected city, separate opt-in, server provider adapter

The owner enters a city and explicitly enables weather sharing. An authenticated
Edge Function resolves the city and requests weather from one provider using
only the city or approximate city-centre coordinates. The mobile client receives
validated, normalized weather data. Consent is revocable and stored in the
existing owner consent registry. City and travel settings remain in
owner-keyed SecureStore.

**Benefits:** fits canonical WX-01; makes the data flow and consent visible;
keeps provider keys and vendor response parsing off-device; supports clear
freshness and offline behavior.

**Trade-offs:** requires a local Edge Function and an active provider license
before commercial operation; live results are unavailable without configuration.

### B. Manual-only seasonal notes

The owner enters travel city and optional seasonal notes; no provider calls are
made.

**Benefits:** no external weather request or provider dependency.

**Trade-offs:** does not deliver current conditions or useful forecast
freshness, and falls short of the canonical weather-context goal.

### C. Direct mobile provider calls

The mobile app sends location directly to a weather provider.

**Benefits:** fewer server components for a prototype.

**Trade-offs:** exposes provider credentials or usage controls in the client,
creates a less auditable disclosure path, and complicates consistent consent,
rate limiting, and response validation.

**Selected:** Approach A, as chosen by the owner for manual coarse-city
selection plus a separate provider opt-in. This design uses an
`OpenMeteoWeatherProvider` behind the server adapter. The free Open-Meteo API
is restricted to non-commercial use; the commercial API requires a subscription
and attribution is required under CC BY 4.0. The provider adapter must be
disabled in a commercial release until a suitable license is configured and
recorded. Open-Meteo's official [terms](https://open-meteo.com/en/terms),
[pricing and commercial license](https://open-meteo.com/en/pricing), and
[geocoding API](https://open-meteo.com/en/docs/geocoding-api) support this
selection. No purchase is authorized by this work order.

## Current project fit

- The canonical specification defines WX-01 through WX-06 and says weather
  advice may change ranking only through approved rules; it cannot waive
  product directions or safety blocks.
- Mobile consent already flows through `setConsent` and the owner consent
  registry. Extend that purpose model rather than creating a parallel consent
  store.
- Mobile API calls already use authenticated `supabase.functions.invoke`;
  follow that pattern for the new weather endpoint.
- Client secure storage is already device-local and owner-scoped. Store city
  and travel selections there; clear them with the existing sign-out/owner
  switch lifecycle.
- Cue Check observations are server-validated, revisioned, and immutable. Do
  not add weather fields there in this delivery.

## Data flow and consent

1. The owner enters a city name and country/region in Settings > Weather. No
   device permission is requested. The city may be saved locally without
   weather consent; no geocoding or weather lookup occurs until the owner turns
   on the separate weather opt-in.
2. Consent copy explains that the selected city and approximate city-centre
   coordinates are sent through StrandCue's authenticated weather function to
   Open-Meteo; network services may observe IP addresses. No account identifier,
   hair profile, routine, product, photo, or free-text note is sent to the
   provider. The city lookup and forecast request occur only after consent.
3. Store consent using a dedicated `weather_context` purpose. The server
   endpoint rechecks current owner consent before every provider call; a stale
   client toggle alone is insufficient. Revocation disables calls and clears
   local cached data. The owner can also delete saved city/travel context.
4. Store home city, selected provider location ID, display label, travel
   destination and dates in owner-keyed SecureStore; do not store coordinates,
   city, forecast, or travel schedule in hosted Supabase for this slice. Resolve
   the provider location ID on the server and keep coordinates only in memory
   for the forecast request. On provider change, require the owner to select
   the saved city again.
5. An active travel destination temporarily selects the forecast city from
   its start date through its inclusive end date in that destination's
   timezone. Expiry returns to the home city without changing Passport data.
   Invalid or ambiguous city names are rejected and leave the previous
   selection intact.

## Weather data and behavior

- Normalize provider output to `WeatherContext`: coarse `placeLabel`, source
  identifier, `fetchedAt`, `observationAt` (when supplied), `forecastFor`,
  `freshUntil`, units, and optional typed readings. Do not pass raw provider
  payloads to screens or logs.
- Include current conditions and the next 24-hour forecast only. Do not infer
  missing readings or substitute climatology for current forecast data.
- Current context is fresh for at most 60 minutes; beyond that it is stale and
  cannot be used in any derived behavior. Provider-level cache must respect the
  applicable provider limits; the initial implementation should not persist
  provider responses beyond the current session.
- If no city is selected, consent is off, travel dates are invalid/expired,
  the provider is unconfigured, the network fails, the response is invalid,
  or freshness expires, show a specific neutral unavailable/stale state and
  retain the existing base routine without weather-derived changes.
- Show attribution and a concise forecast uncertainty/safety disclaimer in
  the Weather surface. Weather is informational only.
- Weather may affect a future advisory ranking only after a separate reviewed
  ruleset explicitly consumes typed weather facts. This delivery has no such
  rules and returns no weather-based recommendations.

## Privacy, security, and lifecycle

- The edge function authenticates the owner, checks `weather_context` consent,
  validates bounded city input and rate limits requests before calling the
  provider.
- For the consent check, the edge function uses the request owner's bearer
  token with the existing authenticated `consent_list()` RPC (publishable key
  plus owner authorization), not a service-role query or a client-supplied
  consent boolean. Extend the existing consent-purpose allowlist and schema
  for `weather_context`. The provider call is rejected unless the latest
  recorded owner consent is granted.
- City search is submitted only after consent is granted. Search returns at
  most five normalized city/region/country candidates with approximate
  coordinates hidden from the UI. The owner explicitly chooses one result;
  save only its provider location ID and display label. Reject empty,
  overlong, malformed and ambiguous selections. Never resolve by client IP.
- Provider credentials remain in server secrets. The provider receives only
  coarse city search and approximate coordinates, never owner identifiers or
  hair-related data.
- Avoid logging city inputs, coordinates, full request URLs, provider payloads,
  API credentials, or returned personal data. Use a fixed provider host and
  scrub URL host/path/query data in diagnostic output.
- Settings changes are serialized per owner; late results from a previous
  owner/city/consent revision cannot overwrite the current state.
- Sign-out or owner switch clears owner-keyed location and in-memory weather
  state. Revocation clears weather state immediately and the server rejects
  any subsequent fetch.
- Provider failure must not block normal app startup or routine access.
- Production configuration must use Open-Meteo's commercial customer endpoint
  and a server-held customer API key. The free endpoint may be enabled only in
  local development/test contexts. A production release checklist records
  owner verification of the active commercial subscription and attribution;
  an environment switch alone is not proof of a license.

## Acceptance criteria

- Saving city text with weather consent off causes zero geocoding and forecast
  requests. With consent on, search shows at most five normalized candidates;
  weather fetch requires an explicit owner selection.
- Enabling weather consent is explicit, recorded, revocable, and enforced
  server-side on every weather request.
- No GPS prompt, IP-based city lookup, client provider key, or unconsented
  provider request exists.
- A temporary trip uses its destination only within the entered local date
  window; expiry returns to the saved home city and leaves the Passport intact.
- Responses are schema-validated; malformed values, timestamps, coordinates,
  and units are discarded as unavailable.
- Source attribution, city label, timestamp, freshness and neutral failure
  states are visible and accessible.
- Stale/unavailable weather never changes routine steps, eligibility, safety,
  product directions, or Heat Coach state.
- Consent revocation, sign-out and owner switch clear location/weather state
  and prevent stale in-flight results from restoring it.
- Focused tests cover consent gate, request data minimization, response parsing,
  freshness, travel date/timezone boundaries, failure fallback, owner switch,
  revocation races, and server rate limits.
- Cue Check schema and persistence remain unchanged. WX-06 is explicitly tracked
  as a follow-on design gate rather than silently omitted.

## Implementation evidence (2026-11-02)

- Tasks 1–5 are implemented on the isolated `codex/item-7b-weather-travel`
  branch. Weather contracts, authenticated consent/quota-gated Edge requests,
  owner-keyed location settings, revocation/owner-switch handling and the
  informational Today card are covered by focused and full-suite tests.
- The Docker-backed local Supabase stack applied pending migrations through
  `20261101130000_weather_context_consent.sql`. The local Edge smoke returned
  `authentication-required` for an unauthenticated request before contacting a
  provider. Provider tests use mocked fetch; no live provider request occurred.
- Verification on 2026-11-02: `npm run typecheck`, `npm run lint`,
  `git diff --check`, and `npm test` passed. The full suite reported 259 passed
  files, 8 skipped; 5,085 passed tests and 47 skipped (5,132 total).
- Independent code and security reviews reported no actionable findings.
  Review was static; no device or screen-reader run was performed.
- Local-only scope: the feature worktree and local Supabase database were
  changed. No hosted database, deployment, provider account, key, or release was
  changed or configured.

## Open release gates

- A commercial release requires a commercial subscription, attribution, and
  operator-provided secret; none is purchased or configured by this work order.
- Obtain and record the provider's commercial subscription/license review,
  attribution approval, and operator-provided secret before any commercial
  deployment.
- Complete device and accessibility review, including screen-reader behavior.
- Keep hosted Supabase untouched; this feature is not available in a hosted
  release until separately authorized and configured.

## Follow-on

Design WX-06 separately: exact weather facts eligible for Cue Check capture,
independent consent, correction/void semantics, source retention rights,
deletion/export, and privacy review. Only then extend the immutable Cue Check
contract. Separately review any proposed weather-to-advice rules through normal
evidence and Human A/B approval; 7B itself supplies no such rule.
