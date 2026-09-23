# StrandCue — Phase 1 Build Specification

Version 2.0 • 9 September 2026 • Current implementation baseline

Amended 16 September 2026: Android is the sole Phase 1 native release target. iOS implementation and validation are deferred beyond Phase 1. Web remains a development smoke/export surface and is not the native beta target.

## 1. Authority and capability

This is the current Phase 1 implementation contract accompanying [Master PRD v2](../StrandCue-PRD-v2.md). It consolidates the supplied later instructions; it is not the separately referenced but unavailable original “Locked Phase 1” document. The user authorised the data-foundation-first revision. MUST indicates required behaviour; numerical policies labelled default are engineering proposals adopted for this handoff until changed explicitly.

Phase 1 lets a South African adult securely record hair characteristics, changes, chemical services, owned products/tools and factual manual activity, inspect history and manage their account. It does not decide what they should do. Scope is fixed to the foundation; no need to ask users to approve routine schema choices already defined here.

## 2. In scope, out of scope and screens

In scope: email/password accounts and mobile password recovery, username, age eligibility, Hair Passport, current/history views, chemical services/zones, My Shelf, My Tools, manual activity records, factual product provenance/status display, settings, export/deletion, basic verification administration through restricted operator tools, and direct database/API security tests.

Out of scope: AI/LLM advice, deterministic recommendation evaluator, treatment due counters, programme scheduling, Heat Coach, Today's Protocol, Routine Audit decisions, fit/confidence scores, automatic ingredient analysis, weather requests, scanning/import pipelines, public community reviews/aggregates, outcome ranking, product purchases, affiliates, subscriptions, advertising, photos and diagnosis. Supporting fields are allowed; no unused future endpoints or service deployments are required.

Screens: Welcome; signup/sign-in/verification; username/profile completion; recovery/reset; Hair Passport current/edit/history; Chemical Services list/detail/add/correct; My Shelf list/add/detail/archive; My Tools equivalents; History timeline/manual log; Settings/privacy/export/deletion. No advice-oriented home screen or “coming soon” recommendation controls required.

P1-UX-01: First-run onboarding is resumable. Users may skip optional fields and add unknown products. Explain missing mandatory form data without describing the user's hair as inadequate. No requirement for a verified catalogue item or desired style to complete onboarding.

P1-UX-02: Empty states invite recording information. Current versus historical views clearly identify dates, source and uncertainty. “Update because this changed” and “Correct a mistake” are separate operations with short explanations.

## 3. Market, eligibility and identity

P1-MKT-01: Require self-declaration of 18+ eligibility, not exact DOB. Under-18 declaration prevents onboarding; collect no child Passport. Country scope is ZA only, English initially, optional budget in ZAR and temperature in Celsius. Store explicit country/currency/unit values with server validation. Later expansion must use migrations/configuration, not hidden country assumptions in identity keys.

P1-AUTH-01: Supabase Auth UUID is permanent owner identity. A profile references it one-to-one. Use email/password for login and recovery. Username is a chosen private application handle in Phase 1, not a login or public directory entry. Never expose a username-to-email endpoint. No legal name, identity documents, phone, street address, precise GPS, race or ethnicity. Email remains private Auth information; no redundant email/password columns in application records.

P1-AUTH-02: Default username policy: 3–24 lowercase ASCII letters/digits/underscores, trimmed, unique case-insensitively, reserved system names rejected. Enforce uniqueness transactionally. Default change interval 30 days. Handle concurrent claims with a conflict response and preserved form state. Store past handle changes only in the minimal private account audit; do not make them public.

P1-AUTH-03: Email verification precedes private profile creation beyond minimum account setup. Sign-in after a partial signup resumes onboarding. Default password minimum 12 characters; allow paste/password managers, align with configured provider limits. No custom password storage/hashing. Generic authentication/recovery responses limit enumeration; configure rate limits and production email delivery.

P1-AUTH-04: Native recovery must work from email on a cold or running app. Use supported Supabase recovery and the selected SDK's documented exchange flow, with exact allowlisted redirects. Choose and test PKCE callback handling; never reset solely because a URL route says recovery. Protect verifier/session storage; reject unexpected routes/hosts; never log callback secrets. Expired, reused or verifier-missing links offer a fresh request path. Cross-device recovery is not guaranteed by a same-device PKCE flow.

