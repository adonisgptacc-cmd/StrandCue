import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { EffectiveDateSchema, PassportPatchSchema, PassportSchema, type PassportRevision } from '../../../packages/domain/src/index';
import { changedFields, reviewRebase, saveErrorMessage } from './contracts';
import { secureStorage } from './client';
import { loadPassport, savePassport, type PassportRecord, type SaveCommand } from './passport-api';
import { Button, Choice, MultiChoice, Field, styles } from './ui';

const defaults = {naturalPattern: 'unknown', strandDiameter: 'unknown', density: 'unknown', concerns: ['unknown'], goals: ['unknown'], budgetPreference: 'no-preference'};
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const options = {
  naturalPattern: ['straight','wavy','curly','coily','mixed','unknown'],
  strandDiameter: ['fine','medium','coarse','unknown'], density: ['low','medium','high','unknown'],
  porosity: ['low','medium','high','unknown'], greyStatus: ['none','some','mostly','all','unknown'],
  budgetPreference: ['use-owned-first','cheapest-effective','best-value','mid-range','premium','no-preference'],
} as const;
export function PassportEditor({owner, record, target, onSaved, onCancel}: {
  owner: string; record: PassportRecord|null; target?: PassportRevision; onSaved: () => void; onCancel: () => void;
}) {
  const [before, setBefore] = useState<Record<string, unknown>>(target?.patch ?? record?.projection.values ?? defaults);
  const [baseRecord, setBaseRecord] = useState(record);
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<PassportRecord|null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({...before});
  const [precision, setPrecision] = useState(target?.effectiveDate.precision ?? 'day');
  const [date, setDate] = useState(target?.effectiveDate.value ?? today());
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string|null>(null);
  const command = useRef<SaveCommand|null>(null);
  const locked = command.current !== null;
  const draftKey = `strandcue-draft-${owner}`;
  useEffect(() => {let mounted = true; void secureStorage.getItem(draftKey).then(value => {if (mounted) setPendingDraft(value);}).catch(() => {if(mounted) setMessage('The previous device draft could not be read.');}); return () => {mounted = false;};}, [draftKey]);
  const update = (key: string, value: unknown) => {if (!locked) setForm(current => ({...current, [key]: value}));};
  const submit = async () => {
    if (!command.current) {
      const patch = target ? PassportPatchSchema.safeParse(form) : baseRecord ? PassportPatchSchema.safeParse(changedFields(before, form)) : PassportSchema.safeParse(form);
      const effective = EffectiveDateSchema.safeParse({precision, value: precision === 'unknown' ? null : date});
      if (!patch.success || !effective.success || (target && !reason.trim())) {setMessage('Check the fields and date. Choose at least one change, and explain a correction. Unknown is always a valid choice.');return;}
      command.current = {p_operation_id: Crypto.randomUUID(), p_expected_revision: baseRecord?.revision ?? 0,
        p_kind: target ? 'correction' : baseRecord ? 'change' : 'baseline', p_effective_date: effective.data, p_patch: patch.data,
        ...(target ? {p_corrects_id: target.id, p_correction_reason: reason.trim()} : {}),
      };
    }
    setBusy(true); setMessage('');
    try {
      await secureStorage.setItem(draftKey, JSON.stringify(command.current));
      await savePassport(command.current);
      await secureStorage.removeItem(draftKey);
      onSaved();
    } catch (error) {setConflict(String((error as {message?: string})?.message).includes('revision-conflict')); setMessage(saveErrorMessage(error));}
    finally {setBusy(false);}
  };
  const retryDraft = async () => {
    if (!pendingDraft) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(pendingDraft) as SaveCommand;
      if (!parsed.p_operation_id || !Number.isInteger(parsed.p_expected_revision)) throw new Error('Invalid draft');
      command.current = parsed;
      setForm(current => reviewRebase(current, parsed.p_patch));
      await savePassport(parsed); await secureStorage.removeItem(draftKey); onSaved();
    } catch (error) {setConflict(String((error as {message?: string})?.message).includes('revision-conflict')); setMessage(saveErrorMessage(error));}
    finally {setBusy(false);}
  };
  const reloadForReview = async () => {
    setBusy(true);
    try {const latest = await loadPassport(); if (!latest) throw new Error('missing record'); setReview(latest);}
    catch {setMessage('The latest record could not be loaded. Your input is still here.');}
    finally {setBusy(false);}
  };
  const acceptReview = async () => {
    if (!review || !command.current) return;
    const submitted = command.current;
    if (submitted.p_kind === 'correction' && review.projection.supersededRevisionIds.includes(submitted.p_corrects_id!)) {
      setMessage('This entry has already been corrected. Your draft is retained; return to history and select the current replacement.'); return;
    }
    setBusy(true);
    try {
      await secureStorage.removeItem(draftKey);
      setBefore(review.projection.values); setBaseRecord(review);
      setForm(submitted.p_kind === 'correction' ? submitted.p_patch : reviewRebase(review.projection.values, submitted.p_patch));
      setPrecision(submitted.p_effective_date.precision as typeof precision); setDate(submitted.p_effective_date.value ?? '');
      setReason(submitted.p_correction_reason ?? '');
      command.current = null; setPendingDraft(null); setConflict(false); setReview(null);
      setMessage('Your submitted fields are retained below. Review and save when ready.');
    } catch {setMessage('Could not prepare the revised draft. Your original save is retained.');}
    finally {setBusy(false);}
  };
  return <View style={styles.card}><Text style={styles.heading}>{target ? 'Correct a mistake' : record ? 'Record a change' : 'Meet your Hair Passport'}</Text>
    <Text style={styles.subtitle}>{target ? 'Replace this entry’s facts. The original stays in your private correction audit.' : 'Record what you know today. You can leave optional details unanswered.'}</Text>
    {pendingDraft && <View style={styles.notice}><Text style={styles.body}>A previous save was not confirmed. Retry the same save to avoid a duplicate.</Text><Button title="Retry previous save" disabled={busy} onPress={() => void retryDraft()}/><Button title="Discard device draft" secondary disabled={busy} onPress={() => {void secureStorage.removeItem(draftKey).then(()=>setPendingDraft(null)).catch(()=>setMessage('Could not remove the draft.'));}}/></View>}
    {locked && !conflict && <Text style={styles.body}>The save is locked for a safe retry.</Text>}
    {conflict && <Button title="Load latest record for review" secondary disabled={busy} onPress={() => void reloadForReview()}/>}
    {review && <View style={styles.notice}><Text style={styles.heading}>Review version {review.revision}</Text><Text style={styles.body}>Latest recorded values: {JSON.stringify(review.projection.values)}</Text><Text style={styles.body}>Your submitted fields: {JSON.stringify(command.current?.p_patch)}</Text><Text style={styles.body}>Uncertain fields: {Object.keys(review.projection.ambiguousFields).join(', ') || 'None'}</Text><Button title="Keep my submitted fields and review form" disabled={busy} onPress={() => void acceptReview()}/></View>}
    <View pointerEvents={locked ? 'none' : 'auto'} style={{gap: 20}}>
      {Object.entries(options).map(([field, values]) => <Choice key={field} label={field.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase())} value={String(form[field] ?? '')} options={values} onChange={value => update(field, value)}/>)}
      <MultiChoice label="Goals" value={(form.goals as string[]|undefined) ?? []} options={['shine','length-retention','definition','moisture-retention','reduced-frizz','manageability','volume','none','unknown']} onChange={value => update('goals',value)}/>
      <MultiChoice label="Concerns" value={(form.concerns as string[]|undefined) ?? []} options={['dryness','frizz','tangling','breakage','split-ends','stiffness','dullness','scalp-dryness','scalp-oiliness','shedding-or-thinning','reported-damage','none','unknown']} onChange={value => update('concerns',value)}/>
      <Field label="Maximum budget per product (ZAR, optional)" keyboardType="decimal-pad" value={form.maximumProductBudgetZar == null ? '' : String(form.maximumProductBudgetZar)} onChangeText={value => update('maximumProductBudgetZar',value.trim() === '' ? null : Number(value))}/>
      <Field label="Notes (optional, avoid identifying details)" multiline value={String(form.notes ?? '')} onChangeText={value => update('notes',value)} maxLength={2000}/>
      <Choice label="When did this become true?" value={precision} options={['day','month','year','unknown']} onChange={value => {setPrecision(value as typeof precision);setDate('');}}/>
      {precision !== 'unknown' && <Field label={precision === 'day' ? 'Date (YYYY-MM-DD)' : precision === 'month' ? 'Month (YYYY-MM)' : 'Year (YYYY)'} value={date} onChangeText={setDate} placeholder={precision === 'day' ? '2026-09-10' : precision === 'month' ? '2026-09' : '2026'}/>}
      {target && <Field label="Why are you correcting this?" value={reason} onChangeText={setReason} maxLength={500}/>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : locked ? 'Retry this save' : 'Save to my record'} disabled={busy || !!pendingDraft || conflict} onPress={() => void submit()}/>
    <Button title="Cancel" secondary disabled={busy} onPress={onCancel}/>
  </View>;
}
