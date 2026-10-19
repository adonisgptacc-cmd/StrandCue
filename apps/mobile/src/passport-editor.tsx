import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { DateOnlySchema, EffectiveDateSchema, PassportPatchSchema, PassportSchema, type PassportRevision } from '../../../packages/domain/src/index';
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
  damageObservation: ['none','mild','moderate','significant','unknown'],
  heatPreference: ['avoid-heat','minimise-heat','lower-heat-when-practical','no-preference','unknown'],
  budgetPreference: ['use-owned-first','cheapest-effective','best-value','mid-range','premium','no-preference'],
} as const;
const optionLabels: Record<string, Record<string, string>> = {
  damageObservation: {
    none: 'Nothing noticed', mild: 'Slightly dry or rough in places',
    moderate: 'Clearly dry, rough or breaking in places', significant: 'Widespread breakage or thinning',
    unknown: 'Not sure',
  },
  heatPreference: {
    'avoid-heat': 'I want to avoid heat styling', 'minimise-heat': 'I want to minimise heat styling',
    'lower-heat-when-practical': 'Lower heat when practical', 'no-preference': 'No heat preference',
    unknown: 'I am not sure yet',
  },
};

// The documented unreasonable-length bound mirrors packages/domain/src/passport.ts:
// one recorded length is at most 300 cm after converting inches with factor 2.54.
const MAX_LENGTH_CM = 300;

type MeasurementDraft = {unit: '' | 'cm' | 'in'; value: string; precision: '' | 'exact' | 'approximate' | 'unknown'; date: string; dateKnownNull: boolean};
const emptyMeasurement: MeasurementDraft = {unit: '', value: '', precision: '', date: '', dateKnownNull: false};

function measurementFrom(values: Record<string, unknown>): MeasurementDraft {
  const recorded = values.lengthMeasurement;
  if (recorded === null || recorded === undefined || typeof recorded !== 'object') return emptyMeasurement;
  const m = recorded as {value?: unknown; unit?: unknown; precision?: unknown; measuredOn?: unknown};
  // `date` drives the input; `dateKnownNull` carries the contract state so
  // an API-written explicit `measuredOn: null` survives an untouched save
  // (omitted and explicit null are distinct states).
  return {
    unit: m.unit === 'cm' || m.unit === 'in' ? m.unit : '',
    value: m.value === null || m.value === undefined ? '' : String(m.value),
    precision: m.precision === 'exact' || m.precision === 'approximate' || m.precision === 'unknown' ? m.precision : '',
    date: typeof m.measuredOn === 'string' ? m.measuredOn : '',
    dateKnownNull: m.measuredOn === null,
  };
}

function rebuildMeasurement(draft: MeasurementDraft): Record<string, unknown> | null | undefined {
  if (draft.unit !== '' && draft.value.trim() !== '') {
    return {
      value: Number(draft.value),
      unit: draft.unit,
      ...(draft.precision !== '' ? {precision: draft.precision} : {}),
      ...(draft.date.trim() !== '' ? {measuredOn: draft.date.trim()} : (draft.dateKnownNull ? {measuredOn: null} : {})),
    };
  }
  return undefined;
}

function measurementFailure(m: MeasurementDraft): string | null {
  const touched = m.unit !== '' || m.value.trim() !== '' || m.precision !== '' || m.date.trim() !== '';
  if (!touched) return null;
  if (m.unit === '' || m.value.trim() === '') {
    return 'Record a length with its unit (cm or inches) and its number value; a measurement date or precision alone is not a measurement.';
  }
  const value = Number(m.value);
  if (!Number.isFinite(value) || value <= 0) {
    return `Record the length as a positive number in ${m.unit === 'in' ? 'inches' : 'centimetres'}.`;
  }
  const centimetres = m.unit === 'cm' ? value : value * 2.54;
  if (centimetres > MAX_LENGTH_CM + 1e-9) {
    return 'Recorded length must be at most 300 cm after unit conversion.';
  }
  if (m.date !== '' && !DateOnlySchema.safeParse(m.date).success) {
    return 'Enter the measurement date as a real calendar day in YYYY-MM-DD form, or leave it empty.';
  }
  if (m.date !== '' && m.date > today()) {
    // A self-measured length cannot be observed in the future; the domain
    // contract rejects the same payloads.
    return 'A measured length cannot be dated after today.';
  }
  return null;
}

