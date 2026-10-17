import { isAuthSessionMissingError } from '@supabase/supabase-js';

export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value)));
}
export const authNeedsLoading = (hasVerifiedUser: boolean) => !hasVerifiedUser;
export const resolvedRefreshUser = <T>(current: T | null, verified: T | null, requestFailed: boolean): T | null =>
  requestFailed && current ? current : verified;

// Task 12 (clear account-bound state): classification of a getUser refresh
// failure, grounded in the real supabase-js shapes
// (node_modules/@supabase/auth-js/src/lib/errors.ts and error-codes.ts).
// getUser RESOLVES with {data, error} for server answers — including
// AuthApiError results that carry an HTTP status and a server error code —
// and REJECTS for transport failures (TypeError from fetch, lock errors).
// A revoked/deleted/expired/invalid session MUST clear local state: the
// server no longer honors the session, so retaining the prior user would keep
// rendering another account's record (AU-003). Anything else is treated as
// transient-offline and retained under an explicit bound (below).
const revokedSessionCodes = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
  'user_banned',
  'bad_jwt',
]);
export function isSessionRevokedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: unknown; status?: unknown };
  if (typeof failure.code === 'string' && revokedSessionCodes.has(failure.code)) return true;
  if (typeof failure.status === 'number') {
    // Rate limiting and server errors are transient; 401/403/404 from the
    // user endpoint mean this session or user is no longer valid.
    if (failure.status === 429 || failure.status >= 500) return false;
    if (failure.status === 401 || failure.status === 403 || failure.status === 404) return true;
  }
  return false;
}
// Consecutive transient refresh failures retained before the device signs
// itself out. A success or a revoked-session clear resets the count.
export const maxOfflineRefreshAttempts = 3;
export function authUserFromResult<T>(result: { data: { user: T | null }; error: unknown }): T | null {
  // A device with no saved session has no user to verify; all other failures remain blocked.
  if (result.data.user === null && isAuthSessionMissingError(result.error)) return null;
  if (result.error) throw new Error('auth-user-unavailable');
  return result.data.user;
}
export async function resolveAuthRefresh<T extends { id: string }>(
  result: { data: { user: T | null }; error: unknown },
  transitionOwner: (owner: string | null, isCurrent: () => boolean) => Promise<void>,
  isCurrent: () => boolean,
): Promise<{ user: T | null; cleanupFailed: boolean } | null> {
  const user = authUserFromResult(result);
  if (!isCurrent()) return null;
  let cleanupFailed = false;
  try { await transitionOwner(user?.id ?? null, isCurrent); }
  catch { cleanupFailed = true; }
  return isCurrent() ? { user, cleanupFailed } : null;
}
export const reviewRebase = (latest: Record<string, unknown>, submitted: Record<string, unknown>) => ({...latest, ...submitted});
export function toggleSelection(selected: readonly string[], value: string): string[] {
  if (value === 'none' || value === 'unknown') return [value];
  const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected.filter(item => item !== 'none' && item !== 'unknown'), value];
  return next.length ? next : ['unknown'];
}

// Single source of truth for what counts as an approved recovery callback:
// exact scheme, exact host and exact path, with no credentials and no fragment.
// Legacy custom-scheme compatibility branch (`strandcue://auth/callback`): keep
// it inbound-only until the first release cut after the HTTPS recovery path
// passes its recorded device proof (operator checklist step 4 in
// `docs/runbooks/assetlinks.md`). Owner: the `Cutover owner` field in that
// runbook's Compatibility window section - a role that must name an accountable
// person before the branch is removed.
export const approvedAuthCallbackHost = 'strandcue.adonisgptacc.workers.dev';
export const approvedAuthCallbackPath = '/auth/callback';
export function isApprovedAuthCallback(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'strandcue:') return url.host === 'auth' && url.pathname === '/callback';
    return url.protocol === 'https:' && url.host === approvedAuthCallbackHost && url.pathname === approvedAuthCallbackPath;
  } catch { return false; }
}

export function parseRecoveryCallback(raw: string, pending: boolean): {code: string; flowId: string} | null {
  if (!pending || !isApprovedAuthCallback(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.searchParams.getAll('code').length !== 1
      || url.searchParams.getAll('sb_flow_id').length !== 1) return null;
    const code = url.searchParams.get('code');
    const flowId = url.searchParams.get('sb_flow_id');
    return code && code.length <= 2048 && flowId && /^[a-zA-Z0-9_-]{8,64}$/.test(flowId) ? {code, flowId} : null;
  } catch { return null; }
}

export const normalizeUsernameInput = (value: string): string => value.trim().toLowerCase();
export const normalizeUsernameSuffix = (value: string): string => value.trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16);

export type UsernameOptions = Readonly<{available: boolean; suggestions: string[]; rateLimited: boolean}>;
export function parseUsernameOptions(value: unknown): UsernameOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-username-options');
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some(key => !['available', 'suggestions', 'rateLimited'].includes(key))
    || typeof candidate.available !== 'boolean' || typeof candidate.rateLimited !== 'boolean'
    || !Array.isArray(candidate.suggestions)
    || candidate.suggestions.some(item => typeof item !== 'string' || !/^[a-z0-9_]{3,24}$/.test(item))) {
    throw new Error('invalid-username-options');
  }
  return { available: candidate.available, suggestions: [...candidate.suggestions] as string[], rateLimited: candidate.rateLimited };
}

export function recoveryFailureMessage(reason: 'invalid' | 'expired' | string): string {
  if (reason === 'invalid') return 'That recovery link cannot be used here. Request a fresh link on this device.';
  if (reason === 'expired') return 'That recovery link expired or could not be verified. Please request another.';
  return 'Recovery could not finish. Please request a fresh link.';
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
