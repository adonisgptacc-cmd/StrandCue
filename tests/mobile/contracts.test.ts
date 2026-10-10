import { AuthSessionMissingError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { changedFields, parseRecoveryCallback, publicConfig, saveErrorMessage, toggleSelection, reviewRebase, authNeedsLoading, resolvedRefreshUser, authUserFromResult, normalizeUsernameInput, normalizeUsernameSuffix, recoveryFailureMessage, parseUsernameOptions } from '../../apps/mobile/src/contracts';

describe('mobile boundary contracts', () => {
  it('maps database validation and operation errors without exposing details', () => {
    expect(saveErrorMessage({message:'username-unavailable'})).toContain('username');
    expect(saveErrorMessage({message:'operation-conflict'})).toContain('original attempt');
    expect(saveErrorMessage({message:'invalid-passport'})).toContain('entries');
  });
  it('supports multiple choices and exclusive none/unknown', () => {
    expect(toggleSelection(['unknown'], 'shine')).toEqual(['shine']);
    expect(toggleSelection(['shine'], 'volume')).toEqual(['shine','volume']);
    expect(toggleSelection(['shine','volume'], 'none')).toEqual(['none']);
    expect(toggleSelection(['shine'], 'shine')).toEqual(['unknown']);
  });
  it('retains submitted fields while reviewing against a newer record', () => {
    expect(reviewRebase({density:'high',notes:'new'}, {notes:'mine'})).toEqual({density:'high',notes:'mine'});
  });
  it('does not replace an established account view on token refresh', () => {
    expect(authNeedsLoading(true)).toBe(false);
    expect(authNeedsLoading(false)).toBe(true);
    const established = {id:'owner-a'};
    expect(resolvedRefreshUser(established, null, true)).toBe(established);
    expect(resolvedRefreshUser(established, {id:'owner-b'}, false)).toEqual({id:'owner-b'});
    expect(resolvedRefreshUser(established, null, false)).toBeNull();
  });
  it('does not interpret a failed auth lookup as a signed-out user', () => {
    expect(() => authUserFromResult({ data: { user: null }, error: new Error('network') })).toThrow('auth-user-unavailable');
    expect(authUserFromResult({ data: { user: null }, error: null })).toBeNull();
    expect(authUserFromResult({ data: { user: { id: 'owner-a' } }, error: null })).toEqual({ id: 'owner-a' });
  });
  it('treats the SDK missing-session result on a virgin device as signed out', () => {
    expect(authUserFromResult({ data: { user: null }, error: new AuthSessionMissingError() })).toBeNull();
  });
  it('does not accept another auth error or an error that merely resembles missing-session text', () => {
    for (const error of [new Error('Auth session missing!'), { name: 'AuthSessionMissingError', message: 'Auth session missing!' }, { __isAuthError: true, name: 'AuthApiError', status: 401, code: 'session_not_found' }]) {
      expect(() => authUserFromResult({ data: { user: null }, error })).toThrow('auth-user-unavailable');
    }
  });
  it('never accepts an unverified user attached to a missing-session error', () => {
    expect(() => authUserFromResult({ data: { user: { id: 'unverified-owner' } }, error: new AuthSessionMissingError() })).toThrow('auth-user-unavailable');
  });
  it('submits only explicitly changed fields, avoiding stale snapshot reassertion', () => {
    expect(changedFields({ goals: ['shine'], maximumProductBudgetZar: 100 }, { goals: ['shine'], maximumProductBudgetZar: 200 })).toEqual({ maximumProductBudgetZar: 200 });
  });
  it('keeps zero distinct from null and never mutates the form', () => {
    const current = Object.freeze({ maximumProductBudgetZar: null });
    expect(changedFields(current, { maximumProductBudgetZar: 0 })).toEqual({ maximumProductBudgetZar: 0 });
    expect(current.maximumProductBudgetZar).toBeNull();
  });
  it('allows only the exact registered callback with one code and a pending flow', () => {
    expect(parseRecoveryCallback('strandcue://auth/callback?code=abc&sb_flow_id=12345678', true)).toEqual({code: 'abc', flowId: '12345678'});
    for (const url of ['https://evil.test/auth/callback?code=a&sb_flow_id=12345678', 'strandcue://auth/callback/extra?code=a&sb_flow_id=12345678', 'strandcue://auth/callback?code=a&code=b&sb_flow_id=12345678', 'strandcue://auth/callback#access_token=a', 'strandcue://auth/callback?code=&sb_flow_id=12345678', 'strandcue://auth/callback?code=a', 'strandcue://auth/callback?code=a&sb_flow_id=short', 'strandcue://auth/callback?code=a&sb_flow_id=12345678&sb_flow_id=abcdefgh']) {
      expect(parseRecoveryCallback(url, true)).toBeNull();
    }
    expect(parseRecoveryCallback('strandcue://auth/callback?code=a&sb_flow_id=12345678', false)).toBeNull();
  });
  it('requires a public client key and a secure or local development URL', () => {
    expect(publicConfig('', '')).toBeNull();
    expect(publicConfig('https://project.supabase.co', 'sb_secret_never')).toBeNull();
    expect(publicConfig('http://example.com', 'sb_publishable_test')).toBeNull();
    expect(publicConfig('https://project.supabase.co', 'sb_publishable_test')).toEqual({ url: 'https://project.supabase.co', key: 'sb_publishable_test' });
  });
  it('gives a conflict path without exposing raw server internals', () => {
    expect(saveErrorMessage({ message: 'revision-conflict' })).toContain('another device');
    expect(saveErrorMessage({ message: 'SQL private_table owner secret' })).not.toContain('SQL');
  });
  it('normalizes username and optional suggestion suffix without widening the accepted alphabet', () => {
    expect(normalizeUsernameInput('  Mark  ')).toBe('mark');
    expect(normalizeUsernameSuffix('  ZA curls!  ')).toBe('za_curls');
    expect(normalizeUsernameSuffix('___')).toBe('');
  });
  it('uses a specific recovery error without exposing provider details', () => {
    expect(recoveryFailureMessage('invalid')).toContain('cannot be used');
    expect(recoveryFailureMessage('expired')).toContain('expired');
    expect(recoveryFailureMessage('exchange failed: token=secret')).not.toContain('secret');
  });
  it('accepts only the exact username-options response contract', () => {
    expect(parseUsernameOptions({ available: false, suggestions: ['mark_2'], rateLimited: false })).toEqual({ available: false, suggestions: ['mark_2'], rateLimited: false });
    expect(parseUsernameOptions({ available: true, suggestions: [], rateLimited: true })).toEqual({ available: true, suggestions: [], rateLimited: true });
    for (const value of [null, {}, { available: 'yes', suggestions: [] }, { available: false, suggestions: ['Invalid!'] }, { available: false, suggestions: [], extra: true }]) {
      expect(() => parseUsernameOptions(value)).toThrow('invalid-username-options');
    }
  });
});
