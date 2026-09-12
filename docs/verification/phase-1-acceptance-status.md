# Phase 1 acceptance status — 11 September 2026

Release status: **HOLD**. This matrix records evidence for the current account/Passport foundation. “Partial” means some contract-level behaviour is implemented and tested, but the complete acceptance case has not run through its required production-like surface.

| Case | Status | Current evidence / missing evidence |
|---|---|---|
| P1-AC-01 | Partial | Verified email, eligibility, idempotent profile completion are covered in PostgreSQL; resume flow needs device/API testing. |
| P1-AC-02 | Partial | Normalised unique username conflict is tested; true concurrent claims and user-facing component flow remain. |
| P1-AC-03 | Open | Email/username/password changes retaining history are not implemented end to end. |
| P1-AC-04 | Partial | Strict PKCE callback parsing and recovery UI exist; cold/warm native, email, expired/reused/verifier-missing tests remain. |
| P1-AC-05 | Partial | Passport unknown values round-trip; product, chemistry, and heat unknowns do not exist yet. |
| P1-AC-06 | Partial | Immutable Passport change/current/history is covered by domain and PostgreSQL tests; device flow remains. |
| P1-AC-07 | Partial | Backdating, approximate dates, corrections, correction chains, and ambiguity are covered in domain/database tests; component/device flow remains. |
| P1-AC-08 | Partial | Chemical service contracts, embedded database history, mobile RPC parsing, and Services UI contracts cover Keratin/Nanoplasty without inferred chemistry/heat; real Supabase API, native/UI smoke, and device accessibility evidence remain. |
| P1-AC-09 | Partial | Region+segment zone pairs survive domain and embedded database storage/history tests, including corrections and cross-owner FK checks; real Supabase API and native/UI smoke remain. |
| P1-AC-10 | Open | Product versions and successors are not implemented. |
| P1-AC-11 | Open | Private manual products and later matching are not implemented. |
| P1-AC-12 | Open | Field-scoped catalogue verification is not implemented. |
| P1-AC-13 | Open | Verification/admin metadata is not implemented. |
| P1-AC-14 | Open | Manual activity and heat details are not implemented. |
| P1-AC-15 | Partial | Passport operation retry semantics are tested; activity idempotency/duplicate review is not implemented. |
| P1-AC-16 | Partial | Database conflicts and mobile retain/review/rebase contracts are tested; two-device component/device test remains. |
| P1-AC-17 | Partial | Passport/profile owner isolation and direct-write denial are covered in embedded PostgreSQL and a fresh Auth/PostgREST run; every remaining private entity is absent. |
| P1-AC-18 | Partial | Owner-keyed native draft storage and local sign-out cleanup exist; account-switch/offline device tests remain. |
| P1-AC-19 | Open | Account export is not implemented. |
| P1-AC-20 | Open | Deletion orchestration, tombstone, restore enforcement, and old-JWT tests are not implemented. |
| P1-AC-21 | Partial | Adult eligibility is enforced in UI/RPC; optional analytics preference is not implemented. |
| P1-AC-22 | Partial | Passport model supports the listed hair patterns, grey/mixed, extensions, and budgets; full journey fixtures remain. |
| P1-AC-23 | Partial | Current source contains no recommendation or diagnostic engine; complete app/API scope inspection waits for remaining slices. |
| P1-AC-24 | Partial | Labels, roles, non-colour statuses, and 48px controls exist; screen-reader, large-text, poor-network, and pagination tests remain. |
| P1-AC-25 | Partial | Fresh Supabase Postgres 17 rebuild and Auth/PostgREST permission checks pass; backup restore is not proven. |

No case is marked complete until its full acceptance path has current evidence. Detailed foundation findings are in `docs/verification/foundation-review.md`; Chemical Services evidence is in `docs/verification/chemical-services-review.md`.
