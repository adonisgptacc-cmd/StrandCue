import { describe, expect, it } from 'vitest';
import { changedFields, parseRecoveryCallback, publicConfig, saveErrorMessage, toggleSelection, reviewRebase, authNeedsLoading, resolvedRefreshUser } from '../../apps/mobile/src/contracts';

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
  it('submits only explicitly changed fields, avoiding stale snapshot reassertion', () => {
    expect(changedFields({ goals: ['shine'], maximumProductBudgetZar: 100 }, { goals: ['shine'], maximumProductBudgetZar: 200 })).toEqual({ maximumProductBudgetZar: 200 });
  });
  it('keeps zero distinct from null and never mutates the form', () => {
    const current = Object.freeze({ maximumProductBudgetZar: null });
    expect(changedFields(current, { maximumProductBudgetZar: 0 })).toEqual({ maximumProductBudgetZar: 0 });
    expect(current.maximumProductBudgetZar).toBeNull();
  });
  it('allows only the exact registered callback with one code and a pending flow', () => {
    expect(parseRecoveryCallback('strandcue://auth/callback?code=abc', true)).toBe('abc');
    for (const url of ['https://evil.test/auth/callback?code=a', 'strandcue://auth/callback/extra?code=a', 'strandcue://auth/callback?code=a&code=b', 'strandcue://auth/callback#access_token=a', 'strandcue://auth/callback?code=']) {
      expect(parseRecoveryCallback(url, true)).toBeNull();
    }
    expect(parseRecoveryCallback('strandcue://auth/callback?code=a', false)).toBeNull();
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
});
