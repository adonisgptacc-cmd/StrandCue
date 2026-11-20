# Export Governance

## Schema Versioning

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-09-24 | Initial export (profile, passport, services, activities, shelf, tools) |
| 2 | 2026-10-15 | Added `schemaVersions` block, consentRecords, recommendationRuns, protocolExecutions |
| 8 | 2026-10-29 | Refined Heat Coach exports, execution events nested |

## Size Limits

- **Default maximum:** 50 MB JSON payload
- **Configurable via:** `strandcue_config` key `max_export_size_mb`
- **Error code:** `payload-too-large` (P0001)
- **CSV exports:** Not size-limited (streamed per-table)

## Explicitly Excluded Tables

| Table | Reason |
|-------|--------|
| `export_jobs` | Recursive reference; would include export metadata |
| `deletion_tombstones` | Active-account gate; only visible during deletion window |
| `strandcue_private.*` | Service internals; not user data |
| `guidance_source_revisions` | Internal engine state; not portable |

## Future: Selective Export API

When users hit size limits, a future `export_user_data_selective` RPC could accept:
- `include_families: string[]` (e.g., ['consentRecords', 'protocolExecutions'])
- `since: timestamptz` (incremental exports)
- `until: timestamptz`

## Reader Migration Guide

1. Check for `schemaVersions` object — if absent, treat as v1
2. Per-family version in `schemaVersions.families` enables field-level migration
3. New fields are additive; removed fields documented in changelog