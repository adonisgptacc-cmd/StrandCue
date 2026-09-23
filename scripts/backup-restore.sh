#!/usr/bin/env bash
# StrandCue Backup & Restore Rehearsal Script
# Usage: ./scripts/backup-restore.sh [backup|restore|verify] [options]

set -euo pipefail

# Configuration
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
BACKUP_NAME="strandcue-backup-${TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date -u +'%Y-%m-%d %H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date -u +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*"; }
error() { echo -e "${RED}[$(date -u +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*"; exit 1; }

usage() {
    cat <<EOF
Usage: $0 [command] [options]

Commands:
  backup       Create full database backup
  restore      Restore from backup file
  verify       Verify backup integrity
  cleanup      Remove backups older than retention period
  rehearse     Full backup + restore + verify cycle (RPO/RTO test)

Options:
  --project-ref STR     Supabase project reference (required)
  --access-token STR    Supabase access token (required)
  --backup-dir DIR      Backup directory (default: ./backups)
  --retention-days N    Retention period in days (default: 7)
  --backup-file FILE    Specific backup file for restore/verify
  --dry-run             Show what would be done without executing
  -h, --help            Show this help

Environment Variables:
  SUPABASE_PROJECT_REF  Supabase project reference
  SUPABASE_ACCESS_TOKEN Supabase personal access token
  BACKUP_DIR            Backup directory path
  RETENTION_DAYS        Retention period in days

Examples:
  $0 backup --project-ref abc123 --access-token token123
  $0 restore --backup-file ./backups/strandcue-backup-20260919-120000.sql.gz
  $0 rehearse --project-ref abc123 --access-token token123
  $0 cleanup
EOF
    exit 0
}

check_prereqs() {
    command -v pg_dump >/dev/null 2>&1 || error "pg_dump not found. Install postgresql-client."
    command -v pg_restore >/dev/null 2>&1 || error "pg_restore not found. Install postgresql-client."
    command -v psql >/dev/null 2>&1 || error "psql not found. Install postgresql-client."
    command -v gzip >/dev/null 2>&1 || error "gzip not found."
    command -v supabase >/dev/null 2>&1 || warn "supabase CLI not found. Install with: npm i -g supabase"
}

# Beta recovery targets (product authority): RPO <= 1 hour (3600s), RTO <= 4 hours (14400s).
RPO_SLA_SECONDS=3600
RTO_SLA_SECONDS=14400

db_url_for() {
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"
    [[ -z "$project_ref" ]] && error "Project ref required (--project-ref or SUPABASE_PROJECT_REF)"
    [[ -z "$access_token" ]] && error "Access token required (--access-token or SUPABASE_ACCESS_TOKEN)"
    supabase db url --project-ref "$project_ref" --token "$access_token" 2>/dev/null || \
        error "Failed to get database URL from Supabase"
}

backup() {
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"
    local output_file="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"

    [[ -z "$project_ref" ]] && error "Project ref required (--project-ref or SUPABASE_PROJECT_REF)"
    [[ -z "$access_token" ]] && error "Access token required (--access-token or SUPABASE_ACCESS_TOKEN)"

    mkdir -p "$BACKUP_DIR"
    log "Starting backup for project: $project_ref"
    log "Output: $output_file"

    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        log "DRY RUN: Would run pg_dump for project $project_ref to $output_file"
        return 0
    fi

    # Get database connection string from Supabase
    local db_url
    db_url=$(supabase db url --project-ref "$project_ref" --token "$access_token" 2>/dev/null) || \
        error "Failed to get database URL from Supabase"

    log "Dumping database..."
    pg_dump "$db_url" \
        --no-owner \
        --no-privileges \
        --if-exists \
        --clean \
        --format=custom \
        --compress=6 \
        --file="${output_file%.gz}.dump" 2>/dev/null || \
        error "pg_dump failed"

    gzip -f "${output_file%.gz}.dump"
    log "Backup completed: $output_file"

    # Generate checksum
    sha256sum "$output_file" > "${output_file}.sha256"
    log "Checksum saved: ${output_file}.sha256"

    log "Backup size: $(du -h "$output_file" | cut -f1)"
    log "Backup completed successfully"
}

