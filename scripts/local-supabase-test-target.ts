/** Test-only transport policy. No hosted target is approved, including hosted
 * staging. Staging rehearsals must use a separately approved loopback tunnel.
 * Numeric loopback avoids DNS; redirect:error prevents a local gateway from
 * forwarding test credentials via an HTTP redirect. */
function localOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.port || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash) throw new Error('Expected a disposable loopback test target');
  return url.origin;
}

export function readLocalSupabaseTestConfig(env: Readonly<Record<string, string | undefined>>) {
  if (env.STRANDCUE_SUPABASE_API_TEST !== '1') return null;
  let url: string;
  try { url = localOrigin(env.STRANDCUE_SUPABASE_URL ?? ''); }
  catch { throw new Error('Expected a disposable loopback test target'); }
  const publishableKey = env.STRANDCUE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = env.STRANDCUE_SUPABASE_SECRET_KEY?.trim();
  if (!publishableKey || !secretKey) throw new Error('Local Supabase test keys are required');
  return { url, publishableKey, secretKey };
}

export function createLocalSupabaseFetch(apiUrl: string): typeof fetch {
  const origin = localOrigin(apiUrl);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== origin || url.username || url.password) throw new Error('Refusing off-target test request');
    return fetch(input, { ...init, redirect: 'error' });
  };
}
