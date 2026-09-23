import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import type { PassportRevision } from '../../../packages/domain/src/index';
import { supabase, secureStorage } from './client';
import { saveErrorMessage } from './contracts';
import { loadPassport, type PassportRecord } from './passport-api';
import { PassportEditor } from './passport-editor';
import { Services } from './services';
import { Activities } from './activities';
import { Shelf } from './shelf';
import { Tools } from './tools';
import { ExportScreen } from './screens/ExportScreen';
import { DeletionScreen } from './screens/DeletionScreen';
import { changeUsername, usernameErrorMessage } from './settings-api';
import { consentErrorMessage, consentPurposeLabel, listConsents, optionalPurposes, setConsent, type ConsentList, type ConsentPurpose } from './consent-api';
import { clearServiceDrafts } from './service-form';
import * as Crypto from 'expo-crypto';
import { Button, Field, Page, styles } from './ui';

const display = (value: unknown): string => {
  if (value === null || value === undefined) return 'Not recorded';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object') return Object.entries(value).map(([k,v])=>`${k}: ${display(v)}`).join(' · ');
  return String(value).replaceAll('-', ' ');
};
const fieldLabel = (value: string) => value.replace(/([A-Z])/g,' $1').replace(/^./,char=>char.toUpperCase());

function SettingsView({ owner, profile, busy, onLogout, onProfileChanged }: {
  owner: string; profile: { username: string }; busy: boolean; onLogout: () => void; onProfileChanged: () => void;
}) {
  const [section, setSection] = useState<'main' | 'username' | 'export' | 'delete' | 'privacy'>('main');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
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
    <DeletionScreen />
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
    setSaving(true); setMessage('');
    try {
      const receipt = await changeUsername(Crypto.randomUUID(), username);
      setMessage(`Username changed to @${receipt.username}.`);
      setUsername('');
      onProfileChanged();
    } catch (caught) {
      setMessage(usernameErrorMessage((caught as { message?: string })?.message ?? ''));
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
      {!!message && <Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
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
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'Passport'|'Services'|'Activities'|'Shelf'|'Tools'|'History'|'Settings'>('Passport');
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<PassportRevision|undefined>();
  const [username, setUsername] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(false);
  const [asOf, setAsOf] = useState('');
  const [historical, setHistorical] = useState<PassportRecord|null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const refresh = async () => {
    if (!mounted.current) return;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const response = await supabase!.from('profiles').select('username').maybeSingle();
      if (response.error) throw response.error;
      const next = response.data ? await loadPassport() : null;
      if (generation.current === request) {setProfile(response.data); setRecord(next);}
    } catch (caught) {if (generation.current === request) setError(saveErrorMessage(caught));}
    finally {if (generation.current === request) setLoading(false);}
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {void refresh(); return () => {++generation.current;};}, [user.id]);
  useEffect(() => { if (notice) setError(notice); }, [notice]);
  const finishSetup = async () => {
    if (!adult) {setError('You must be 18 or older to use StrandCue.'); return;}
    setBusy(true); setError('');
    try {const {error: issue} = await supabase!.rpc('complete_account',{p_username: username,p_eligible: adult});if(issue) throw issue; await refresh();}
    catch(caught) {if (mounted.current) setError(saveErrorMessage(caught));} finally {if (mounted.current) setBusy(false);}
  };
  const logout = async () => {
    setBusy(true); setError('');
    try {
      await secureStorage.removeItem(`strandcue-draft-${user.id}`);
      await clearServiceDrafts(secureStorage, user.id);
      const {error: issue} = await supabase!.auth.signOut({scope:'local'});
      if (issue) throw issue;
    } catch {if (mounted.current) setError('Sign out could not finish. Please try again before sharing this device.');}
    finally {if (mounted.current) setBusy(false);}
  };
  const viewHistory = async () => {
    setBusy(true); setError('');
    try { const next = await loadPassport(asOf); if (mounted.current) setHistorical(next); }
    catch (caught) { if (mounted.current) setError(saveErrorMessage(caught)); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (!user.email_confirmed_at) return <Page><Text style={styles.title}>Confirm your email.</Text><Text style={styles.body}>Open your confirmation email, then sign in again to begin your private record.</Text><Button title="Sign out" onPress={() => void logout()}/></Page>;
  if (loading) return <Page><Text style={styles.title}>Opening your record…</Text><Text style={styles.subtitle}>Bringing your saved information together.</Text></Page>;
  if (!profile) return <Page><Text style={styles.title}>Make it yours.</Text><View style={styles.card}><Text style={styles.body}>Choose a private username. Your email and username are never public profile listings.</Text><Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={24}/><Text style={styles.subtitle}>3–24 letters, numbers or underscores.</Text><Button title={adult ? '✓ I am 18 or older' : 'Confirm: I am 18 or older'} secondary onPress={() => setAdult(!adult)}/>{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<Button title={busy ? 'Saving…' : 'Create my private profile'} disabled={busy} onPress={() => void finishSetup()}/><Button title="Sign out" secondary disabled={busy} onPress={() => void logout()}/></View></Page>;
  const visible = historical ?? record;
  return <Page><View style={styles.row}>{(['Passport','Services','Activities','Shelf','Tools','History','Settings'] as const).map(name => <Button key={name} title={name} secondary={tab !== name} onPress={() => {setTab(name);setEditing(false);setTarget(undefined);}}/>)}</View>
    <Text style={styles.kicker}>PRIVATE · SOUTH AFRICA</Text><Text style={styles.title}>{tab === 'Passport' ? 'Your Hair Passport' : tab === 'Services' ? 'Your chemical services' : tab === 'Activities' ? 'Your activities' : tab === 'Shelf' ? 'My Shelf' : tab === 'Tools' ? 'My Tools' : tab === 'History' ? 'Every change has a story.' : 'Your account, your say.'}</Text>
    {!!error && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Retry loading" secondary onPress={() => void refresh()}/></View>}
    {tab === 'Services' && <Services owner={user.id} />}
    {tab === 'Activities' && <Activities owner={user.id} />}
    {tab === 'Shelf' && <Shelf owner={user.id} />}
    {tab === 'Tools' && <Tools owner={user.id} />}
    {tab === 'Passport' && !editing && <><Text style={styles.subtitle}>A picture of your hair, built from what you’ve recorded. It grows with you.</Text>
      {record ? <View style={styles.card}><Text style={styles.kicker}>CURRENT RECORD · {record.projection.asOf}</Text>{Object.entries(record.projection.values).map(([key,value]) => <View key={key}><Text style={styles.label}>{fieldLabel(key)}</Text><Text style={styles.body}>{display(value)}</Text></View>)}
        {Object.keys(record.projection.ambiguousFields).map(key => <View key={key} style={styles.notice}><Text style={styles.label}>{fieldLabel(key)}</Text><Text style={styles.body}>Dates overlap or are unknown. Review these entries in History to clarify which is current.</Text></View>)}
        <Button title="Record a change" onPress={() => {setEditing(true);setTarget(undefined);}}/>
      </View> : <View style={styles.card}><Text style={styles.heading}>Start with what you know.</Text><Text style={styles.body}>Hair pattern, how it feels, and what matters to you. “Unknown” is a useful answer too.</Text><Button title="Create my Hair Passport" onPress={() => setEditing(true)}/></View>}
      <View style={styles.notice}><Text style={styles.body}>A real change creates a new entry. To fix an earlier mistake, use History → Correct this entry.</Text></View></>}
    {editing && <PassportEditor key={target?.id ?? `edit-${record?.revision ?? 0}`} owner={user.id} record={record} target={target} onSaved={() => {setEditing(false);setTarget(undefined);setHistorical(null);void refresh();}} onCancel={() => {setEditing(false);setTarget(undefined);}}/>}
    {tab === 'History' && !editing && <>
      <View style={styles.card}><Text style={styles.heading}>Look back</Text><Field label="As-of date (YYYY-MM-DD)" value={asOf} onChangeText={setAsOf}/><Button title="View that date" secondary disabled={busy} onPress={() => void viewHistory()}/><Button title={audit ? 'Hide correction audit' : 'Show correction audit'} secondary onPress={() => setAudit(!audit)}/></View>
      {historical && <View style={styles.card}><Text style={styles.heading}>Recorded facts as of {historical.projection.asOf}</Text>{Object.entries(historical.projection.values).map(([key,value])=><Text key={key} style={styles.body}>{fieldLabel(key)}: {display(value)}</Text>)}{Object.keys(historical.projection.ambiguousFields).map(key=><Text key={key} style={styles.body}>{fieldLabel(key)}: uncertain at this date</Text>)}</View>}
      {!visible && <Text style={styles.body}>Your history begins with your first Passport entry.</Text>}
      {visible?.revisions.filter(entry=>audit || !visible.projection.supersededRevisionIds.includes(entry.id)).slice().reverse().map(entry => <View style={styles.card} key={entry.id}><Text style={styles.kicker}>{entry.kind === 'correction' ? 'CORRECTION' : entry.kind === 'baseline' ? 'FIRST RECORD' : 'CHANGE'} · {entry.effectiveDate.value ?? 'DATE UNKNOWN'}</Text><Text style={styles.subtitle}>{entry.source.replaceAll('-',' ')} · {entry.effectiveDate.precision} precision</Text>{Object.entries(entry.patch).map(([key,value])=><Text key={key} style={styles.body}>{fieldLabel(key)}: {display(value)}</Text>)}{'correctionReason' in entry && <Text style={styles.body}>Reason: {entry.correctionReason}</Text>}{!record?.projection.supersededRevisionIds.includes(entry.id) && <Button title="Correct this entry" secondary onPress={() => {setTarget(entry);setEditing(true);}}/>}</View>)}
    </>}
    {tab === 'Settings' && <SettingsView owner={user.id} profile={profile} busy={busy} onLogout={() => void logout()} onProfileChanged={() => void refresh()} />}
    <Text style={styles.subtitle}>Your record, not a diagnosis. StrandCue records cosmetic hair-care information.</Text>
  </Page>;
}
