import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import type { PassportRevision } from '../../../packages/domain/src/index';
import { supabase, secureStorage } from './client';
import { normalizeUsernameInput, normalizeUsernameSuffix, parseUsernameOptions, saveErrorMessage } from './contracts';
import { loadPassport, type PassportRecord } from './passport-api';
import { PassportEditor } from './passport-editor';
import { ReleaseStageBanner } from './ReleaseStageBanner';
import { DESTINATIONS, INITIAL_DESTINATION, guidanceRouteTarget, type DestinationId, type GuidanceRoute } from './navigation';
import { TodayGuidance } from './TodayGuidance';
import { MyHairOverview } from './MyHairOverview';
import { useOwnerLoad } from './owner-load';
import { Services } from './services';
import { Activities } from './activities';
import { CueCheckJourney } from './CueCheckJourney';
import type { TerminalExecutionContext } from './cue-check-state';
import { Shelf } from './shelf';
import { Tools } from './tools';
import { ExportScreen } from './screens/ExportScreen';
import { DeletionScreen } from './screens/DeletionScreen';
import { changeUsername, suggestUsernames, usernameErrorMessage, usernameHelperText, usernameIdeasLabel } from './settings-api';
import { consentErrorMessage, consentPurposeLabel, listConsents, optionalPurposes, setConsent, type ConsentList, type ConsentPurpose } from './consent-api';
import { clearServiceDrafts } from './service-form';
import { clearAllCheckInDrafts } from './guidance/current-condition-state';
import * as Crypto from 'expo-crypto';
import { Button, Field, Page, styles, display, fieldLabel } from './ui';

