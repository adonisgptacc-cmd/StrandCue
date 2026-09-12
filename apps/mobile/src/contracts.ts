export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value)));
}
export const authNeedsLoading = (hasVerifiedUser: boolean) => !hasVerifiedUser;
export const resolvedRefreshUser = <T>(current: T | null, verified: T | null, requestFailed: boolean): T | null =>
  requestFailed && current ? current : verified;
export function authUserFromResult<T>(result: { data: { user: T | null }; error: unknown }): T | null {
  if (result.error) throw new Error('auth-user-unavailable');
  return result.data.user;
}
export const reviewRebase = (latest: Record<string, unknown>, submitted: Record<string, unknown>) => ({...latest, ...submitted});
export function toggleSelection(selected: readonly string[], value: string): string[] {
  if (value === 'none' || value === 'unknown') return [value];
  const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected.filter(item => item !== 'none' && item !== 'unknown'), value];
  return next.length ? next : ['unknown'];
}

export function parseRecoveryCallback(raw: string, pending: boolean): string | null {
  if (!pending) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'strandcue:' || url.host !== 'auth' || url.pathname !== '/callback'
      || url.username || url.password || url.hash || url.searchParams.getAll('code').length !== 1) return null;
    const code = url.searchParams.get('code');
    return code && code.length <= 2048 ? code : null;
  } catch { return null; }
}

export function publicConfig(url: string, key: string): {url: string; key: string} | null {
  try {
    const parsed = new URL(url);
    const local = ['127.0.0.1', 'localhost', '10.0.2.2'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
      || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    let publicKey = key.startsWith('sb_publishable_');
    if (key.startsWith('eyJ')) {
      const part = key.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
      publicKey = !!part && JSON.parse(atob(part)).role === 'anon';
    }
    return publicKey ? { url, key } : null;
  } catch { return null; }
}

export function saveErrorMessage(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('revision-conflict')) return 'This record changed on another device. Your input is still here. Reload the latest version and review your changes.';
  if (message.includes('username-unavailable')) return 'That username is unavailable. Please choose another.';
  if (message.includes('invalid-')) return 'Check your entries and dates, then try again.';
  if (message.includes('operation-conflict')) return 'This save no longer matches the original attempt. Reload and review before submitting again.';
  return 'We could not complete that request. Your unsaved input is still here. Check your connection and try again.';
}

