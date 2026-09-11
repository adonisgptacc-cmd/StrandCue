# Chemical Services and Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an owner-private Chemical Services vertical slice that records Keratin, Nanoplasty, exact region/segment zones, immutable corrections, presence observations, and optional reported service heat without inference.

**Architecture:** Add a sibling history domain beside Passport: strict shared Zod contracts feed narrow idempotent Supabase RPCs that append revision-scoped facts under forced RLS. Focused React Native service modules consume validated responses, retain owner-keyed retry drafts, and mount as a new Services destination without expanding Passport responsibilities.

**Tech Stack:** TypeScript, Zod, Vitest, React Native/Expo Router, Supabase PostgreSQL 17, PGlite database tests.

**Spec:** `docs/superpowers/specs/2026-09-11-chemical-services-design.md`

## Global Constraints

- Use Node 24, matching `.nvmrc`, and keep existing pinned dependency versions and `package-lock.json` unchanged unless a demonstrated need is approved.
- Follow red-green-refactor: every behaviour starts with a focused failing test and finishes with the narrowest passing implementation.
- Domain/service coverage must remain at least 80%; P1-AC-08 and P1-AC-09 need current end-to-end evidence before being marked complete.
- Keep all inputs strict and immutable. Reject unknown keys, invalid enum values, duplicate zone pairs, non-finite numbers, negative heat values, future dates, and over-limit UTF-16 strings.
- Derive ownership only from the authenticated request. Never accept `user_id` from a mobile payload.
- Enable and force RLS on every new table. Authenticated consumers receive owner-scoped reads only and no direct history writes.
- Corrections append complete replacement revisions. They never update/delete earlier revisions, zones, or heat facts.
- Presence is a separate observation, never a mutable occurrence field.
- Nanoplasty never implies a chemical system, temperature, passes, duration, risk, suitability, or recommendation.
- Preserve the unrelated untracked root `AGENTS.md`; do not stage or edit it.

---

### Task 1: Strict Chemical Service domain contracts

**Files:**
- Create: `packages/domain/src/services.ts`
- Modify: `packages/domain/src/index.ts:1-3`
- Test: `tests/domain/services.test.ts`

**Interfaces:**
- Consumes: `EffectiveDateSchema` and `EffectiveDate` from `packages/domain/src/dates.ts`.
- Produces: `ServiceTypeSchema`, `ServiceRegionSchema`, `ServiceSegmentSchema`, `ServiceZoneSchema`, `ServiceHeatSchema`, `ServiceFactsSchema`, `ServiceObservationSchema`, `CreateServiceCommandSchema`, `CorrectServiceCommandSchema`, `ObserveServiceCommandSchema`, plus their inferred output types.

- [ ] **Step 1: Write failing service contract tests**

Create table-driven tests proving strict parsing, unknown preservation, immutable canonical zone ordering, duplicate rejection, conditional `otherLabel`, optional heat, no Nanoplasty inference, finite/non-negative numeric validation, date validation, and UTF-16 text limits. Include these concrete acceptance fixtures:

```ts
const nanoplasty = {
  operationId: crypto.randomUUID(),
  serviceId: crypto.randomUUID(),
  facts: {
    serviceType: 'nanoplasty',
    occurredOn: { precision: 'month', value: '2026-07' },
    productOrSystem: null,
    notes: null,
    zones: [
      { region: 'front', segment: 'roots' },
      { region: 'crown', segment: 'ends' },
    ],
    heat: { method: 'unknown', temperatureC: null, passes: null, durationMinutes: null, source: 'user-estimated' },
  },
  initialObservation: {
    observedOn: { precision: 'day', value: '2026-09-11' },
    effectStatus: 'unknown',
  },
};

expect(CreateServiceCommandSchema.parse(nanoplasty).facts).not.toHaveProperty('chemicalSystem');
expect(CreateServiceCommandSchema.parse(nanoplasty).facts.zones).toEqual([
  { region: 'crown', segment: 'ends' },
  { region: 'front', segment: 'roots' },
]);
expect(() => CreateServiceCommandSchema.parse({
  ...nanoplasty,
  facts: { ...nanoplasty.facts, zones: [nanoplasty.facts.zones[0], nanoplasty.facts.zones[0]] },
})).toThrow();
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- tests/domain/services.test.ts`

