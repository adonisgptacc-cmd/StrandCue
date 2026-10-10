import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { User } from '@supabase/supabase-js';
import { RECOVERY_ACTIVE_KEY, RECOVERY_KEY, secureStorage, supabase } from './client';
import { authNeedsLoading, parseRecoveryCallback, recoveryFailureMessage, resolveAuthRefresh, resolvedRefreshUser } from './contracts';
import { transitionServiceDraftOwner } from './service-form';
import { Button, Field, Page, styles } from './ui';

export const serviceDraftCleanupNotice = 'Device drafts from the previous account could not be cleared. Sign out before sharing this device.';
const authCallbackUrl = 'strandcue://auth/callback';

type RecoveryAuth = {
  exchangeCodeForSession: (code: string, options: {flowId: string}) => Promise<{data: {session?: unknown; redirectType?: string}; error: unknown}>;
  signOut: (options: {scope: 'local'}) => Promise<unknown>;
};

type RecoveryOutcome = {status: 'ready'} | {status: 'failed'; reason: 'invalid' | 'expired'};

export function createRecoveryCallbackGate() {
  let completed: RecoveryOutcome | null = null;
  let inFlight: Promise<RecoveryOutcome> | null = null;
  return {
    run(operation: () => Promise<RecoveryOutcome>): Promise<RecoveryOutcome> {
      if (completed) return Promise.resolve(completed);
      if (inFlight) return inFlight;
      inFlight = operation().then(result => {
        if (result.status === 'ready') completed = result;
        return result;
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
    reset() { completed = null; inFlight = null; },
  };
}

const recoveryCallbackGate = createRecoveryCallbackGate();

export async function completeRecoveryCallback(options: {
  url: string;
  pending: boolean;
  auth: RecoveryAuth;
  removeRecoveryMarker: () => Promise<void>;
}): Promise<RecoveryOutcome> {
  const callback = parseRecoveryCallback(options.url, options.pending);
  if (!callback) {
    await options.removeRecoveryMarker();
    await options.auth.signOut({scope: 'local'});
    return {status: 'failed', reason: 'invalid'};
  }
  const {data, error} = await options.auth.exchangeCodeForSession(callback.code, {flowId: callback.flowId});
  await options.removeRecoveryMarker();
  if (error || data.redirectType !== 'recovery' || !data.session) {
    await options.auth.signOut({scope: 'local'});
    return {status: 'failed', reason: 'expired'};
  }
  return {status: 'ready'};
}

export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const verifiedUser = useRef<User | null>(null);
  const recoveryRef = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let mounted = true;
    let epoch = 0;
    let initialLinkChecked = false;
    const refresh = (hideExisting = false) => {
      const request = ++epoch;
      setLoading(hideExisting || authNeedsLoading(!!verifiedUser.current));
      const isCurrent = () => mounted && request === epoch;
      void client.auth.getUser()
        .then(result => resolveAuthRefresh(result, (owner, guard) => transitionServiceDraftOwner(secureStorage, owner, guard), isCurrent))
        .then(outcome => {
        if (outcome && isCurrent()) {
          verifiedUser.current = outcome.user;
          setUser(outcome.user);
          setNotice(current => outcome.cleanupFailed ? serviceDraftCleanupNotice : current === serviceDraftCleanupNotice ? '' : current);
          setLoading(false);
        }
      }).catch(() => {
        if (mounted && request === epoch) {
          const retained = resolvedRefreshUser(verifiedUser.current, null, true);
          verifiedUser.current = retained;
          setUser(retained);
          setNotice(retained ? 'Your session could not be refreshed yet. Your open record is unchanged.' : 'Your session could not be verified. Check your connection and try again.');
          setLoading(false);
        }
      });
    };
    const {data: {subscription}} = client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        const request = ++epoch;
        verifiedUser.current = null; setUser(null); setRecovery(false); setLoading(false);
        void transitionServiceDraftOwner(secureStorage, null, () => mounted && request === epoch).catch(() => {
          if (mounted && request === epoch) setNotice(serviceDraftCleanupNotice);
        });
      } else setTimeout(() => { if (mounted && initialLinkChecked && !recoveryRef.current) refresh(event === 'SIGNED_IN'); }, 0);
    });
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
    });
    let processing = false;
    const callback = async (url: string) => {
      if (processing) return;
      processing = true;
      // Exchanging the recovery code emits SIGNED_IN before the promise resolves.
      // Gate normal profile routing for the whole exchange, not only afterwards.
      recoveryRef.current = true;
      try {
        if (await secureStorage.getItem(RECOVERY_ACTIVE_KEY) === '1') {
          if (mounted) {setRecovery(true); setLoading(false); setNotice('');}
          return;
        }
        const raw = await secureStorage.getItem(RECOVERY_KEY);
        const started = raw ? Number(raw) : 0;
        const outcome = await recoveryCallbackGate.run(() => completeRecoveryCallback({
          url,
          pending: started > 0 && Date.now() - started < 3_600_000 && Date.now() >= started,
          auth: client.auth,
          removeRecoveryMarker: () => secureStorage.removeItem(RECOVERY_KEY),
        }));
        if (outcome.status === 'failed') {
          recoveryRef.current = false;
          verifiedUser.current = null;
          if (mounted) { setUser(null); setRecovery(false); setLoading(false); setNotice(recoveryFailureMessage(outcome.reason)); }
          return;
        }
        await secureStorage.setItem(RECOVERY_ACTIVE_KEY, '1');
        if (mounted) {setRecovery(true); setLoading(false); setNotice('');}
      } catch {
        recoveryRef.current = false;
        await secureStorage.removeItem(RECOVERY_KEY).catch(() => undefined);
        await client.auth.signOut({scope: 'local'}).catch(() => undefined);
        if (mounted) { setUser(null); setRecovery(false); setLoading(false); setNotice(recoveryFailureMessage('failure')); }
      }
      finally { processing = false; }
    };
    void secureStorage.getItem(RECOVERY_ACTIVE_KEY).then(async active => {
      if (!mounted) return;
      if (active === '1') {
        recoveryRef.current = true;
        initialLinkChecked = true;
        setRecovery(true);
        setLoading(false);
        return;
      }
      const url = await Linking.getInitialURL();
      if (!mounted) return;
      if (url?.startsWith('strandcue://auth/')) await callback(url);
      else refresh();
      initialLinkChecked = true;
    }).catch(() => {
      if (mounted) { initialLinkChecked = true; refresh(); }
    });
    const links = Linking.addEventListener('url', ({url}) => { void callback(url); });
    return () => {mounted = false; ++epoch; subscription.unsubscribe(); state.remove(); links.remove();};
  }, []);
  return {user, loading, recovery, notice, finishRecovery: () => {
    recoveryCallbackGate.reset();
    recoveryRef.current = false;
    void secureStorage.removeItem(RECOVERY_ACTIVE_KEY);
    setRecovery(false);
  }};
}

export function AuthScreen({notice = ''}: {notice?: string}) {
  const [mode, setMode] = useState<'signin'|'signup'|'recovery'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [messageState, setMessageState] = useState({notice, message: notice});
  const [busy, setBusy] = useState(false);
  if (messageState.notice !== notice) setMessageState({notice, message: notice});
  const message = messageState.notice === notice ? messageState.message : notice;
  const setMessage = (nextMessage: string) => setMessageState({notice, message: nextMessage});
  const submit = async () => {
    if (!supabase) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {setMessage('Enter a valid email address.'); return;}
    if (mode === 'signup' && (!adult || password.length < 12)) {setMessage('Confirm you are 18 or older and use a password with at least 12 characters.'); return;}
    setBusy(true); setMessage('');
    try {
      if (mode === 'recovery') {
        await secureStorage.setItem(RECOVERY_KEY, String(Date.now()));
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {redirectTo: authCallbackUrl});
        if (error) throw error;
        setMessage('If that account exists, a recovery email is on its way. Open the link on this device.');
      } else if (mode === 'signup') {
        const {error} = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {emailRedirectTo: authCallbackUrl},
        });
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