Use a registered development scheme and owned HTTPS App Links for the external release. Actual domain, Android application ID and production email configuration are release decisions. Test recovery and the primary journeys in real Android development/release builds, not only Expo Go. Check official [Supabase password guidance](https://supabase.com/docs/guides/auth/passwords) and [mobile linking guidance](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) at implementation time; this document specifies required outcomes, not unverified SDK signatures.

P1-AUTH-05: Support logout, email/password changes and session expiry without losing history. UUID stays constant when credentials/username change. Store sessions in platform-secure storage through a tested adapter. Logout/account switch clears owner caches and prevents disclosure on shared devices. Sensitive export/deletion require recent authentication.

## 4. Hair Passport and historical truth

P1-HP-01: Capture structured natural pattern straight/wavy/curly/coily/mixed/unknown; strand diameter fine/medium/coarse/unknown; density low/medium/high/unknown; optional length and grey status; optional porosity low/medium/high/unknown; cosmetic scalp observations; concerns; goals; styling habits/frequency; humidity/environment sensitivities; and budget preferences. Never infer porosity or hair behaviour from ethnicity, appearance or a home test.

Budget preferences: use what I already own first, cheapest effective, best value, mid-range, premium, no preference. Optional maximum product budget is a non-negative ZAR amount with an explicit per-product interpretation. An omitted budget differs from zero; do not infer income. Recording a preference does not trigger a product recommendation.

Concerns may include dryness, frizz, tangling, breakage, split ends, stiffness, dullness, scalp dryness/oiliness, shedding/thinning and reported damage. These are self-reported cosmetic observations, not diagnoses. Store observation time and source. Goals and concerns allow multiple values; “none” and “unknown” are distinct. Optional wig/extensions context records type/material if known and whether an observation relates to natural hair or added hair; do not force natural-hair attributes onto a wig.

P1-HIST-01: Meaningful changes to Passport characteristics, condition, concerns, goals, habits, preferences and ownership availability create dated revisions. A current row with an increasing revision number is insufficient: retain previous values. Record both when something became true (`effective_at` or date/precision) and when it was entered (`recorded_at`). Source may be user-reported, user-estimated or verified catalogue reference. Recording “unknown” is distinct from not answering.

P1-HIST-02: Use a stable Passport ID and immutable revision records containing explicit changed fields and their new values, plus the submitted base revision. The initial revision supplies a complete validated baseline. A transactional mutation appends the change and rebuilds a current projection. Queries for a historical date compose applicable field changes by effective time, after resolving corrections. Whole form snapshots must not reassert unchanged fields. For example, a March budget change must not undo a February goal change entered later simply because March's original form contained the old goal. Optional full snapshots are rebuildable read caches, not the source of historical truth. Phase 1 does not accept future-dated factual changes. Ambiguous same-field effective ordering requires clarification; recorded time alone must not pretend to resolve real-world uncertainty.

P1-HIST-03: A correction creates a replacement revision/event with `corrects_id`, reason and recorded time. Hide superseded erroneous values from the default factual timeline while exposing a private correction audit. This is an explicit replacement of truth, not deletion of every trace. Corrections and real changes remain distinguishable. Account deletion/privacy requests override ordinary history retention.

P1-HIST-04: Support approximate dates with precision (exact day/month/year/unknown) rather than invented dates. For ambiguous effective ordering, show approximate order and request clarification if a “current” selection depends on it. No hidden tie-break should claim factual certainty. Use a database revision for concurrency; stale edits receive a conflict and user review, not silent last-write-wins.

## 5. Chemical/service history and zones

P1-CHEM-01: Each real service is its own historical event. Explicit service types: permanent colour, demi-permanent, semi-permanent, highlights, balayage, bleach/lightener, colour remover, keratin, Brazilian smoothing, Nanoplasty/Nanoplastia, relaxer, texturiser, perm, chemical straightening and other. Store reported date/precision, optional exact product/system, whether its effect is still present or unknown, and affected zones. Do not infer chemistry from service name.

P1-CHEM-02: Represent anatomical region and hair-length segment separately so “front roots” and “whole-head ends” are expressible. Region vocabulary: whole head/front/crown/nape/other/unknown. Segment: entire strand/roots/mid-lengths/ends/other/unknown. An event can affect multiple region/segment pairs. UI may show common shortcuts; preserve combinations and overlap without treating the head as chemically uniform. A new service does not erase a prior one in the same zone.

P1-CHEM-03: Nanoplasty/Nanoplastia is a first-class service type, with optional reported chemical system, salon heat temperature/passes and source. Unknown stays unknown; the treatment name must not automatically populate heat exposure or a chemical active. If reported heat exists it links as a distinct factual activity to the service. No suitability/heat-risk assessment is generated.

P1-CHEM-04: “Still present” changes are historical observations, not edits to the original occurrence. Haircuts/growth can be recorded as contextual changes without automatically deciding which treatments disappeared. Corrections fix inaccurate service entry through the correction mechanism. Exact service brand is optional and does not require a salon account or contact details.

## 6. My Shelf, My Tools and verification

P1-SHELF-01: Use brands → products → product_versions → user_products. Store brand separately, exact product/variant identity, market ZA or unknown, version/formulation information when known and ownership/availability. Categories cover shampoos/clarifiers, conditioners/masks, bond/protein treatments, leave-ins, protectants, styling products, oils/serums, scalp/colour products and other. Categories are reported classifications, not efficacy verification.

P1-SHELF-02: Users can add any private manual brand/name/category. A user_product may have a null catalogue-version reference and its own reported fields. Do not publish manual names or notes to a global catalogue. Matching later requires explicit confirmation and provenance; it cannot silently convert previous uncertain applications into verified facts.

P1-SHELF-03: Track ownership availability changes (available/out of stock/archived) over time. An archive removes the item from the active list, not prior records. Replacing a bottle of the same formula can preserve stable ownership identity. A different formula creates a new version/ownership link. Historical activity snapshots retain the originally known identity and optional later resolution separately.

P1-TOOL-01: Use tool_brands → tools → tool_versions → user_tools. Support dryers, hot-air brushes, air stylers, hood dryers, flat irons, hot combs, curling tools, steam straighteners, heated/unheated rollers, diffusers and other accessories. Store exact model if known, tool type, adjustable temperature yes/no/unknown, settings, reported temperature, contact/air heating capabilities, optional wattage, and provenance. No temperature inference from wattage. Diffusers/accessories do not automatically become independent heat sources.

P1-VER-01: Separate two dimensions: verification = unverified/pending_verification/partially_verified/verified/conflicting_information; lifecycle = active/retired. Reformulation is a version relationship/reason, not a replacement for verification state. This preserves all attachment concepts without one ambiguous combined status.

P1-VER-02: Verification is scoped to fields/claims. A verified name does not verify ingredients or safety claims. Record source URL/type, market, optional barcode/formula reference, first_seen_at, last_checked_at, verified_at/by, reviewed fields and limitations. Unknown ingredients/claims stay null with an explicit knowledge state; never treat null as “contains no protein/silicone.”

P1-VER-03: Version payloads referenced by historical activity are immutable. Corrections/reformulations publish a successor payload; prior references stay unchanged. Verification decisions append independently, so the current verification status can change without rewriting the original formula. Historical displays can show both status at recording and status now. Privileged review is server-side and audited; consumer updates cannot set verified status.

P1-VER-04: Provide a restricted administrative operation or reviewed seed workflow to attach sources and record verification decisions. No custom admin UI, scraper, barcode scanner or import system is required. Discovery pipelines are future work. External pages are untrusted data; no imported executable instructions or automatic trust. No fixed 20–30-product launch minimum; use a small reviewed/synthetic set to test versions and unknown entries.

## 7. Manual history and evidence readiness

P1-LOG-01: Let users record factual wash/styling/other activity with occurred time/precision, optional owned products/tools, hair context/zones and short optional notes. Do not require a generated protocol. Product/tool references preserve the version known at recording. Multiple real activities per day are permitted.

P1-LOG-02: Heat activity is a separate optional event linked to an activity/service, with reported method/tool, temperature, passes and duration when known. No boolean-only heat model and no calculated damage/heat score. Unknown is valid. Do not infer a shampoo from a styling event or an application from an ownership entry.

P1-LOG-03: Stable client operation IDs and server idempotency prevent retry duplicates. Two independently entered real-world events cannot be proven identical solely by timestamps; suggest possible duplicates for user review, never silently merge. Corrections/voids remain auditable; ordinary removal of an ownership entry cannot remove its historical use.

P1-EVD-01: The provenance schema supports claim/source records and the source kinds in master PRD section 5. No evidence ranking engine, published fit score, outcome feedback algorithm or scientifically_proven boolean. Show factual provenance/status only. Notes are not analysed for safety/medical facts; include a short reminder not to enter unnecessary identifying information.

## 8. Architecture and data contracts

Fixed stack: React Native + Expo + TypeScript + Expo Router; Supabase PostgreSQL/Auth; GitHub. No alternative builder database/auth. Pin compatible stable dependencies at implementation. Verify official docs then; no package version numbers are asserted here.

Suggested boundaries: `apps/mobile` for UI/session handling; `packages/domain` for shared typed validation; `supabase/migrations` for schema/RLS/functions; `supabase/functions` for privileged orchestration; `tests` for domain/integration/mobile cases; `docs` for the active specification and runbooks. Do not create a rules-engine package as Phase 1 scope.

Personal entities use UUID primary keys plus `user_id` ownership, timestamps and revisions. Shared catalogue tables have no consumer owner. Composite `(id,user_id)` foreign keys on private relationships prevent cross-owner references. Index owner/time and owner/parent queries. JSONB snapshots must use shared validated schemas, not arbitrary unrestricted blobs.

| Tables | Required meaning / constraints |
|---|---|
| profiles | `user_id` PK/FK to Auth UUID; unique normalised username; eligibility acceptance; onboarding/account status; revision; no email/password duplication |
| hair_passports, passport_revisions | One stable Passport per user; initial baseline plus immutable explicit field changes; effective/recorded time and precision; correction links; rebuildable current/as-of projections |
| chemical_services, service_revisions, service_zones | Stable service identity, immutable facts/corrections, region+segment pairs; all child ownership enforced |
| service_observations | Subsequent still-present/unknown observations without rewriting the service |
| brands, products, product_versions | Exact catalogue identities and immutable version payloads, successor links and market metadata |
| user_products, user_product_revisions | Private manual or catalogue-linked ownership identity; dated availability/match history |
| tool_brands, tools, tool_versions | Curated identities/capabilities and immutable versions |
| user_tools, user_tool_revisions | Private manual or matched tool records with dated changes |
| evidence_sources, product_claims, tool_claims, claim_sources | Source metadata and typed propositions with explicit scope; no automatic evidence score |
| product_verification_events, tool_verification_events | Reviewer, reviewed fields, status, reason and time; privileged append only |
| activities, activity_revisions | Manual factual sessions and corrections, owner and occurred date/precision |
| activity_products, activity_tools, heat_events | Immutable/revision-linked use details; both relationship ends belong to owner; no inferred exposures |
| account_audit, privacy_preferences | Minimal account/notice records; no raw hair notes in security audit |
| operation_keys | Unique owner/operation/key plus payload hash/result; event IDs remain unique beyond key expiry |
| private operational privacy_jobs/tombstones | Restricted export/delete orchestration; survives Auth deletion until cleanup obligations complete |

Use separate product/tool claim link tables or constrained equivalent so claims cannot refer to nonexistent targets. Do not rely on an unchecked polymorphic ID alone. Dates allow unknown/approximate values without invented exact timestamps. Current projections are generated transactionally and rebuildable from revisions. Historical links use RESTRICT or controlled retention semantics, not cascade deletion when a product is archived. Account purge is a separately authorised complete deletion workflow.

## 9. Services, state transitions and failure handling

Simple owner reads can use the Supabase Data API under RLS. History mutations use transactional functions/services to validate the owner, expected revision, effective date and correction semantics, append revision and update projection atomically. Derive owner from authenticated context; never trust a submitted owner UUID.

Logical operations (not claims about built-in endpoint names):

| Operation | Contract |
|---|---|
| account.complete / username.change | Validate verified session, eligibility and unique handle; resumable partial setup |
| passport.get / history / change / correct | Read current/as-of state; append real change or audited correction using expected revision |
| services.record / observe / correct / history | Create service and zones or subsequent observation; preserve earlier occurrence |
| shelf.add / change / match / archive / history | Private unknowns accepted; dated availability/matching; explicit identity continuity |
| tools.add / change / match / archive / history | Equivalent ownership/version rules |
| activity.record / correct / void / list | Idempotent factual logging, no recommendation side effects |
| catalogue.search / detail | Published factual identity/status subset only, ZA/unknown clearly identified |
| verification.record | Privileged field-scoped review decision with sources and audit |
| privacy.export / delete / status | Recent-auth request, durable job and owner-only result |

Success: `{data, meta:{requestId, nextCursor?}}`; failure: `{error:{code,message,retryable,fieldErrors?},meta:{requestId}}`. List default 25, max 100. Codes: validation, unauthenticated, not-found (including non-owned IDs), revision-conflict, username-taken, idempotency-mismatch, rate-limited, service-unavailable. Never disclose another user's existence, SQL or stack traces.

Same key/payload returns the stored result; same key/different payload conflicts. Permanent unique client record IDs prevent duplicate creates beyond operation-key retention (default 30 days). Network timeout after commit is resolved by retrying the same key. Stale edits show differences for review. Do not silently overwrite a newer device's changes.

Default Phase 1 connectivity: online writes; retain an encrypted/secure local form draft until confirmed saved, with “not saved” visibility. No complex offline multi-device sync required. Cache only minimal owner-scoped records, purge on logout, and clearly label offline cached data. Failed writes must never show success. A saved record must survive reinstall/sign-in; unsaved device drafts are not promised to survive device loss.

## 10. Security, privacy and medical boundary

P1-SEC-01: RLS on every exposed private table, appropriate grants, `auth.uid() = user_id` owner conditions on SELECT/DELETE, and both USING/WITH CHECK for UPDATE. Check child ownership as well as parent ID. Consumers cannot mutate catalogue, verification or operational jobs. Anonymous users cannot access personal data. Test direct API/database operations, not UI hiding.

Ownership is necessary but does not permit rewriting history. Deny direct consumer INSERT/UPDATE/DELETE on mutation-only revision/event/link tables and current projections; expose only owner-scoped reads plus the narrow transactional change/correct/void operations. Immutable catalogue version payloads also deny consumer writes. Simple editable account fields may use ordinary owner CRUD. Approved server operations must validate ownership and transition semantics even when privileged execution bypasses RLS. Test that an owner cannot bypass the audit by directly rewriting or removing their own revision. Account purge remains a separate privileged privacy operation.

P1-SEC-02: Server-controlled staff roles only; editable user metadata is not authority. No service-role/secret keys in the mobile bundle, GitHub or prompts. JWT verification, schema validation and explicit owner scoping apply to privileged functions. Prefer invoker functions; any necessary definer code requires narrow grants, fixed search path and ownership review, never a workaround for failed RLS. Views must preserve ownership or stay unexposed.

P1-SEC-03: TLS, platform-secure token storage, input length/type limits, escaped user content, dependency/secret checks and log redaction. No passwords, callback URLs, emails, usernames, hair narratives or exact service history in logs/analytics. Short notes default max 2,000 characters. No third-party advertising SDK. Separate development/staging/production; no real user data in fixtures.

P1-PRIV-01: The application stores protected personal data even without legal names. Before external beta, review POPIA obligations, notices, responsible contacts, processor arrangements, region/cross-border hosting and access/correction/deletion procedures. Intended cosmetic purpose is not a legal determination of compliance or medical-device status. No precise-location or photo permissions in Phase 1.

P1-PRIV-02: Export includes readable JSON/CSV of current/history records, manual items and relevant linked version/provenance information. No other users' records. Recent-auth export is private, download access expires after 24 hours, output removed within 7 days (defaults). Make errors/status visible; do not provide public storage URLs.

P1-PRIV-03: Deletion immediately marks account deleting and blocks data access through policies/services, revokes refresh sessions, purges personal records/exports, and deletes Auth identity after dependants. Existing access JWTs are not assumed instantly invalid. Restricted deletion jobs/tombstones survive Auth deletion without cascading away. Retain only the minimum protected mapping needed for retries/restores until obligations finish.

Default active-system purge target 7 days, maximum 30; backup expiry target maximum 35 days pending actual provider plan. Operational/security logs default 30 days without hair payloads. Personal history remains while the account is active unless a user exercises correction/deletion rights. Confirm actual provider retention before making promises. Restore procedures reapply deletion tombstones before reopening access.

P1-SAFE-01: Display a concise cosmetic-records boundary and support/help route. Do not diagnose, prescribe, claim to assess symptoms, or interpret notes automatically. Do not build a symptom triage engine as a foundation dependency. Any future clinical/escalation behaviour requires separate reviewed requirements. Privacy and account safety operations remain in Phase 1.

## 11. Quality and measurement

Proposed engineering targets: ordinary owner reads/writes p95 ≤2 seconds on stable representative South African mobile connectivity, measured with a declared mid-range Android device; cached shell ≤1 second after readiness; beta crash-free sessions ≥99.5%; no unresolved critical/high security/data-loss defects. Report network/provider and client timings separately. Load fixture: 500 ownership items, 2,000 activity/service records and 1,000 Passport revisions per user; pagination must remain usable.

Accessibility: scalable text, screen reader labels/focus, adequate contrast, no colour-only statuses, and touch targets at least 48 dp on Android. Use unambiguous dates, Celsius and ZAR. A colour-coded verification badge must have text. Unknown and approximate entries must be understandable without technical vocabulary.

CI requires type/lint/schema/content validation, fresh migration replay, domain/service coverage ≥80% and explicit tests for every ownership/history invariant. Use unit tests for validation/revision resolution; real Supabase integration tests for transactions/RLS; Android development/release-build E2E for primary flows and recovery. A percentage alone does not establish security.

Operational defaults: RPO ≤24 hours/RTO ≤8 hours for beta with a tested backup/restore plan. Choose an Android-only release matrix of supported Android versions and devices before testing; do not invent package/OS versions in this specification. Record deviations before release.

Metrics are foundation-specific: verified signup-to-Passport completion within 7 days; owners with one shelf/tool record; successful save rate; correction/conflict rates; recovery completion; export/deletion completion; W4 return to view or record data. Report denominators and mature cohorts. Proposed beta target ≥60% verified users completing a Passport within 7 days and ≥99.5% valid save success. No hair-improvement or recommendation-success claims.

Optional product analytics require a clear preference and allowlisted coarse events. Operational security/error monitoring uses minimal redacted counts. Never collect product names, concern lists, notes or chemistry as analytics properties. Failure/opt-out cannot block core records.

## 12. Acceptance tests

| ID | Scenario | Required outcome |
|---|---|---|
| P1-AC-01 | Signup, confirmation and interrupted profile completion | Resumes without duplicate identity; verified email/18+ requirements enforced |
| P1-AC-02 | Concurrent case-equivalent username claims | One succeeds, one clear conflict; UUID owns both users' separate records |
| P1-AC-03 | Email/username/password change | Same UUID and complete history retained |
| P1-AC-04 | Recovery cold/warm app, expired/reused/malicious/verifier-missing links | Valid flow changes password; invalid flows grant no access and allow retry; no secret logs |
| P1-AC-05 | Unknown porosity, product, chemistry and temperature | Unknown round-trips without invented defaults or onboarding block |
| P1-AC-06 | Real Passport goal/condition/budget change | New dated revision; previous state and current state independently retrievable |
| P1-AC-07 | Correction, backdated change and approximate date, including a February goal change entered after a March budget change | Corrected truth distinct from real change; unrelated March fields do not restore stale goals; later explicit same-field changes still win; ambiguity visible |
| P1-AC-08 | Keratin then Nanoplasty, different/overlapping zones | Both occurrences retained; exact chemistry/heat stays unknown unless reported |
| P1-AC-09 | Front roots versus crown ends | Both region and segment survive storage/history; no whole-head assumption |
| P1-AC-10 | Formula reformulated/old item archived | Old activity links and payload unchanged; successor independently represented |
| P1-AC-11 | Private unknown item matched later | Original identity/provenance retained; other users cannot see manual data; match requires confirmation |
| P1-AC-12 | Identity verified but ingredients unverified | No whole-record scientific/safety claim; field scope displayed accurately |
| P1-AC-13 | Consumer attempts to set verification or admin metadata | Denied through direct API as well as UI |
| P1-AC-14 | Record manual wash/tool/heat without protocol | Factual event stored; no due counter, heat score or recommendation generated |
| P1-AC-15 | Retry timeout-after-commit; independently entered similar event | Retry creates once; possible real duplicate not silently merged |
| P1-AC-16 | Two devices edit same revision | Conflict preserves newer state and unsaved input for review |
| P1-AC-17 | User A attacks User B records/cross-owner children, or directly rewrites/deletes their own immutable history/projection | Foreign access and audit bypass denied for every private table/function/projection, including correction links; approved owner correction service succeeds |
| P1-AC-18 | Logout/account switch/offline failure | No previous-owner data; failed write labelled unsaved; draft handling explicit |
| P1-AC-19 | Account export | Owner-only readable current/history data; access/object expires; no foreign records |
| P1-AC-20 | Deletion failure/retry/old JWT/backup restore | Immediate access block, resumable purge, retained minimal tombstone and restored deletion enforcement |
| P1-AC-21 | Under-18 or declined eligibility; denied optional analytics | Under-18 onboarding blocked; optional analytics decline does not block adult use |
| P1-AC-22 | Fine straight untreated, wavy bleached, curly highlighted, coily relaxed, grey/mixed, wigs/extensions, restricted/premium budgets | Same model handles records without persona-specific code or advice |
| P1-AC-23 | Build/navigation/API inspection | No deferred recommendation, protocol, heat, weather, commerce, community or diagnostic behaviour |
| P1-AC-24 | Screen reader/large text/poor network and pagination | Core entry/history/settings remain usable; status not colour-only |
| P1-AC-25 | Rebuild fresh DB and restore backup | Migrations reproduce constraints/RLS; restore meets agreed targets and preserves history |

Tests use synthetic identities and fixtures; do not copy founder data into public seeds. Test all CRUD directions directly with owner A, owner B, anonymous and staff roles. Include UPDATE owner reassignment, reference swapping, views and privileged functions. Mobile password recovery requires actual Android development/release builds and real test email delivery.

## 13. Delivery order, decisions and definition of done

1. Audit this specification against any actual repository; report contradictions before schema implementation.
2. Establish versioned repo/environment configuration and migration/testing foundation.
3. Implement ownership, history/version tables and adversarial RLS tests before connecting private UI.
4. Implement signup/recovery/username and Passport current/history flows.
5. Implement services/zones, Shelf/provenance and Tools with unknown handling.
6. Implement manual activity, corrections, settings, export/deletion and monitoring.
7. Validate the Android-only release matrix, accessibility, performance and restore flows; distribute the signed beta candidate through a Google Play internal test track and invite a small adult South African beta only after release gates.

Operational decisions before beta: owned recovery domain/email setup, supported Android versions/device matrix, Google Play internal-test access, actual provider region/backup retention, privacy/support ownership, verification operator and any accepted target exceptions. Exact manufacturer usage/safety rules are not Phase 1 blockers because Phase 1 provides no advice. Any factual catalogue content presented as verified still needs actual review.

Definition of done: all P1-AC-01–25 pass with evidence; no unresolved critical/high security or data-loss defects; history and version integrity demonstrated; recovery and privacy jobs work; current-state and as-of views tested; migrations and runbooks reproducible; product owner can complete the adult recording journey; and scope audit confirms no later-phase behaviour. Passing v1's protocol fixtures is neither required nor sufficient.

This is a document handoff, not a claim that the application exists or tests have run. Proceed to the bounded repository/specification audit before coding. Record approved changes to this file, the master PRD when relevant and affected acceptance tests together.