Expected: FAIL because `packages/domain/src/services.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal strict schemas**

Use a strict facts object and an immutable zone transform:

```ts
export const ServiceZoneSchema = z.object({
  region: z.enum(['whole-head', 'front', 'crown', 'nape', 'other', 'unknown']),
  segment: z.enum(['entire-strand', 'roots', 'mid-lengths', 'ends', 'other', 'unknown']),
}).strict();

const ZonesSchema = z.array(ServiceZoneSchema).min(1).max(36).superRefine((zones, context) => {
  const keys = zones.map(({ region, segment }) => `${region}:${segment}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Service zones must be unique' });
}).transform((zones) => [...zones].sort((left, right) =>
  `${left.region}:${left.segment}`.localeCompare(`${right.region}:${right.segment}`),
));

export const ServiceFactsSchema = z.object({
  serviceType: ServiceTypeSchema,
  otherLabel: z.string().trim().min(1).max(100).nullable().optional(),
  occurredOn: EffectiveDateSchema,
  productOrSystem: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
  zones: ZonesSchema,
  heat: ServiceHeatSchema.nullable().optional(),
}).strict().superRefine(validateOtherLabel);
```

Define command schemas with UUID operation/service IDs, complete replacement facts for create/correct, `expectedRevision` for correction, a UUID `correctsId`, correction reason length 1–500, and a separate observation payload. Export all contracts from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run focused domain tests and typecheck**

Run: `npm test -- tests/domain/services.test.ts`

Expected: PASS with all service fixtures round-tripping and no input object mutation.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```powershell
git add -- packages/domain/src/services.ts packages/domain/src/index.ts tests/domain/services.test.ts
git commit -m "feat: define chemical service contracts"
```

---

### Task 2: Migration replay harness and RED database acceptance cases

**Files:**
- Modify: `tests/database/harness.ts:1-31`
- Create: `tests/database/services.test.ts`
- Create through Supabase CLI: the single file matching `supabase/migrations/*_chemical_services.sql`

**Interfaces:**
- Consumes: Task 1 command payloads and the existing `database()`, `asUser()`, and `complete()` helpers.
- Produces: migration-ordered `database()` replay plus test helpers `recordService`, `correctService`, `observeService`, `listServices`, and `getService` that call the public RPC signatures defined in Task 3.

- [ ] **Step 1: Make the harness replay every migration in lexical order**

Write the failing harness test first in `tests/database/migration.test.ts` asserting that all `.sql` files under `supabase/migrations` replay. Replace the single hard-coded `readFile` with:

```ts
const migrationDirectory = 'supabase/migrations';
const migrations = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
for (const migration of migrations) {
  await db.exec(await readFile(join(migrationDirectory, migration), 'utf8'));
}
```

Import `readdir` from `node:fs/promises` and `join` from `node:path`.

- [ ] **Step 2: Run the migration test and establish the harness GREEN state**

Run: `npm test -- tests/database/migration.test.ts`

Expected: PASS against the existing foundation migration before the new migration exists.

- [ ] **Step 3: Write failing P1-AC-08 and P1-AC-09 database tests**

Create tests that call the future public RPCs and assert:

```ts
await recordService(db, keratinCommand);
await recordService(db, nanoplastyCommand);
const services = await listServices(db);
expect(services).toHaveLength(2);
expect(services.map((item) => item.facts.serviceType)).toEqual(['nanoplasty', 'keratin']);
expect(services[0].facts).not.toHaveProperty('chemicalSystem');
expect(services[0].facts.heat).toMatchObject({ method: 'unknown', temperatureC: null, passes: null });

const detail = await getService(db, nanoplastyCommand.serviceId, true);
expect(detail.revisions[0].facts.zones).toEqual([
  { region: 'crown', segment: 'ends' },
  { region: 'front', segment: 'roots' },
]);
```

Also assert that a correction creates revision 2 with new zone rows while revision 1 and its zones remain queryable, and an observation changes only derived current presence.

- [ ] **Step 4: Write failing retry, concurrency, and adversarial authorization tests**

Cover all of these cases explicitly:

```ts
await expect(recordService(db, command)).resolves.toEqual(await recordService(db, command));
await expect(recordService(db, { ...command, facts: changedFacts })).rejects.toThrow(/operation-conflict/);
await expect(correctService(db, { ...correction, expectedRevision: 0 })).rejects.toThrow(/revision-conflict/);
await asUser(db, USER_B);
expect(await getService(db, command.serviceId, true)).toBeNull();
```

Test anonymous, unverified, inactive, User B, direct authenticated INSERT/UPDATE/DELETE, owner reassignment, cross-owner service/revision/zone/observation references under `postgres`, correction branching, foreign correction targets, stable service-ID replay with a new operation ID, malformed JSON, overflow numbers, future dates, and private-core calls without claims.

- [ ] **Step 5: Run the new database test and verify RED**

Run: `npm test -- tests/database/services.test.ts`

Expected: FAIL because the Chemical Services tables and RPCs do not exist.

- [ ] **Step 6: Generate the empty migration through the installed CLI**

Run: `npx supabase --version`

Expected: a CLI version is printed.

Run: `npx supabase migration new chemical_services`

Expected: one timestamped `*_chemical_services.sql` file is created. Use the generated filename in every later command and commit; do not invent a timestamp.

- [ ] **Step 7: Commit the RED database specification and harness update**

```powershell
git add -- tests/database/harness.ts tests/database/migration.test.ts tests/database/services.test.ts supabase/migrations/*_chemical_services.sql
git commit -m "test: specify chemical service history"
```

---

### Task 3: Owner-safe transactional Chemical Service persistence

**Files:**
- Modify: the single file matching `supabase/migrations/*_chemical_services.sql`, generated in Task 2
- Test: `tests/database/services.test.ts`
- Test: `tests/database/migration.test.ts`
- Test: `tests/database/supabase-api.test.ts`

**Interfaces:**
- Consumes: Task 1 JSON shapes and Task 2 RPC test helpers.
- Produces: `public.record_service(uuid, uuid, jsonb, jsonb)`, `public.correct_service(uuid, uuid, integer, uuid, text, jsonb)`, `public.observe_service(uuid, uuid, jsonb, text)`, `public.list_services(date)`, and `public.get_service(uuid, boolean)`.

- [ ] **Step 1: Add tables, composite keys, grants, and forced RLS**

Implement the migration with this ownership skeleton and equivalent explicit constraints for every child:

```sql
create table public.chemical_services (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  unique (id,user_id)
);
create table public.service_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  service_id uuid not null,
  sequence integer not null check (sequence > 0),
  base_revision integer not null check (base_revision >= 0 and sequence = base_revision + 1),
  kind text not null check (kind in ('baseline','correction')),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  effective_start date,
  effective_end date,
  recorded_at timestamptz not null default now(),
  corrects_id uuid,
  correction_reason text,
  unique (id,user_id,service_id),
  unique (service_id,sequence),
  unique (corrects_id),
  foreign key (service_id,user_id) references public.chemical_services(id,user_id) on delete cascade,
  foreign key (corrects_id,user_id,service_id) references public.service_revisions(id,user_id,service_id)
);
```

The `service_revisions.facts` JSON is the canonical occurrence core (`serviceType`, conditional `otherLabel`, `occurredOn`, optional `productOrSystem`, and optional `notes`) and deliberately excludes zones and heat. `service_zones` and `heat_events` are the only persisted source of truth for those revision-scoped facts; read functions recompose the Task 1 `ServiceFacts` response.

Add revision-scoped `service_zones(service_revision_id, service_id, user_id, region, segment)`, revision-scoped `heat_events(service_revision_id, service_id, user_id, method, temperature_c, passes, duration_minutes, source)`, stable-service-scoped `service_observations(id, service_id, user_id, effective_date, effective_start, effective_end, effect_status, source, recorded_at)`, and private `service_operations(user_id, operation_id, payload, result, recorded_at)`. Give every revision child a composite foreign key to `(service_revision_id,user_id,service_id)`, and every observation a composite foreign key to `(service_id,user_id)`. Include unique/index keys for owner list/history access. Enable and force RLS on all six tables; consumer policies are active-owner SELECT only. Revoke all consumer writes and grant `strandcue_mutator` only SELECT/INSERT plus `chemical_services.revision` UPDATE.

- [ ] **Step 2: Add authoritative validation and canonical serialization helpers**

Create fixed-search-path private validators for service facts, zones, heat, observations, dates, and UTF-16 lengths. Return canonical JSON using the exact camelCase Task 1 field names. Validate keys with set equality so extra JSON properties fail. Canonically sort zone pairs before hashing/persistence.

```sql
if p_facts - array['serviceType','otherLabel','occurredOn','productOrSystem','notes','zones','heat'] <> '{}'::jsonb then
  raise exception 'invalid-service' using errcode='22023';
end if;
if p_facts->>'serviceType' not in ('permanent-colour','demi-permanent','semi-permanent','highlights','balayage','bleach-or-lightener','colour-remover','keratin','brazilian-smoothing','nanoplasty','relaxer','texturiser','perm','chemical-straightening','other') then
  raise exception 'invalid-service' using errcode='22023';
end if;
```

- [ ] **Step 3: Implement idempotent record/correct/observe private cores**

Each core must require `request_uid()`, lock the active profile, compare the canonical payload against `service_operations`, and perform all inserts atomically. Record must insert the client UUID and reject an existing service ID unless the stored logical create is the same. Correct must lock the service, compare `expectedRevision`, enforce a linear correction chain, insert complete replacement facts/zones/heat, and increment only `chemical_services.revision`. Observe must append without changing service facts or revision.

```sql
select * into profile from public.profiles where user_id=uid for update;
if not found or profile.account_status <> 'active' then
  raise exception 'account-not-active' using errcode='42501';
end if;
select * into previous from strandcue_private.service_operations
where user_id=uid and operation_id=p_operation_id;
if found then
  if previous.payload <> canonical_payload then raise exception 'operation-conflict' using errcode='23505'; end if;
  return previous.result;
end if;
```

- [ ] **Step 4: Implement owner-scoped list/detail reads and public wrappers**

`list_services(p_as_of)` returns at most 100 owner rows in deterministic descending effective-date/recorded-time order and uses the final correction replacement. `get_service` returns `null` for missing and foreign IDs, active facts, current observation, revision history, revision-scoped zones/heat, and optionally the superseded audit. Public wrappers use `SECURITY INVOKER`; private cores use `SECURITY DEFINER`, fixed empty search paths, independent auth checks, and ownership by `strandcue_mutator`.

```sql
create function public.get_service(p_service_id uuid,p_include_audit boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  return strandcue_private.get_service(p_service_id,p_include_audit);
end $$;
```

Revoke function execution from `PUBLIC`, `anon`, and `authenticated`, then grant only public wrappers plus the exact required private bridge functions to `authenticated`.

- [ ] **Step 5: Run database tests until GREEN**

Run: `npm test -- tests/database/services.test.ts tests/database/migration.test.ts`

Expected: PASS for P1-AC-08/09, atomicity, history retention, idempotency, stale revisions, and adversarial ownership.

- [ ] **Step 6: Validate on the real local Supabase surface**

Run: `npx supabase start`

Expected: local services start, or record a Docker/environment blocker without weakening the PGlite tests.

Run: `npx supabase db reset --local`

Expected: every migration replays from empty state.

Run: `npm test -- tests/database/supabase-api.test.ts`

Expected: authenticated RPCs succeed; anonymous/foreign/direct PostgREST writes fail without existence leakage.

- [ ] **Step 7: Run database advisors using the installed CLI's discovered syntax**

Run: `npx supabase db --help`

Then use the listed local advisor command. Expected: no unresolved security or performance finding for the new functions, RLS policies, or owner/time indexes. Record the exact command and output in the verification note in Task 6.

- [ ] **Step 8: Commit transactional persistence**

```powershell
git add -- supabase/migrations/*_chemical_services.sql tests/database/services.test.ts tests/database/migration.test.ts tests/database/supabase-api.test.ts
git commit -m "feat: persist chemical service history"
```

---

### Task 4: Validated mobile API and immutable editor state

**Files:**
- Create: `apps/mobile/src/services-api.ts`
- Create: `apps/mobile/src/service-form.ts`
- Test: `tests/mobile/services.test.ts`

**Interfaces:**
- Consumes: Task 1 command schemas/types and Task 3 public RPCs.
- Produces: `loadServices`, `loadService`, `recordService`, `correctService`, `observeService`, `addZone`, `removeZone`, `replaceZone`, `buildCreateServiceCommand`, and `buildCorrectionCommand`.

- [ ] **Step 1: Write failing API parsing and immutable form-helper tests**

Test malformed RPC responses, explicit unknown values, service list/detail parsing, deterministic zone helpers, complete correction replacement, stable IDs, and nonmutation:

```ts
const original = [{ region: 'front', segment: 'roots' }] as const;
const updated = addZone(original, { region: 'crown', segment: 'ends' });
expect(updated).toEqual([
  { region: 'crown', segment: 'ends' },
  { region: 'front', segment: 'roots' },
]);
expect(original).toEqual([{ region: 'front', segment: 'roots' }]);
expect(() => addZone(updated, { region: 'front', segment: 'roots' })).toThrow(/already added/i);
```

Mock `supabase.rpc` and assert no command contains `user_id`, Nanoplasty commands contain no inferred values, and server data must pass a strict response schema.

- [ ] **Step 2: Run the mobile service test and verify RED**

Run: `npm test -- tests/mobile/services.test.ts`

Expected: FAIL because the API and form modules do not exist.

- [ ] **Step 3: Implement strict response schemas and RPC functions**

Parse every response rather than casting it:

```ts
export async function recordService(command: CreateServiceCommand): Promise<ServiceDetail> {
  const parsed = CreateServiceCommandSchema.parse(command);
  const { data, error } = await supabase!.rpc('record_service', {
    p_operation_id: parsed.operationId,
    p_service_id: parsed.serviceId,
    p_facts: parsed.facts,
    p_initial_observation: parsed.initialObservation ?? null,
  });
  if (error) throw error;
  return ServiceDetailSchema.parse(data);
}
```

Implement `list_services`, `get_service`, `correct_service`, and `observe_service` counterparts with the exact Task 3 parameter names.

- [ ] **Step 4: Implement immutable form helpers and command builders**

Each helper returns a new array/object. `buildCreateServiceCommand` receives injected operation/service IDs so UI retry logic can generate them once and reuse them. `buildCorrectionCommand` requires the current expected revision and uses complete replacement facts.

```ts
export const addZone = (zones: readonly ServiceZone[], zone: ServiceZone): readonly ServiceZone[] =>
  ZonesSchema.parse([...zones, zone]);
```

- [ ] **Step 5: Run tests and typecheck until GREEN**

Run: `npm test -- tests/mobile/services.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the mobile boundary**

```powershell
git add -- apps/mobile/src/services-api.ts apps/mobile/src/service-form.ts tests/mobile/services.test.ts
git commit -m "feat: add chemical service mobile boundary"
```

---

### Task 5: Services list, detail, add, correction, and observation UI

**Files:**
- Create: `apps/mobile/src/services.tsx`
- Create: `apps/mobile/src/service-editor.tsx`
- Modify: `apps/mobile/src/records.tsx:1-90`
- Modify only if a reusable primitive is missing: `apps/mobile/src/ui.tsx`
- Test: `tests/mobile/services.test.ts`

**Interfaces:**
- Consumes: Task 4 API functions/helpers and existing `Button`, `Choice`, `Field`, `Page`, and `styles` primitives.
- Produces: `Services({ owner }: { owner: string })` and `ServiceEditor` components mounted from `Records` under a new `Services` tab.

- [ ] **Step 1: Add failing component-level contract tests**

Use the project's existing test environment to cover state/helpers that do not require a native renderer: empty/list/detail state selection, add versus correction labels, initial observation separation, owner-keyed draft names, retained input after conflict, and accessible control labels. Keep a UI smoke checklist for interactions not renderable in Vitest.

```ts
expect(serviceDraftKey(USER_A, serviceId)).toBe(`strandcue-service-draft-${USER_A}-${serviceId}`);
expect(serviceEditorCopy('correction')).toMatchObject({
  title: 'Correct this service entry',
  submit: 'Save correction',
});
expect(serviceEditorCopy('observation').title).toBe('Record whether the effect is still present');
```

- [ ] **Step 2: Run the focused mobile test and verify RED**

Run: `npm test -- tests/mobile/services.test.ts`

Expected: FAIL on the new UI state/copy contracts.

- [ ] **Step 3: Implement the focused Services coordinator**

`Services` owns loading/error/list/detail/editor/observation modes, ignores stale async results after owner changes, and displays explicit unknown labels. List cards show type, approximate date, zone pairs, and derived current presence. Detail exposes current facts and an audit toggle without rendering raw JSON.

```tsx
<Text style={styles.body}>{zone.region.replaceAll('-', ' ')} · {zone.segment.replaceAll('-', ' ')}</Text>
<Button title="Correct this service entry" secondary onPress={() => setMode({ kind: 'correction', detail })} />
<Button title="Record whether the effect is still present" secondary onPress={() => setMode({ kind: 'observation', detail })} />
```

- [ ] **Step 4: Implement add/correct/observe forms with safe retries**

Generate `operationId` and new `serviceId` once, save the validated command to `secureStorage` before RPC, lock edits while a command is pending, retry the identical command after uncertain failure, and remove the draft only after confirmed success. A revision conflict loads current detail and preserves the submitted complete facts for explicit review.

The form must show service type, `other` label when selected, approximate occurrence date, optional product/system, repeatable region+segment controls, optional reported heat fields, notes, and optional initial presence observation. Nanoplasty selection changes no other field.

- [ ] **Step 5: Mount Services without mixing its state into Passport**

Extend the tab union and buttons in `Records`:

```tsx
const [tab, setTab] = useState<'Passport'|'Services'|'History'|'Settings'>('Passport');
// ...
{tab === 'Services' && <Services owner={user.id} />}
```

On logout/account switch, remove service drafts for the current owner through a bounded draft-index helper; never enumerate or delete another owner's secure-storage keys.

- [ ] **Step 6: Run mobile tests, typecheck, and web export**

Run: `npm test -- tests/mobile/services.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run export:web --workspace @strandcue/mobile`

Expected: Expo web export completes with the Services route included.

- [ ] **Step 7: Commit the service experience**

```powershell
git add -- apps/mobile/src/services.tsx apps/mobile/src/service-editor.tsx apps/mobile/src/records.tsx apps/mobile/src/ui.tsx tests/mobile/services.test.ts
git commit -m "feat: add chemical service recording flow"
```

---

### Task 6: Acceptance evidence, security review, and full verification

**Files:**
- Create: `docs/verification/chemical-services-review.md`
- Modify: `docs/verification/phase-1-acceptance-status.md:8-9`
- Modify: `README.md:3-6`

**Interfaces:**
- Consumes: completed Tasks 1–5 and repository verification scripts.
- Produces: durable P1-AC-08/09 evidence, updated project status, and a clean verified branch ready for integration.

- [ ] **Step 1: Run the complete automated verification suite**

Run each command independently and record exact pass/fail counts:

```powershell
npm run typecheck
npm test
npm run test:coverage
npm run audit:control-plane
npm run export:web --workspace @strandcue/mobile
npm audit
```

Expected: all commands pass; domain/service coverage is at least 80%; `npm audit` has no unresolved high/critical production vulnerability.

- [ ] **Step 2: Perform the security checklist against the actual diff**

Inspect `git diff 34418b3...HEAD` and verify:

- no hardcoded secret or service-role key;
- no RPC accepts or trusts a submitted owner UUID;
- every new exposed table has enabled/forced RLS and explicit grants;
- consumer direct writes fail;
- all definer functions have fixed search paths, independent identity/account checks, narrow ownership, and revoked `PUBLIC` execute;
- cross-owner composite FKs cover services, revisions, corrections, zones, heat, and observations;
- errors/logs expose no usernames, notes, chemistry, SQL, or stack traces;
- no Nanoplasty/heat/chemistry inference or recommendation language exists.

Fix any critical/high finding with a new failing regression test before changing implementation.

- [ ] **Step 3: Run the focused P1-AC-08/09 UI smoke scenario**

Using synthetic data only:

1. Record Keratin with `front + roots`, unknown system, and unknown heat.
2. Record Nanoplasty with `front + roots` and `crown + ends`, still without inferred chemistry/temperature.
3. Verify both occurrences remain listed and the exact pairs survive detail/history.
4. Correct the Nanoplasty zones and confirm the old revision remains only in the private audit.
5. Add a presence observation and confirm the occurrence revision does not change.

Record platform, build type, screenshots or textual observations, and any unverified native/device surface. Do not mark a path complete without direct evidence.

- [ ] **Step 4: Write the verification report and update acceptance status**

Create `chemical-services-review.md` with scope, commands/results, RLS/adversarial findings, UI scenario evidence, limitations, and release blockers. Mark P1-AC-08 and P1-AC-09 `Complete` only if their full required path passed; otherwise mark them `Partial` and state the exact missing evidence. Update README's implemented-scope sentence without claiming Shelf, Tools, Activities, export/deletion, or beta readiness.

- [ ] **Step 5: Run final diff and repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
git diff --stat 34418b3...HEAD
```

Expected: no whitespace errors; only planned files plus the user's untouched untracked `AGENTS.md`; no generated export, local `.env`, secrets, or temporary artifacts staged.

- [ ] **Step 6: Commit verified acceptance evidence**

```powershell
git add -- docs/verification/chemical-services-review.md docs/verification/phase-1-acceptance-status.md README.md
git commit -m "docs: verify chemical service acceptance"
```

- [ ] **Step 7: Request final code review**

Review the complete change for correctness, security, missing tests, and scope drift. Address every critical/high issue with a regression test and rerun Step 1 before declaring completion.