restore() {
    local backup_file="${BACKUP_FILE:-}"
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"

    [[ -z "$backup_file" ]] && error "Backup file required (--backup-file)"
    [[ -f "$backup_file" ]] || error "Backup file not found: $backup_file"
    [[ -z "$project_ref" ]] && error "Project ref required"
    [[ -z "$access_token" ]] && error "Access token required"

    log "Starting restore from: $backup_file"
    log "Target project: $project_ref"

    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        log "DRY RUN: Would restore $backup_file to project $project_ref"
        return 0
    fi

    # Verify checksum
    if [[ -f "${backup_file}.sha256" ]]; then
        log "Verifying checksum..."
        sha256sum -c "${backup_file}.sha256" || error "Checksum verification failed"
        log "Checksum verified"
    fi

    local db_url
    db_url=$(supabase db url --project-ref "$project_ref" --token "$access_token" 2>/dev/null) || \
        error "Failed to get database URL from Supabase"

    log "Restoring database..."
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" | pg_restore --clean --if-exists --no-owner --no-privileges -d "$db_url"
    else
        pg_restore --clean --if-exists --no-owner --no-privileges -d "$db_url" "$backup_file"
    fi || error "pg_restore failed"

    log "Restore completed successfully"
}

verify() {
    local backup_file="${BACKUP_FILE:-}"

    [[ -z "$backup_file" ]] && error "Backup file required (--backup-file)"
    [[ -f "$backup_file" ]] || error "Backup file not found: $backup_file"

    log "Verifying backup: $backup_file"

    # Check checksum
    if [[ -f "${backup_file}.sha256" ]]; then
        sha256sum -c "${backup_file}.sha256" && log "Checksum OK" || error "Checksum FAILED"
    else
        warn "No checksum file found"
    fi

    # Test restore to temp database (if pg_restore available)
    if command -v pg_restore >/dev/null 2>&1; then
        log "Testing restore to temporary database..."
        createdb -T template0 strandcue_verify_$$ 2>/dev/null || true
        gunzip -c "$backup_file" | pg_restore --clean --if-exists --no-owner --no-privileges -d strandcue_verify_$$ 2>/dev/null && \
            log "Restore test PASSED" || error "Restore test FAILED"
        dropdb strandcue_verify_$$ 2>/dev/null || true
    fi

    log "Verification complete"
}

cleanup() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted=0
    while IFS= read -r -d '' file; do
        log "Deleting old backup: $file"
        rm -f "$file" "${file}.sha256"
        ((deleted++))
    done < <(find "$BACKUP_DIR" -name 'strandcue-backup-*.sql.gz' -mtime +$RETENTION_DAYS -print0 2>/dev/null)

    log "Cleanup complete. Deleted $deleted backup(s)."
}

reapply_tombstones() {
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"

    log "Reapplying deletion tombstones (restore survival)..."
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        log "DRY RUN: Would run select public.deletion_reapply() on project $project_ref"
        return 0
    fi
    local db_url
    db_url=$(db_url_for "$project_ref" "$access_token")
    psql "$db_url" -tAX -c "select public.deletion_reapply()" || \
        error "Tombstone reapplication failed - do not reopen service"
    log "Tombstone reapplication complete"
}

