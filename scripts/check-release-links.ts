import { readFile } from 'node:fs/promises';
import { validateReleaseLinks } from './release-links.ts';

async function checkReleaseLinks(): Promise<void> {
  const fingerprint = process.env.STRANDCUE_ANDROID_CERT_SHA256 ?? '';
  const identityErrors = validateReleaseLinks([], { packageName: '', fingerprint });
  if (identityErrors[0]?.startsWith('Set the reviewed')) {
    throw new Error(identityErrors[0]);
  }
  const { expo } = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
  const filter = expo.android?.intentFilters?.find((candidate: {
    autoVerify?: boolean; data?: { scheme?: string; host?: string }[];
  }) => candidate.autoVerify && candidate.data?.some(data => data.scheme === 'https'));
  const host = filter?.data?.find((data: { scheme?: string }) => data.scheme === 'https')?.host;
  if (!host || !expo.android?.package) throw new Error('Verified HTTPS Android app-link configuration is required.');
  const response = await fetch(`https://${host}/.well-known/assetlinks.json`, {
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`App-link association endpoint returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('App-link association must be served as application/json.');
  }
  const source = await response.text();
  if (source.length > 65_536) throw new Error('App-link association exceeds the size limit.');
  const errors = validateReleaseLinks(JSON.parse(source), { packageName: expo.android.package, fingerprint });
  if (errors.length) throw new Error(errors.join(' '));
  console.log('ANDROID-LINK-ASSOCIATION-PASS (signed device recovery remains a separate gate)');
}

checkReleaseLinks().catch(error => {
  console.error(`ANDROID-LINK-ASSOCIATION-HOLD: ${error instanceof Error ? error.message : 'Check failed.'}`);
  process.exitCode = 1;
});
