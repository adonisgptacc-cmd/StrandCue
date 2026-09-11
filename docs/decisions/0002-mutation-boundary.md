# Decision 0002: Passport mutation boundary

Status: accepted for the foundation slice; validated against a fresh local Supabase Postgres 17/Auth/PostgREST stack on 11 September 2026.

## Context

Hair Passport history must be immutable, owner-scoped, retry-safe, and reconstructable by effective date. A mobile client can be stale, interrupted after a successful commit, or hostile. Client-supplied ownership, sequence numbers, projections, and provenance therefore cannot be trusted.

## Decision

The mobile application can read owner-visible rows and call three public RPCs. It cannot write the underlying tables.

- `complete_account(p_username, p_eligible)` derives the user UUID from `auth.uid()`, verifies the Auth email, normalises and claims a private username, and creates one stable Passport.
- `mutate_passport(p_operation_id, p_expected_revision, p_kind, p_effective_date, p_patch, p_corrects_id, p_correction_reason)` locks the owner and Passport, validates the exact payload, enforces optimistic concurrency and correction ownership, appends one revision, rebuilds the current projection, and stores the result under the operation ID.
- `get_passport(p_as_of)` returns the immutable revisions and a field-level projection for the requested date.

Public wrappers are security-invoker functions. Private security-definer functions are owned by a dedicated `NOLOGIN`, `NOBYPASSRLS` role with narrow grants and a fixed empty search path. A private security-invoker helper mirrors Supabase's documented `auth.uid()` lookup from signed request settings so the mutator needs no privileges on the managed `auth` schema. Account completion also requires an authenticated, non-anonymous token with matching subject and email claims; the project Auth configuration requires email confirmation before such a session is issued. Every private mutation function independently derives identity and checks active account state. RLS and composite owner foreign keys enforce ownership below the client layer.

Identical retries return the stored result. Reusing an operation ID with another payload returns `operation-conflict`. A stale expected revision returns `revision-conflict`; the client retains the attempted fields, loads the latest record, and requires review before creating a new operation ID.

Effective dates retain day, month, year, or unknown precision. Projection is field-based so a later-recorded February goal change does not overwrite an unrelated March budget change. Equal or overlapping applicability with distinct values remains explicitly ambiguous.

## Consequences

History rows and current projections are not directly writable by consumer roles. New private entities must follow the same owner-derived, append-only, idempotent transaction pattern. The embedded PostgreSQL tests exercise roles, RLS, functions, raw JSON, retries, corrections, and projection semantics. A fresh local Supabase test additionally exercises verified users, PostgREST grants, owner isolation, direct-write denial, and retry behaviour through the deployed API. Hosted-environment validation and backup restore remain release gates.