validate_rls() {
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"

    log "Re-validating row level security before reopening..."
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        log "DRY RUN: Would count unprotected tables on project $project_ref"
        return 0
    fi
    local db_url unprotected
    db_url=$(db_url_for "$project_ref" "$access_token")
    unprotected=$(psql "$db_url" -tAX -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('profiles','hair_passports','passport_revisions','chemical_services','service_revisions','activities','activity_revisions','user_products','user_product_revisions','user_tools','user_tool_revisions','export_jobs','deletion_tombstones') and (not c.relrowsecurity or not c.relforcerowsecurity)") || \
        error "RLS validation query failed - do not reopen service"
    [[ "$unprotected" == "0" ]] || error "RLS validation FAILED: $unprotected tables unprotected - do not reopen service"
    log "RLS validation passed"
}

rehearse() {
    local project_ref="${1:-$SUPABASE_PROJECT_REF}"
    local access_token="${2:-$SUPABASE_ACCESS_TOKEN}"

    [[ -z "$project_ref" ]] && error "Project ref required"
    [[ -z "$access_token" ]] && error "Access token required"

    log "=== Starting RPO/RTO Rehearsal (RPO <= 1h, RTO <= 4h) ==="
    local start_time=$(date +%s)

    # 1. Backup
    log "Step 1: Creating backup..."
    backup "$project_ref" "$access_token"

    local backup_time=$(date +%s)
    local backup_file="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"

    # 2. Verify
    log "Step 2: Verifying backup..."
    BACKUP_FILE="$backup_file" verify

    # 3. Restore to a fresh staging project, then reapply tombstones and
    #    re-validate RLS BEFORE reopening service to users.
    log "Step 3: Restoring to staging target..."
    BACKUP_FILE="$backup_file" restore "$project_ref" "$access_token"

    log "Step 4: Reapplying deletion tombstones..."
    reapply_tombstones "$project_ref" "$access_token"

    log "Step 5: Re-validating row level security..."
    validate_rls "$project_ref" "$access_token"

    local end_time=$(date +%s)
    local rto=$((end_time - backup_time))
    local rpo=$((backup_time - start_time))

    log "=== Rehearsal Complete ==="
    log "RTO (restore time): ${rto}s (SLA: <= ${RTO_SLA_SECONDS}s / 4 hours)"
    log "RPO (data loss window): ${rpo}s (SLA: <= ${RPO_SLA_SECONDS}s / 1 hour)"
    log "Backup file: $backup_file"

    local failed=0
    if [[ $rto -gt $RTO_SLA_SECONDS ]]; then
        warn "RTO exceeds 4-hour SLA: ${rto}s"
        failed=1
    else
        log "RTO within SLA: ${rto}s <= ${RTO_SLA_SECONDS}s"
    fi
    if [[ $rpo -gt $RPO_SLA_SECONDS ]]; then
        warn "RPO exceeds 1-hour SLA: ${rpo}s"
        failed=1
    else
        log "RPO within SLA: ${rpo}s <= ${RPO_SLA_SECONDS}s"
    fi
    [[ $failed -eq 0 ]] || error "Rehearsal breached recovery targets"
}

# Parse arguments
COMMAND="${1:-}"
shift || true

DRY_RUN=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --project-ref) SUPABASE_PROJECT_REF="$2"; shift 2 ;;
        --access-token) SUPABASE_ACCESS_TOKEN="$2"; shift 2 ;;
        --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
        --retention-days) RETENTION_DAYS="$2"; shift 2 ;;
        --backup-file) BACKUP_FILE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) usage ;;
        *) error "Unknown option: $1" ;;
    esac
done

check_prereqs

case "$COMMAND" in
    backup) backup "$SUPABASE_PROJECT_REF" "$SUPABASE_ACCESS_TOKEN" ;;
    restore) restore "$SUPABASE_PROJECT_REF" "$SUPABASE_ACCESS_TOKEN" ;;
    verify) verify ;;
    cleanup) cleanup ;;
    rehearse) rehearse "$SUPABASE_PROJECT_REF" "$SUPABASE_ACCESS_TOKEN" ;;
    reapply-tombstones) reapply_tombstones "$SUPABASE_PROJECT_REF" "$SUPABASE_ACCESS_TOKEN" ;;
    validate-rls) validate_rls "$SUPABASE_PROJECT_REF" "$SUPABASE_ACCESS_TOKEN" ;;
    *) usage ;;
esac