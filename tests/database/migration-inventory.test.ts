import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const trustedMigrationNames = [
  '20260909172924_passport_foundation.sql',
  '20260912070752_chemical_services.sql',
  '20260924150000_activities_history.sql',
  '20260924160000_activity_rpc.sql',
  '20260924170000_shelf_catalogue.sql',
  '20260924180000_user_products.sql',
  '20260924190000_shelf_rpc.sql',
  '20260924200000_shelf_catalogue_mutator_read.sql',
  '20260924210000_tools_catalogue.sql',
  '20260924220000_user_tools.sql',
  '20260924230000_tools_rpc.sql',
  '20260924240000_list_pagination.sql',
  '20260924250000_export_jobs.sql',
  '20260924260000_export_rpc.sql',
  '20260924270000_deletion.sql',
  '20260924280000_deletion_rpc.sql',
  '20260924290000_username_change.sql',
  '20260924300000_function_grant_cleanup.sql',
  '20260924310000_list_core_grants.sql',
  '20260924320000_export_csv.sql',
  '20260924330000_consent.sql',
] as const;

const candidateMigrationNames = [
  '20260918154343_brands_products_product_versions.sql',
  '20260918154920_user_products_revisions.sql',
  '20260918155718_tool_brands_tools_user_tools.sql',
  '20260918160720_activities_heat_links.sql',
  '20260918162005_username-change-30day.sql',
  '20260918162839_email-password-changes.sql',
  '20260919064318_analytics-consent.sql',
  '20260919064840_cosmetic-boundary-support.sql',
  '20260919065826_account-session-info.sql',
  '20260919070841_recent-auth-foundation.sql',
  '20260919072155_export-jobs.sql',
  '20260919072557_export-json-generation.sql',
  '20260919073216_export-csv-generation.sql',
  '20260919073529_export-download-auth.sql',
  '20260919073818_export-retention-cleanup.sql',
  '20260919075003_account-deletion-tombstone.sql',
  '20260919075458_account-deletion-rpc.sql',
  '20260919081022_session-revocation-old-token-denial.sql',
  '20260919082240_tombstone-survival-restore.sql',
] as const;

const sqlFiles = async (directory: string) =>
  (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();

describe('migration promotion boundary', () => {
  it('executes only the reviewed, replayable migrations', async () => {
    await expect(sqlFiles('supabase/migrations')).resolves.toEqual([...trustedMigrationNames]);
  });

  it('keeps every unverified milestone migration in the candidate archive', async () => {
    await expect(sqlFiles('supabase/drafts/2026-09-unverified-milestones')).resolves.toEqual([...candidateMigrationNames]);
  });

  it('labels the candidate archive as non-executable and evidence-free', async () => {
    const readme = await readFile('supabase/drafts/2026-09-unverified-milestones/README.md', 'utf8');
    expect(readme).toContain('must not be applied');
    expect(readme).toContain('promotion requires a capability-specific migration test');
    expect(readme).toContain('does not constitute completion evidence');
  });
});
