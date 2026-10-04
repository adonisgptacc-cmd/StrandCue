import { runAccountDeletionWorker } from './account-deletion-worker.ts';

try {
  console.log(await runAccountDeletionWorker());
} catch {
  // Provider responses can include private context. Operators inspect the
  // fixed database receipt code and provider logs through authorized tools.
  console.error('Account deletion worker failed; inspect the retry receipt.');
  process.exitCode=1;
}
