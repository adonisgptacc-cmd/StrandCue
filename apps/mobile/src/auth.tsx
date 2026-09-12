import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { User } from '@supabase/supabase-js';
import { RECOVERY_KEY, secureStorage, supabase } from './client';
import { authNeedsLoading, parseRecoveryCallback, resolvedRefreshUser } from './contracts';
import { transitionServiceDraftOwner } from './service-form';
import { Button, Field, Page, styles } from './ui';

export const serviceDraftCleanupNotice = 'Device drafts from the previous account could not be cleared. Sign out before sharing this device.';

export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const verifiedUser = useRef<User | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;
    const refresh = (hideExisting = false) => {
      const request = ++epoch.current;
      setLoading(hideExisting || authNeedsLoading(!!verifiedUser.current));
      void client.auth.getUser().then(async ({data}) => {
        let cleanupFailed = false;
        try { await transitionServiceDraftOwner(secureStorage, data.user?.id ?? null); }
        catch { cleanupFailed = true; }
        if (mounted && request === epoch.current) {
          verifiedUser.current = data.user;
          setUser(data.user);
          setNotice(current => cleanupFailed ? serviceDraftCleanupNotice : current === serviceDraftCleanupNotice ? '' : current);
          setLoading(false);
        }
      }).catch(() => {
        if (mounted && request === epoch.current) {
          const retained = resolvedRefreshUser(verifiedUser.current, null, true);
          verifiedUser.current = retained;
          setUser(retained);
          setNotice(retained ? 'Your session could not be refreshed yet. Your open record is unchanged.' : 'Your session could not be verified. Check your connection and try again.');
          setLoading(false);
        }
      });
    };
    refresh();
    const {data: {subscription}} = client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        const request = ++epoch.current;
        verifiedUser.current = null; setUser(null); setRecovery(false); setLoading(false);
        void transitionServiceDraftOwner(secureStorage, null).catch(() => {
          if (mounted && request === epoch.current) setNotice(serviceDraftCleanupNotice);
        });
      } else setTimeout(() => { if (mounted) refresh(event === 'SIGNED_IN'); }, 0);
    });
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
    });
    let processing = false;
    const callback = async (url: string) => {
      if (processing) return;
      processing = true;
      try {
        const raw = await secureStorage.getItem(RECOVERY_KEY);
        const started = raw ? Number(raw) : 0;
        const code = parseRecoveryCallback(url, started > 0 && Date.now() - started < 3_600_000 && Date.now() >= started);
        if (!code) { if (mounted) setNotice('That recovery link cannot be used here. Request a fresh link on this device.'); return; }
        const {data, error} = await client.auth.exchangeCodeForSession(code);
        await secureStorage.removeItem(RECOVERY_KEY);
        if (error || !('redirectType' in data) || data.redirectType !== 'recovery' || !data.session) { if (mounted) setNotice('That recovery link expired or could not be verified. Please request another.'); return; }
        if (mounted) {setRecovery(true); setNotice('');}
      } catch { if (mounted) setNotice('Recovery could not finish. Please request a fresh link.'); }
      finally { processing = false; }
    };
    void Linking.getInitialURL().then(url => {if (url?.startsWith('strandcue://auth/')) void callback(url);});
    const links = Linking.addEventListener('url', ({url}) => { void callback(url); });
    return () => {mounted = false; ++epoch.current; subscription.unsubscribe(); state.remove(); links.remove();};
  }, []);
  return {user, loading, recovery, notice, finishRecovery: () => setRecovery(false)};
}

export function AuthScreen({notice = ''}: {notice?: string}) {
  const [mode, setMode] = useState<'signin'|'signup'|'recovery'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [message, setMessage] = useState(notice);
  const [busy, setBusy] = useState(false);
  useEffect(() => {setMessage(notice);}, [notice]);
  const submit = async () => {
    if (!supabase) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {setMessage('Enter a valid email address.'); return;}
    if (mode === 'signup' && (!adult || password.length < 12)) {setMessage('Confirm you are 18 or older and use a password with at least 12 characters.'); return;}
    setBusy(true); setMessage('');
    try {
      if (mode === 'recovery') {
        await secureStorage.setItem(RECOVERY_KEY, String(Date.now()));
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: 'strandcue://auth/callback'});
        if (error) throw error;
        setMessage('If that account exists, a recovery email is on its way. Open the link on this device.');
      } else if (mode === 'signup') {
        const {error} = await supabase.auth.signUp({email: email.trim(), password});
        if (error) throw error;
        setMessage('Check your email to confirm your account, then sign in here.');
        setMode('signin'); setPassword('');
      } else {
        const {error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
        if (error) throw error;
      }
    } catch {setMessage('We could not complete that request. Check your details and connection, then try again.');}
    finally {setBusy(false);}
  };
  return <Page><Text style={styles.kicker}>A LITTLE MORE UNDERSTANDING</Text><Text style={styles.title}>Your hair,{ '\n' }as you know it.</Text><Text style={styles.subtitle}>A private place for what you know, what you use, and what changes. Start wherever you are.</Text>
    <View style={styles.card}><Text style={styles.heading}>{mode === 'signup' ? 'Begin your hair record' : mode === 'signin' ? 'Welcome back' : 'Recover your account'}</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"/>
      {mode !== 'recovery' && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />}
      {mode === 'signup' && <Button title={adult ? '✓ I am 18 or older' : 'Confirm: I am 18 or older'} secondary onPress={() => setAdult(!adult)} />}
      {!!message && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
      <Button title={busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Send recovery link'} disabled={busy} onPress={() => void submit()} />
      <Button title={mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account'} secondary disabled={busy} onPress={() => {setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('');}} />
      {mode === 'signin' && <Button title="Forgot password?" secondary onPress={() => {setMode('recovery'); setMessage('');}}/>}
    </View><Text style={styles.subtitle}>For adults in South Africa. Cosmetic hair-care records, without diagnosis or medical advice.</Text></Page>;
}

export function ResetPassword({onComplete}: {onComplete: () => void}) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 12) {setMessage('Use at least 12 characters.'); return;}
    setBusy(true);
    try {const result = await supabase!.auth.updateUser({password}); if (result.error) throw result.error; setPassword(''); onComplete();}
    catch {setMessage('Your password could not be changed. Request a new recovery link if this one expired.');}
    finally {setBusy(false);}
  };
  return <Page><Text style={styles.title}>A fresh start.</Text><View style={styles.card}><Field label="New password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword}/><Text accessibilityRole="alert" style={styles.body}>{message}</Text><Button title={busy ? 'Saving…' : 'Save new password'} disabled={busy} onPress={() => void submit()}/></View></Page>;
}