function SettingsView({ owner, profile, busy, onLogout, onProfileChanged }: {
  owner: string; profile: { username: string }; busy: boolean; onLogout: () => void; onProfileChanged: () => void;
}) {
  const [section, setSection] = useState<'main' | 'username' | 'export' | 'delete' | 'privacy'>('main');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [consents, setConsents] = useState<ConsentList | null>(null);
  const openPrivacy = async () => {
    setSection('privacy'); setMessage('');
    try {
      setConsents(await listConsents());
    } catch (caught) {
      setMessage(consentErrorMessage((caught as { message?: string })?.message ?? ''));
    }
  };
  const toggleConsent = async (purpose: ConsentPurpose, granted: boolean) => {
    setSaving(true); setMessage('');
    try {
      await setConsent(Crypto.randomUUID(), purpose, granted);
      setConsents(await listConsents());
    } catch (caught) {
      setMessage(consentErrorMessage((caught as { message?: string })?.message ?? ''));
    } finally { setSaving(false); }
  };
  if (section === 'export') return <View style={{ gap: 20 }}>
    <Button title="Back to settings" secondary onPress={() => setSection('main')} />
    <ExportScreen owner={owner} />
  </View>;
  if (section === 'delete') return <View style={{ gap: 20 }}>
    <Button title="Back to settings" secondary onPress={() => setSection('main')} />
    <DeletionScreen owner={owner} />
  </View>;
  if (section === 'privacy') return <View style={{ gap: 20 }}>
    <Button title="Back to settings" secondary onPress={() => setSection('main')} />
    <View style={styles.card}>
      <Text style={styles.heading}>Privacy choices</Text>
      <Text style={styles.body}>Hair record processing is required while your account exists — stopping it means deleting your account. Optional choices take effect immediately and stop future collection.</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{consentPurposeLabel('hair_passport_processing')}</Text>
        <Text style={styles.body}>On (required)</Text>
      </View>
      {consents === null && <Text style={styles.body}>Loading choices…</Text>}
      {optionalPurposes.map(purpose => <View key={purpose} style={styles.row}>
        <Text style={styles.label}>{consentPurposeLabel(purpose)}</Text>
        <Button title={consents?.[purpose] ? 'On — turn off' : 'Off — turn on'} secondary disabled={saving} onPress={() => void toggleConsent(purpose, !(consents?.[purpose] ?? false))} />
      </View>)}
      {!!message && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
    </View>
  </View>;
  const saveUsername = async () => {
    setSaving(true); setMessage(''); setShowIdeas(false);
    try {
      const receipt = await changeUsername(Crypto.randomUUID(), username);
      setMessage(`Username changed to @${receipt.username}.`);
      setUsername('');
      onProfileChanged();
    } catch (caught) {
      const serverMessage = (caught as { message?: string })?.message ?? '';
      setMessage(usernameErrorMessage(serverMessage));
      // The entered name stays in the field; ideas are offered only for conflicts.
      setShowIdeas(serverMessage.includes('username-unavailable') || serverMessage.includes('username-taken'));
    } finally { setSaving(false); }
  };
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text style={styles.heading}>@{profile.username}</Text>
      <Text style={styles.body}>Your private record is linked to your account, even if your email changes.</Text>
      <Text style={styles.body}>Market: South Africa · Currency: ZAR · Temperature: Celsius</Text>
      <Button title={busy ? 'Signing out…' : 'Sign out of this device'} disabled={busy} onPress={onLogout} />
    </View>
    {section === 'username' ? <View style={styles.card}>
      <Text style={styles.heading}>Change username</Text>
      <Text style={styles.body}>Usernames can change once every 7 days. Your history stays linked to your account.</Text>
      <Field label="New username" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={32} />
      <Text style={styles.body}>{usernameHelperText}</Text>
      {!!message && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
      {showIdeas && suggestUsernames(username).length > 0 && <View>
        <Text style={styles.body}>{usernameIdeasLabel}</Text>
        {suggestUsernames(username).map(idea => <Button key={idea} title={`Try ${idea}`} secondary disabled={saving} onPress={() => { setUsername(idea); setShowIdeas(false); setMessage(''); }} />)}
      </View>}
      <Button title={saving ? 'Saving…' : 'Save username'} disabled={saving || busy} onPress={() => void saveUsername()} />
      <Button title="Back to settings" secondary disabled={saving} onPress={() => { setSection('main'); setMessage(''); }} />
    </View> : <View style={styles.card}>
      <Text style={styles.heading}>Account</Text>
      {!!message && <Text style={styles.body}>{message}</Text>}
      <Button title="Change username" secondary disabled={busy} onPress={() => { setSection('username'); setMessage(''); }} />
      <Button title="Privacy choices" secondary disabled={busy} onPress={() => void openPrivacy()} />
      <Button title="Export my data" secondary disabled={busy} onPress={() => setSection('export')} />
      <Button title="Delete my account" secondary disabled={busy} onPress={() => setSection('delete')} />
    </View>}
    <View style={styles.card}>
      <Text style={styles.heading}>About this development build</Text>
      <Text style={styles.body}>Use synthetic information during testing.</Text>
      {Platform.OS === 'web' && <Text style={styles.subtitle}>Browser preview keeps session data in memory only. Native secure storage and email recovery need device testing.</Text>}
    </View>
  </View>;
}

export function Records({user, notice = ''}: {user: User; notice?: string}) {
  const [profile, setProfile] = useState<{username: string}|null>(null);
  const [record, setRecord] = useState<PassportRecord|null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState({ notice, error: notice });
  const [destination, setDestination] = useState<DestinationId>(INITIAL_DESTINATION);
  const [hairView, setHairView] = useState<'Passport'|'Services'>('Passport');
  const [journeyView, setJourneyView] = useState<'History'|'Activities'|'Check-ins'>('History');
  const [cueIntent, setCueIntent] = useState<TerminalExecutionContext|null>(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<PassportRevision|undefined>();
  const [username, setUsername] = useState('');
  const [usernameSuffix, setUsernameSuffix] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'available'|'taken'|'throttled'>('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const usernameCheckEpoch = useRef(0);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(false);
  const [asOf, setAsOf] = useState('');
  const [historical, setHistorical] = useState<PassportRecord|null>(null);
  const [initialNotice] = useState(notice);
  if (errorState.notice !== notice) setErrorState({ notice, error: notice });
  const error = errorState.notice === notice ? errorState.error : notice;
  const setError = (nextError: string) => setErrorState({ notice, error: nextError });
  const ownerLoad = useOwnerLoad({
    ownerKey: user.id,
    load: async () => {
      const response = await supabase!.from('profiles').select('username').maybeSingle();
      if (response.error) throw response.error;
      const next = response.data ? await loadPassport() : null;
      return { profile: response.data, record: next };
    },
    apply: result => { setProfile(result.profile); setRecord(result.record); },
    handleError: (caught, mode) => {
      if (mode === 'initial') setErrorState({ notice: initialNotice, error: saveErrorMessage(caught) });
      else setError(saveErrorMessage(caught));
    },
    clearError: () => setError(''),
    setLoading,
  });
  const isMounted = ownerLoad.isMounted;
  const refresh = () => ownerLoad.run('refresh');
  const checkUsername = useCallback(async (candidate: string, suffix: string) => {
    const normalized = normalizeUsernameInput(candidate);
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) return {available: false, suggestions: [] as string[], rateLimited: false};
    const response = await supabase!.rpc('username_options', {
      p_username: normalized,
      p_suffix: normalizeUsernameSuffix(suffix) || null,
    });
    if (response.error) throw response.error;
    return parseUsernameOptions(response.data);
  }, []);
  useEffect(() => {
    if (profile) return;
    const normalized = normalizeUsernameInput(username);
    const request = ++usernameCheckEpoch.current;
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) return;
    const timer = setTimeout(() => {
      if (isMounted() && request === usernameCheckEpoch.current) setUsernameStatus('checking');
      void checkUsername(normalized, usernameSuffix).then(result => {
        if (!isMounted() || request !== usernameCheckEpoch.current) return;
        setUsernameStatus(result.rateLimited ? 'throttled' : result.available ? 'available' : 'taken');
        setUsernameSuggestions(result.suggestions);
      }).catch(() => {
        if (isMounted() && request === usernameCheckEpoch.current) setUsernameStatus('idle');
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [checkUsername, isMounted, profile, username, usernameSuffix]);
  const changeUsername = (value: string) => { setUsername(value); setUsernameStatus('idle'); setUsernameSuggestions([]); };
  const changeUsernameSuffix = (value: string) => { setUsernameSuffix(value); setUsernameStatus('idle'); setUsernameSuggestions([]); };
  const finishSetup = async () => {
    if (!adult) {setError('You must be 18 or older to use StrandCue.'); return;}
    setBusy(true); setError('');
    try {
      const normalized = normalizeUsernameInput(username);
      if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
        setError('Use 3–24 lowercase letters, numbers or underscores.');
        return;
      }
      const availability = await checkUsername(normalized, usernameSuffix);
      if (availability.rateLimited) {
        setUsernameStatus('throttled'); setUsernameSuggestions([]);
        setError('Too many username checks. Wait a minute, then try again.');
        return;
      }
      if (!availability.available) {
        setUsernameStatus('taken'); setUsernameSuggestions(availability.suggestions);
        setError(`@${normalized} is already taken. Choose an available suggestion or another username.`);
        return;
      }
      const {error: issue} = await supabase!.rpc('complete_account',{p_username: normalized,p_eligible: adult});
      if(issue) throw issue;
      await refresh();
    }
    catch(caught) {if (ownerLoad.isMounted()) setError(saveErrorMessage(caught));} finally {if (ownerLoad.isMounted()) setBusy(false);}
  };
  const logout = async () => {
    setBusy(true); setError('');
    try {
      // The temporary check-in and the resolver state belong to the owner who
      // is leaving. They are cleared before the sign-out, so the next person
      // to use this device cannot read them.
      clearAllCheckInDrafts();
      await secureStorage.removeItem(`strandcue-draft-${user.id}`);
      await clearServiceDrafts(secureStorage, user.id);
      const {error: issue} = await supabase!.auth.signOut({scope:'local'});
      if (issue) throw issue;
    } catch {if (ownerLoad.isMounted()) setError('Sign out could not finish. Please try again before sharing this device.');}
    finally {if (ownerLoad.isMounted()) setBusy(false);}
  };
  const viewHistory = async () => {
    setBusy(true); setError('');
    try { const next = await loadPassport(asOf); if (ownerLoad.isMounted()) setHistorical(next); }
    catch (caught) { if (ownerLoad.isMounted()) setError(saveErrorMessage(caught)); }
    finally { if (ownerLoad.isMounted()) setBusy(false); }
  };
  if (!user.email_confirmed_at) return <Page><ReleaseStageBanner /><Text style={styles.title}>Confirm your email.</Text><Text style={styles.body}>Open your confirmation email, then sign in again to begin your private record.</Text><Button title="Sign out" onPress={() => void logout()}/></Page>;
  if (loading) return <Page><ReleaseStageBanner /><Text style={styles.title}>Opening your record…</Text><Text style={styles.subtitle}>Bringing your saved information together.</Text></Page>;
  if (!profile) return <Page><ReleaseStageBanner /><Text style={styles.title}>Make it yours.</Text><View style={styles.card}><Text style={styles.body}>Choose a private username. Your email and username are never public profile listings.</Text><Field label="Username" value={username} onChangeText={changeUsername} autoCapitalize="none" maxLength={24}/><Text style={styles.subtitle}>3–24 letters, numbers or underscores.</Text><Field label="Optional personal suffix" value={usernameSuffix} onChangeText={changeUsernameSuffix} autoCapitalize="none" maxLength={24}/>
    {usernameStatus === 'checking' && <Text style={styles.subtitle}>Checking availability…</Text>}
    {usernameStatus === 'available' && <Text style={styles.subtitle}>@{normalizeUsernameInput(username)} is available.</Text>}
    {usernameStatus === 'throttled' && <Text accessibilityRole="alert" style={styles.error}>Too many username checks. Wait a minute, then try again.</Text>}
    {usernameStatus === 'taken' && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>@{normalizeUsernameInput(username)} is already taken.</Text><Text style={styles.body}>Try one of these checked options:</Text><View style={styles.row}>{usernameSuggestions.map(suggestion => <Button key={suggestion} title={`Use @${suggestion}`} secondary onPress={() => changeUsername(suggestion)}/>)}</View></View>}
    <Button title={adult ? '✓ I am 18 or older' : 'Confirm: I am 18 or older'} secondary onPress={() => setAdult(!adult)}/>{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<Button title={busy ? 'Saving…' : 'Create my private profile'} disabled={busy || usernameStatus === 'checking'} onPress={() => void finishSetup()}/><Button title="Sign out" secondary disabled={busy} onPress={() => void logout()}/></View></Page>;
  const visible = historical ?? record;
  const selectDestination = (next: DestinationId) => {setDestination(next);setEditing(false);setTarget(undefined);};
  /**
   * A resolver route may name a destination and, for My Hair, the part of it.
   * A route that stays on Today never reaches here.
   */
  const selectRoute = (route: GuidanceRoute) => {
    const target = guidanceRouteTarget(route);
    if (target === null) return;
    setDestination(target.destination);
    if (target.hairView !== undefined) setHairView(target.hairView);
    setEditing(false);
    setTarget(undefined);
  };
  /** A finished routine asked for its Cue Check: open the Journey check-ins on it. */
  const openCueCheck = (execution: TerminalExecutionContext) => {
    setCueIntent(execution);
    setJourneyView('Check-ins');
    setDestination('journey');
    setEditing(false);
    setTarget(undefined);
  };
  const destinationTitle = destination === 'my_hair' ? hairView === 'Passport' ? 'Your Hair Passport' : 'Your chemical services' : destination === 'my_shelf' ? 'My Shelf' : destination === 'my_tools' ? 'My Tools' : destination === 'journey' ? journeyView === 'History' ? 'Every change has a story.' : journeyView === 'Check-ins' ? 'How your hair felt' : 'Your activities' : destination === 'settings' ? 'Your account, your say.' : '';
  return <Page><ReleaseStageBanner /><ScrollView horizontal accessibilityLabel="Product destinations"><View style={styles.row}>{DESTINATIONS.map(entry => <Button key={entry.id} title={entry.label} accessibilityLabel={entry.accessibilityLabel} secondary={destination !== entry.id} onPress={() => selectDestination(entry.id)}/>)}</View></ScrollView>
    <Text style={styles.kicker}>PRIVATE · SOUTH AFRICA</Text>
    {destination === 'today' && <TodayGuidance key={user.id} ownerId={user.id} onNavigate={selectRoute} onCueCheck={openCueCheck}/>}
    {destination === 'my_hair' && <View style={styles.row}>{(['Passport','Services'] as const).map(name => <Button key={name} title={name} secondary={hairView !== name} onPress={() => {setHairView(name);setEditing(false);setTarget(undefined);}}/>)}</View>}
    {destination === 'journey' && <View style={styles.row}>{(['History','Activities','Check-ins'] as const).map(name => <Button key={name} title={name} secondary={journeyView !== name} onPress={() => setJourneyView(name)}/>)}</View>}
    {destinationTitle !== '' && <Text accessibilityRole="header" style={styles.title}>{destinationTitle}</Text>}
    {!!error && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Retry loading" secondary onPress={() => void refresh()}/></View>}
    {destination === 'my_hair' && hairView === 'Services' && <Services owner={user.id} />}
    {destination === 'journey' && journeyView === 'Activities' && <Activities owner={user.id} />}
    {destination === 'journey' && journeyView === 'Check-ins' && <CueCheckJourney owner={user.id} intent={cueIntent} onIntentHandled={() => setCueIntent(null)} />}
    {destination === 'my_shelf' && <Shelf owner={user.id} />}
    {destination === 'my_tools' && <Tools owner={user.id} />}
    {destination === 'my_hair' && hairView === 'Passport' && !editing && <><Text style={styles.subtitle}>A picture of your hair, built from what you’ve recorded. It grows with you.</Text>
      {record ? <MyHairOverview record={record} onRecordChange={() => {setEditing(true);setTarget(undefined);}}/> : <View style={styles.card}><Text style={styles.heading}>Start with what you know.</Text><Text style={styles.body}>Hair pattern, how it feels, and what matters to you. “Unknown” is a useful answer too.</Text><Button title="Create my Hair Passport" onPress={() => setEditing(true)}/></View>}
    </>}
    {editing && <PassportEditor key={target?.id ?? `edit-${record?.revision ?? 0}`} owner={user.id} record={record} target={target} onSaved={() => {setEditing(false);setTarget(undefined);setHistorical(null);void refresh();}} onCancel={() => {setEditing(false);setTarget(undefined);}}/>}
    {destination === 'journey' && journeyView === 'History' && !editing && <>
      <View style={styles.card}><Text style={styles.heading}>Look back</Text><Field label="As-of date (YYYY-MM-DD)" value={asOf} onChangeText={setAsOf}/><Button title="View that date" secondary disabled={busy} onPress={() => void viewHistory()}/><Button title={audit ? 'Hide correction audit' : 'Show correction audit'} secondary onPress={() => setAudit(!audit)}/></View>
      {historical && <View style={styles.card}><Text style={styles.heading}>Recorded facts as of {historical.projection.asOf}</Text>{Object.entries(historical.projection.values).map(([key,value])=><Text key={key} style={styles.body}>{fieldLabel(key)}: {display(value)}</Text>)}{Object.keys(historical.projection.ambiguousFields).map(key=><Text key={key} style={styles.body}>{fieldLabel(key)}: uncertain at this date</Text>)}</View>}
      {!visible && <Text style={styles.body}>Your history begins with your first Passport entry.</Text>}
      {visible?.revisions.filter(entry=>audit || !visible.projection.supersededRevisionIds.includes(entry.id)).slice().reverse().map(entry => <View style={styles.card} key={entry.id}><Text style={styles.kicker}>{entry.kind === 'correction' ? 'CORRECTION' : entry.kind === 'baseline' ? 'FIRST RECORD' : 'CHANGE'} · {entry.effectiveDate.value ?? 'DATE UNKNOWN'}</Text><Text style={styles.subtitle}>{entry.source.replaceAll('-',' ')} · {entry.effectiveDate.precision} precision</Text>{Object.entries(entry.patch).map(([key,value])=><Text key={key} style={styles.body}>{fieldLabel(key)}: {display(value)}</Text>)}{'correctionReason' in entry && <Text style={styles.body}>Reason: {entry.correctionReason}</Text>}{!record?.projection.supersededRevisionIds.includes(entry.id) && <Button title="Correct this entry" secondary onPress={() => {setTarget(entry);setEditing(true);}}/>}</View>)}
    </>}
    {destination === 'settings' && <SettingsView owner={user.id} profile={profile} busy={busy} onLogout={() => void logout()} onProfileChanged={() => void refresh()} />}
    <Text style={styles.subtitle}>Your record, not a diagnosis. StrandCue records cosmetic hair-care information.</Text>
  </Page>;
}