const fieldHeadings: Record<string, string> = {
  naturalPattern: 'Natural pattern', strandDiameter: 'Strand diameter', density: 'Density', porosity: 'Porosity',
  greyStatus: 'Grey status', damageObservation: 'Damage you notice', heatPreference: 'Heat preference',
  budgetPreference: 'Budget preference', goals: 'Goals', concerns: 'Concerns',
  lengthMeasurement: 'Length measurement', lengthCm: 'Length in centimetres',
  reactionsAvoidances: 'Known reactions or avoidances', maximumProductBudgetZar: 'Maximum budget per product', notes: 'Notes',
};

// The conflict-review panel speaks these strings to screen readers, so they
// must never surface raw JSON or internal identifiers.
function humanizeKey(key: string): string {
  return fieldHeadings[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function humanizeValue(key: string, raw: unknown): string {
  if (raw === null) return 'removed';
  if (raw !== null && typeof raw === 'object' && 'unit' in (raw as Record<string, unknown>) && 'value' in (raw as Record<string, unknown>)) {
    const m = raw as {value: number; unit: string; precision?: string; measuredOn?: string};
    const parts: string[] = [`${m.value} ${m.unit === 'in' ? 'inches' : 'centimetres'}`];
    if (m.precision === 'exact') parts.push('exact');
    if (m.precision === 'approximate') parts.push('approximate');
    if (typeof m.measuredOn === 'string') parts.push(`measured on ${m.measuredOn}`);
    return parts.join(', ');
  }
  if (Array.isArray(raw)) return raw.map((entry) => humanizeValue(key, entry)).join(', ');
  if (typeof raw === 'object') return 'as recorded';
  const text = typeof raw === 'string' ? raw : String(raw);
  return optionLabels[key]?.[text] ?? text.replaceAll('-', ' ');
}

function describeValues(values: Record<string, unknown> | undefined): string {
  if (!values) return 'none';
  return Object.entries(values).map(([key, value]) => `${humanizeKey(key)}: ${humanizeValue(key, value)}`).join('; ');
}

export function PassportEditor({owner, record, target, onSaved, onCancel}: {
  owner: string; record: PassportRecord|null; target?: PassportRevision; onSaved: () => void; onCancel: () => void;
}) {
  const [before, setBefore] = useState<Record<string, unknown>>(target?.patch ?? record?.projection.values ?? defaults);
  const [baseRecord, setBaseRecord] = useState(record);
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<PassportRecord|null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({...before});
  const [measurement, setMeasurement] = useState<MeasurementDraft>(() => measurementFrom(target?.patch ?? record?.projection.values ?? defaults));
  const [precision, setPrecision] = useState(target?.effectiveDate.precision ?? 'day');
  const [date, setDate] = useState(target?.effectiveDate.value ?? today());
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string|null>(null);
  const [lockedCommand, setLockedCommand] = useState<SaveCommand|null>(null);
  const command = useRef<SaveCommand|null>(null);
  const submitting = useRef(false);
  const locked = lockedCommand !== null;
  const draftKey = `strandcue-draft-${owner}`;
  // Pure per-render validation so the length error can also render in place,
  // beside the measurement fields, not only as a bottom alert.
  const lengthError = measurementFailure(measurement);
  useEffect(() => {let mounted = true; void secureStorage.getItem(draftKey).then(value => {if (mounted) setPendingDraft(value);}).catch(() => {if(mounted) setMessage('The previous device draft could not be read.');}); return () => {mounted = false;};}, [draftKey]);
  // A legacy centimetre number can live in the state this screen edits (the
  // corrected patch) or in the record's current projection; either way the
  // same save must retire it before a new measurement can be recorded.
  const legacyRecorded = typeof before.lengthCm === 'number'
    || typeof baseRecord?.projection.values.lengthCm === 'number';
  const hasMeasurementDraft = measurement.unit !== '' || measurement.value.trim() !== '' || measurement.precision !== '' || measurement.date.trim() !== '';
  const canClearMeasurement = hasMeasurementDraft || before.lengthMeasurement != null;
  const update = (key: string, value: unknown) => {if (!command.current) setForm(current => ({...current, [key]: value}));};
  const remove = (key: string) => {if (!command.current) setForm(current => {const next = {...current}; delete next[key]; return next;});};
  const recordMeasurement = (draft: MeasurementDraft) => {
    setMeasurement(draft);
    if (!command.current) {
      // Derive the touched check from the draft itself, not the render
      // closure's stale snapshot: the updater must see the state the user
      // just produced.
      const draftTouched = draft.unit !== '' || draft.value.trim() !== '' || draft.precision !== '' || draft.date.trim() !== '' || draft.dateKnownNull;
      setForm(current => {
        const next = {...current};
        const rebuilt = rebuildMeasurement(draft);
        if (rebuilt !== undefined) {
          next.lengthMeasurement = rebuilt;
          if (legacyRecorded) next.lengthCm = null;
        } else if (current.lengthMeasurement === undefined ? draftTouched : true) {
          // Partial or emptied draft: stop sending an outdated measurement.
          next.lengthMeasurement = null;
        }
        return next;
      });
    }
  };
  const submit = async () => {
    if (submitting.current) return;
    if (!command.current) {
      if (lengthError) {setMessage(lengthError);return;}
      const working = {...form};
      const rebuilt = rebuildMeasurement(measurement);
      if (rebuilt !== undefined) {
        working.lengthMeasurement = rebuilt;
        if (legacyRecorded) working.lengthCm = null;
      }
      // The SQL validator refuses any new numeric `lengthCm` write; the
      // screen answers with the retirement guidance instead of a save the
      // record must reject.
      if (typeof working.lengthCm === 'number') {
        setMessage('Record your next length below to retire the old centimetre entry in the same save.');
        return;
      }
      const patch = target ? PassportPatchSchema.safeParse(working) : baseRecord ? PassportPatchSchema.safeParse(changedFields(before, working)) : PassportSchema.safeParse(working);
      const effective = EffectiveDateSchema.safeParse({precision, value: precision === 'unknown' ? null : date});
      if (!patch.success || !effective.success || (target && !reason.trim())) {setMessage('Check the fields and date. Choose at least one change, and explain a correction. Unknown is always a valid choice.');return;}
      const nextCommand: SaveCommand = {p_operation_id: Crypto.randomUUID(), p_expected_revision: baseRecord?.revision ?? 0,
        p_kind: target ? 'correction' : baseRecord ? 'change' : 'baseline', p_effective_date: effective.data, p_patch: patch.data,
        ...(target ? {p_corrects_id: target.id, p_correction_reason: reason.trim()} : {}),
      };
      command.current = nextCommand;
      setLockedCommand(nextCommand);
    }
    submitting.current = true;
    setBusy(true); setMessage('');
    try {
      await secureStorage.setItem(draftKey, JSON.stringify(command.current));
      await savePassport(command.current);
      await secureStorage.removeItem(draftKey);
      onSaved();
    } catch (error) {setConflict(String((error as {message?: string})?.message).includes('revision-conflict')); setMessage(saveErrorMessage(error));}
    finally {submitting.current = false; setBusy(false);}
  };
  const retryDraft = async () => {
    if (!pendingDraft) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(pendingDraft) as SaveCommand;
      if (!parsed.p_operation_id || !Number.isInteger(parsed.p_expected_revision)) throw new Error('Invalid draft');
      command.current = parsed;
      setLockedCommand(parsed);
      setForm(current => {const next = reviewRebase(current, parsed.p_patch); return next;});
      if ('lengthMeasurement' in parsed.p_patch) {
        setMeasurement(parsed.p_patch.lengthMeasurement == null ? emptyMeasurement : measurementFrom({...defaults, lengthMeasurement: parsed.p_patch.lengthMeasurement}));
      }
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
      if ('lengthMeasurement' in submitted.p_patch) {
        setMeasurement(submitted.p_patch.lengthMeasurement == null ? emptyMeasurement : measurementFrom({...defaults, lengthMeasurement: submitted.p_patch.lengthMeasurement}));
      }
      setPrecision(submitted.p_effective_date.precision as typeof precision); setDate(submitted.p_effective_date.value ?? '');
      setReason(submitted.p_correction_reason ?? '');
      command.current = null; setLockedCommand(null); setPendingDraft(null); setConflict(false); setReview(null);
      setMessage('Your submitted fields are retained below. Review and save when ready.');
    } catch {setMessage('Could not prepare the revised draft. Your original save is retained.');}
    finally {setBusy(false);}
  };
  return <View style={styles.card}><Text style={styles.heading}>{target ? 'Correct a mistake' : record ? 'Record a change' : 'Meet your Hair Passport'}</Text>
    <Text style={styles.subtitle}>{target ? 'Replace this entry’s facts. The original stays in your private correction audit.' : 'Record what you know today. You can leave optional details unanswered.'}</Text>
    {pendingDraft && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.body}>A previous save was not confirmed. Retry the same save to avoid a duplicate.</Text><Button title="Retry previous save" disabled={busy} onPress={() => void retryDraft()}/><Button title="Discard device draft" secondary disabled={busy} onPress={() => {void secureStorage.removeItem(draftKey).then(()=>setPendingDraft(null)).catch(()=>setMessage('Could not remove the draft.'));}}/></View>}
    {locked && !conflict && <Text accessibilityRole="alert" style={styles.body}>The save is locked for a safe retry.</Text>}
    {conflict && <Button title="Load latest record for review" secondary disabled={busy} onPress={() => void reloadForReview()}/>}
    {review && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.heading}>Review version {review.revision}</Text><Text style={styles.body}>Latest recorded values: {describeValues(review.projection.values)}</Text><Text style={styles.body}>Your submitted fields: {describeValues(lockedCommand?.p_patch)}</Text><Text style={styles.body}>Uncertain fields: {Object.keys(review.projection.ambiguousFields).map(humanizeKey).join(', ') || 'None'}</Text><Button title="Keep my submitted fields and review form" disabled={busy} onPress={() => void acceptReview()}/></View>}
    <View pointerEvents={locked ? 'none' : 'auto'} style={{gap: 20}}>
      {legacyRecorded && <View style={styles.notice}><Text style={styles.body}>An earlier entry kept {String(before.lengthCm)} centimetres, written before this screen changed. It stays readable in your history; recording your next length below retires that old entry in the same save.</Text></View>}
      {Object.entries(options).map(([field, values]) => field === 'heatPreference'
        ? <View key={field}>
            <Choice label="Heat preference" value={String(form[field] ?? '')} options={values} labels={optionLabels[field]} onChange={value => update(field, value)}/>
            <Text style={styles.body}>Heat styling preference is your personal choice, not a safety rule.</Text>
          </View>
        : field === 'damageObservation'
          ? <View key={field}>
              <Choice label="Damage you notice" value={String(form[field] ?? '')} options={values} labels={optionLabels[field]} onChange={value => update(field, value)}/>
              <Text style={styles.body}>Self-reported cosmetics only, not a diagnosis. Identifiers never imply a measured severity.</Text>
            </View>
          : <Choice key={field} label={field.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase())} value={String(form[field] ?? '')} options={values} onChange={value => update(field, value)}/>)}
      <MultiChoice label="Goals" value={(form.goals as string[]|undefined) ?? []} options={['shine','length-retention','definition','moisture-retention','reduced-frizz','manageability','volume','none','unknown']} onChange={value => update('goals',value)}/>
      <MultiChoice label="Concerns" value={(form.concerns as string[]|undefined) ?? []} options={['dryness','frizz','tangling','breakage','split-ends','stiffness','dullness','scalp-dryness','scalp-oiliness','shedding-or-thinning','reported-damage','none','unknown']} onChange={value => update('concerns',value)}/>
      <Field label="Maximum budget per product (ZAR, optional)" keyboardType="decimal-pad" value={form.maximumProductBudgetZar == null ? '' : String(form.maximumProductBudgetZar)} onChangeText={value => update('maximumProductBudgetZar',value.trim() === '' ? null : Number(value))}/>
      <Choice label="Length unit" value={measurement.unit} options={['cm','in']} onChange={unit => recordMeasurement({...measurement, unit: unit as MeasurementDraft['unit']})}/>
      {measurement.unit !== '' && <Field
        label={`Your length in ${measurement.unit === 'in' ? 'inches' : 'centimetres'} (self-measured, optional)`}
        keyboardType="decimal-pad" value={measurement.value}
        onChangeText={value => recordMeasurement({...measurement, value})}/>}
      {measurement.unit !== '' && <Choice label="Length precision" value={measurement.precision} options={['exact','approximate','unknown']} onChange={value => recordMeasurement({...measurement, precision: value as MeasurementDraft['precision']})}/>}
      {measurement.unit !== '' && <Field label="Length measured on (YYYY-MM-DD, optional)" value={measurement.date} onChangeText={value => recordMeasurement({...measurement, date: value, dateKnownNull: value === ''})} placeholder="2026-09-10"/>}
      {canClearMeasurement && <Button title="Remove this length measurement" secondary disabled={busy} onPress={() => {setMeasurement(emptyMeasurement); update('lengthMeasurement', null);}}/>}
      {measurement.unit !== '' && lengthError && <Text style={styles.error}>{lengthError}</Text>}
      <Field label="Known reactions or avoidances (comma separated, optional)" value={(form.reactionsAvoidances as string[]|undefined)?.join(', ') ?? ''} onChangeText={value => {const parts = value.split(',').map(part => part.trim()).filter(Boolean); if (parts.length === 0) remove('reactionsAvoidances'); else update('reactionsAvoidances', parts);}} maxLength={1000}/>
      <View>
        <Field label="Notes (optional, avoid identifying details)" multiline value={String(form.notes ?? '')} onChangeText={value => update('notes',value)} maxLength={2000}/>
        <Text style={styles.body}>{`${String(form.notes ?? '').length}/2000 characters`}</Text>
      </View>
      <Choice label="When did this become true?" value={precision} options={['day','month','year','unknown']} onChange={value => {setPrecision(value as typeof precision);setDate('');}}/>
      {precision !== 'unknown' && <Field label={precision === 'day' ? 'Date (YYYY-MM-DD)' : precision === 'month' ? 'Month (YYYY-MM)' : 'Year (YYYY)'} value={date} onChangeText={setDate} placeholder={precision === 'day' ? '2026-09-10' : precision === 'month' ? '2026-09' : '2026'}/>}
      {target && <Field label="Why are you correcting this?" value={reason} onChangeText={setReason} maxLength={500}/>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : locked ? 'Retry this save' : 'Save to my record'} disabled={busy || !!pendingDraft || conflict} onPress={() => void submit()}/>
    <Button title="Cancel" secondary disabled={busy} onPress={onCancel}/>
  </View>;
}
