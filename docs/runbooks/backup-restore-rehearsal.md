# Runbook: backup and restore rehearsal

Proves RPO ≤1 hour and RTO ≤4 hours against a staging target before any
production restore is ever needed. Credentials come from the environment
(`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`); never commit them.

## Prerequisites

- Paid Supabase project with daily + hourly backups enabled (decision D1)
- `postgresql-client` (`pg_dump`, `pg_restore`, `psql`), `gzip`, Supabase CLI
- This repo at the release candidate commit; `bash -n scripts/backup-restore.sh` clean

## Steps

1. **Backup.** `scripts/backup-restore.sh backup --project-ref "$SUPABASE_PROJECT_REF" --access-token "$SUPABASE_ACCESS_TOKEN"`. Note start time, output file and checksum line.
2. **Verify.** `scripts/backup-restore.sh verify --backup-file <file>`. Checksum must pass; restore-to-temp must report PASSED.
3. **Restore.** `scripts/backup-restore.sh restore --backup-file <file> --project-ref <STAGING_REF> --access-token <TOKEN>`. Restore to staging, never over production in rehearsal.
4. **Reapply tombstones.** `scripts/backup-restore.sh reapply-tombstones --project-ref <STAGING_REF> ...`. A restore can resurrect purged profiles; this deletes them again. Do not reopen service before this reports complete.
5. **Re-validate RLS.** `scripts/backup-restore.sh validate-rls --project-ref <STAGING_REF> ...`. Must report 0 unprotected tables out of the 13 core tables. Do not reopen service on failure.
6. **Verdict.** `scripts/backup-restore.sh rehearse ...` prints RTO and RPO with SLA verdicts (RTO ≤14400s, RPO ≤3600s). A breach fails the run.

## Recording evidence

Attach to the gate review: the full rehearse log (timestamps visible), the
backup checksum file, and the commit hash rehearsed against. Quarterly
repetition is required; file each run under `docs/verification/`.
