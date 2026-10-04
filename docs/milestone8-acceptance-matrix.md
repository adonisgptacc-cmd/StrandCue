> **SUPERSEDED by `verification/phase-1-reconciliation.md` on 23 September 2026.** This draft contains stale completion claims and must not be used for release decisions.

# Milestone 8 — Acceptance Matrix Template

**Version:** 1.0
**Date:** 2026-09-19
**Status:** Draft
**Owner:** QA / Release Manager

---

## Acceptance Criteria Coverage

| P1-AC | Description | Milestone | Evidence Type | Status | Evidence Link |
|-------|-------------|-----------|---------------|--------|---------------|
| P1-AC-01 | Signup, confirmation, resume flow | 0 | Device video + logs | ⬜ Not Started | |
| P1-AC-02 | Username change with 30-day rule | 4 | Device video + logs | ✅ Complete | |
| P1-AC-03 | Email/password change (retain UUID) | 4 | Device video + logs | ✅ Complete | |
| P1-AC-04 | *[Not used]* | — | — | N/A | |
| P1-AC-05 | Shelf CRUD + provenance | 1 | Device video + logs | ✅ Complete | |
| P1-AC-06 | *[Not used]* | — | — | N/A | |
| P1-AC-07 | *[Not used]* | — | — | N/A | |
| P1-AC-08 | Smoothing services distinct | 1 | Device video + logs | ✅ Complete | |
| P1-AC-09 | Corrections/observations history | 1 | Device video + logs | ✅ Complete | |
| P1-AC-09 | *[Duplicate]* | — | — | N/A | |
| P1-AC-10 | Shelf provenance | 1 | Device video + logs | ✅ Complete | |
| P1-AC-11 | Matching workflow | 1 | Device video + logs | ✅ Complete | |
| P1-AC-12 | Reformulation no history rewrite | 1 | Device video + logs | ✅ Complete | |
| P1-AC-13 | Manual records private | 1 | Device video + logs | ✅ Complete | |
| P1-AC-14 | Activity logging | 3 | Device video + logs | ✅ Complete | |
| P1-AC-15 | Heat events | 3 | Device video + logs | ✅ Complete | |
| P1-AC-16 | Corrections/voids | 3 | Device video + logs | ✅ Complete | |
| P1-AC-17 | Idempotency + local drafts | 3 | Device video + logs | ✅ Complete | |
| P1-AC-18 | Settings journeys | 4 | Device video + logs | ✅ Complete | |
| P1-AC-19 | Export download | 5 | Device video + logs | ⬜ Not Started | |
| P1-AC-20 | Account deletion | 6 | Device video + logs | ⬜ Not Started | |
| P1-AC-21 | Analytics consent | 4 | Device video + logs | ✅ Complete | |
| P1-AC-21 | *[Duplicate]* | — | — | N/A | |
| P1-AC-22 | *[Not used]* | — | — | N/A | |
| P1-AC-23 | Activity correction/void | 3 | Device video + logs | ✅ Complete | |
| P1-AC-24 | *[Not used]* | — | — | N/A | |
| P1-AC-25 | Backup/restore + security suite | 8 | Script logs + report | ⬜ Not Started | |

---

## Evidence Requirements

| Evidence Type | Format | Storage | Retention |
|---------------|--------|---------|-----------|
| Device video | MP4 (1080p, no secrets) | Google Drive / S3 | 90 days |
| Screenshots | PNG (no PII) | GitHub PR / Drive | 90 days |
| ADB logs | Text (sanitized) | GitHub PR / CI artifacts | 90 days |
| Script logs | Text | CI artifacts | 90 days |
| Test reports | HTML/JUnit XML | CI artifacts | 90 days |
| Performance traces | Perfetto / JSON | CI artifacts | 90 days |

### Redaction Rules
- No email addresses, user IDs, tokens
- Blur/redact any PII in screenshots
- Sanitize logs: replace UUIDs with `REDACTED`
- No API keys, secrets, internal IPs

---

## Release Gate Checklist

### Pre-Release Validation (All Must Pass)

| Gate | Criteria | Status | Validator |
|------|----------|--------|-----------|
| **Typecheck** | `npm run typecheck:domain` = 0 errors | ⬜ | CI |
| **Unit Tests** | 163+ domain tests pass | ⬜ | CI |
| **Mobile Typecheck** | `npm run typecheck` = 0 errors (mobile) | ⬜ | CI |
| **Android Build** | Signed AAB generated for all variants | ⬜ | CI |
| **Internal Test** | Play Internal build distributed | ⬜ | DevOps |
| **Device Evidence** | All P1-AC cases have device evidence | ⬜ | QA |
| **Accessibility** | TalkBack, large text, 48dp pass | ⬜ | QA |
| **Performance** | Cold start < 2.5s, 60fps scroll | ⬜ | Dev |
| **Security Suite** | Supabase security suite passes | ⬜ | Security |
| **Backup/Restore** | RPO ≤1h, RTO ≤4h verified | ⬜ | DevOps |
| **No Critical/High** | No open Critical/High defects | ⬜ | QA/Dev |
| **Documentation** | Acceptance matrix 100% complete | ⬜ | QA |
| **Sign-off** | Explicit review approval | ⬜ | Release Manager |

---

## Release Decision Matrix

| Condition | Action |
|-----------|--------|
| All gates ✅ | **RELEASE** — Change status from HOLD to RELEASE |
| Any gate ❌ | **HOLD** — Document blockers, schedule remediation |
| Partial gates ⚠️ | **CONDITIONAL** — Document exceptions, risk acceptance required |

---

## Post-Release Monitoring (First 72h)

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Error rate | < 0.1% | PagerDuty |
| Crash rate | < 0.01% | PagerDuty |
| Deletion events | Any | Slack #alerts |
| Export failures | > 5% | Slack #alerts |
| Auth failures | > 1% | PagerDuty |
| Latency p95 | > 2s | Slack #alerts |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Dev Lead | | | |
| DevOps Lead | | | |
| Security Lead | | | |
| Release Manager | | | |
| Product Owner | | | |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-19 | | Initial draft |
