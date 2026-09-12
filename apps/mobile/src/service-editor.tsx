import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  ObserveServiceCommandSchema, ServiceTypeSchema, ServiceRegionSchema, ServiceSegmentSchema,
  type EffectiveDate, type ServiceFacts, type ServiceObservation, type ServiceType,
} from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import { correctService, loadService, observeService, recordService, type ServiceDetail } from './services-api';
import {
  buildCorrectionCommand, buildCreateServiceCommand, addZone, removeZone, replaceZone,
  removeServiceDraft, retainCorrectionFacts, serviceDateLabel, serviceEditorCopy,
  submitServiceDraft, type ServiceDraft, type ServiceEditorMode,
} from './service-form';
import { Button, Choice, Field, styles } from './ui';

export type EditableServiceFacts = Omit<ServiceFacts, 'serviceType'> & { serviceType: ServiceType | '' };
const unknownDate: EffectiveDate = { precision: 'unknown', value: null };
const emptyFacts: EditableServiceFacts = { serviceType: '', occurredOn: unknownDate, zones: [{ region: 'unknown', segment: 'unknown' }] };
const unknownObservation: ServiceObservation = { observedOn: unknownDate, effectStatus: 'unknown' };
const words = (value: string) => value.replaceAll('-', ' ');

function DateFields({ label, value, disabled, onChange }: { label: string; value: EffectiveDate; disabled: boolean; onChange: (date: EffectiveDate) => void }) {
  return <View style={{ gap: 12 }}>
    <Choice label={`${label} precision`} value={value.precision} options={['day', 'month', 'year', 'unknown']} disabled={disabled}
      onChange={precision => onChange({ precision, value: precision === 'unknown' ? null : '' } as EffectiveDate)} />
    {value.precision !== 'unknown' && <Field label={`${label} (${value.precision === 'day' ? 'YYYY-MM-DD' : value.precision === 'month' ? 'YYYY-MM' : 'YYYY'})`}
      value={value.value} editable={!disabled} onChangeText={date => onChange({ ...value, value: date })} />}
  </View>;
}

export function ServiceObservationFields({ observation, disabled, onChange }: {
  observation: ServiceObservation; disabled: boolean; onChange: (value: ServiceObservation) => void;
}) {
  return <View style={{ gap: 16 }}>
    <Text style={styles.body}>This observation records what you know about the effect on a separate date.</Text>
    <Choice label="Effect presence" value={observation.effectStatus} options={['present', 'not-present', 'unknown']} disabled={disabled}
      onChange={value => onChange({ ...observation, effectStatus: value as ServiceObservation['effectStatus'] })} />
    <DateFields label="Observation date" value={observation.observedOn} disabled={disabled} onChange={observedOn => onChange({ ...observation, observedOn })} />
  </View>;
}

export function ServiceOccurrenceFields({ facts, disabled, onChange, onError = () => undefined }: {
  facts: EditableServiceFacts; disabled: boolean; onChange: (value: EditableServiceFacts) => void; onError?: (message: string) => void;
}) {
  const update = (patch: Partial<EditableServiceFacts>) => { if (!disabled) onChange({ ...facts, ...patch }); };
  const changeZones = (action: () => readonly ServiceFacts['zones'][number][]) => {
    try { update({ zones: [...action()] }); }
    catch { onError('Choose a different region and segment pair. Keep at least one zone.'); }
  };
  return <View style={{ gap: 20 }}>
    <Choice label="Service type" value={facts.serviceType} options={ServiceTypeSchema.options} disabled={disabled}
      onChange={serviceType => update({ serviceType: serviceType as ServiceType })} />
    {facts.serviceType === 'other' && <Field label="Other service name" value={facts.otherLabel ?? ''} editable={!disabled} maxLength={100} onChangeText={otherLabel => update({ otherLabel })} />}
    <DateFields label="Occurrence date" value={facts.occurredOn} disabled={disabled} onChange={occurredOn => update({ occurredOn })} />
    <Field label="Product or system (optional)" value={facts.productOrSystem ?? ''} editable={!disabled} maxLength={200} onChangeText={productOrSystem => update({ productOrSystem: productOrSystem || null })} />
    <Text style={styles.body}>A service name does not establish its chemistry. Record only details you know.</Text>
    {facts.zones.map((zone, index) => <View key={index} style={{ gap: 12 }}>
      <Choice label={`Zone ${index + 1} region`} value={zone.region} options={ServiceRegionSchema.options} disabled={disabled}
        onChange={region => changeZones(() => replaceZone(facts.zones, zone, { ...zone, region: region as typeof zone.region }))} />
      <Choice label={`Zone ${index + 1} segment`} value={zone.segment} options={ServiceSegmentSchema.options} disabled={disabled}
        onChange={segment => changeZones(() => replaceZone(facts.zones, zone, { ...zone, segment: segment as typeof zone.segment }))} />
      <Button title={`Remove zone ${index + 1}`} secondary disabled={disabled || facts.zones.length === 1} onPress={() => changeZones(() => removeZone(facts.zones, zone))} />
    </View>)}
    <Button title="Add region and segment zone" secondary disabled={disabled || facts.zones.length >= 36} onPress={() => changeZones(() => addZone(facts.zones, { region: 'unknown', segment: 'unknown' }))} />
    <Choice label="Include reported heat details" value={facts.heat ? 'yes' : 'no'} options={['no', 'yes']} disabled={disabled}
      onChange={value => update({ heat: value === 'yes' ? { method: 'unknown', source: 'user-reported' } : null })} />
    {facts.heat && <View style={{ gap: 16 }}>
      <Choice label="Reported heat method" value={facts.heat.method} options={['flat-iron', 'blow-dryer', 'hood-dryer', 'other', 'unknown']} disabled={disabled}
        onChange={method => update({ heat: { ...facts.heat!, method: method as NonNullable<ServiceFacts['heat']>['method'] } })} />
      <Choice label="Heat information source" value={facts.heat.source} options={['user-reported', 'user-estimated']} disabled={disabled}
        onChange={source => update({ heat: { ...facts.heat!, source: source as 'user-reported' | 'user-estimated' } })} />
      {(['temperatureC', 'passes', 'durationMinutes'] as const).map(name => <Field key={name}
        label={{ temperatureC: 'Reported temperature (°C, optional)', passes: 'Reported passes (optional)', durationMinutes: 'Reported duration (minutes, optional)' }[name]}
        keyboardType="decimal-pad" value={facts.heat![name] == null ? '' : String(facts.heat![name])} editable={!disabled}
        onChangeText={value => update({ heat: { ...facts.heat!, [name]: value.trim() ? Number(value) : null } })} />)}
    </View>}
    <Field label="Service notes (optional, avoid identifying details)" value={facts.notes ?? ''} editable={!disabled} multiline maxLength={2000} onChangeText={notes => update({ notes })} />
  </View>;
}

export function ServiceFactsView({ facts }: { facts: ServiceFacts }) {
  return <View style={{ gap: 10 }}>
    <Text style={styles.heading}>{facts.serviceType === 'other' ? facts.otherLabel : words(facts.serviceType)}</Text>
    <Text style={styles.body}>{serviceDateLabel(facts.occurredOn)}</Text>
    <Text style={styles.body}>Product or system: {facts.productOrSystem || 'Unknown'}</Text>
    <Text style={styles.body}>Chemistry unknown; the service name alone does not identify it.</Text>
    {facts.zones.map(zone => <Text key={`${zone.region}:${zone.segment}`} style={styles.body}>{words(zone.region)} · {words(zone.segment)}</Text>)}
    {facts.heat ? <>
      <Text style={styles.body}>Heat method: {words(facts.heat.method)} · {words(facts.heat.source)}</Text>
      <Text style={styles.body}>Temperature: {facts.heat.temperatureC == null ? 'Unknown' : `${facts.heat.temperatureC} °C`}</Text>
      <Text style={styles.body}>Passes: {facts.heat.passes ?? 'Unknown'} · Duration: {facts.heat.durationMinutes == null ? 'Unknown' : `${facts.heat.durationMinutes} minutes`}</Text>
    </> : <Text style={styles.body}>Heat details unknown</Text>}
    {!!facts.notes && <Text style={styles.body}>Notes: {facts.notes}</Text>}
  </View>;
}

async function sendDraft(draft: ServiceDraft) {
  if (draft.mode === 'add') return recordService(draft.command);
  if (draft.mode === 'correction') return correctService(draft.command);
  return observeService(draft.command);
}

export async function loadServiceConflict<T>(
  serviceId: string,
  loader: (id: string) => Promise<T | null>,
): Promise<{ latest: T | null; message: string }> {
  try {
    const latest = await loader(serviceId);
    return latest
      ? { latest, message: '' }
      : { latest: null, message: 'This service could not be found. Your draft is retained.' };
  } catch {
    return { latest: null, message: 'The latest entry could not be loaded. Your submitted facts are still here.' };
  }
}

export function ServiceEditor({ owner, mode, detail, resume, onSaved, onCancel }: {
  owner: string; mode: ServiceEditorMode; detail?: ServiceDetail; resume?: ServiceDraft;
  onSaved: () => void; onCancel: () => void;
}) {
  const [identity, setIdentity] = useState(() => ({ operationId: resume?.command.operationId ?? Crypto.randomUUID(), serviceId: resume?.command.serviceId ?? detail?.serviceId ?? Crypto.randomUUID() }));
  const [facts, setFacts] = useState<EditableServiceFacts>(() => resume && resume.mode !== 'observation' ? resume.command.facts : detail?.facts ?? emptyFacts);
  const [observation, setObservation] = useState<ServiceObservation>(() => resume?.mode === 'observation' ? resume.command.observation : resume?.mode === 'add' ? resume.command.initialObservation ?? unknownObservation : unknownObservation);
  const [includeObservation, setIncludeObservation] = useState(resume?.mode === 'add' && !!resume.command.initialObservation);
  const [reason, setReason] = useState(resume?.mode === 'correction' ? resume.command.reason : '');
  const [base, setBase] = useState(detail);
  const [pending, setPending] = useState<ServiceDraft | null>(resume ?? null);
  const [latest, setLatest] = useState<ServiceDetail | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [owner]);
  const locked = pending !== null || busy;
  const copy = serviceEditorCopy(mode);

  const submit = async () => {
    if (inFlight.current) return;
    let draft = pending;
    try {
      if (!draft) {
        // Only the Other name is conditional; changing service type never fills facts.
        const completeFacts = { ...facts, otherLabel: facts.serviceType === 'other' ? facts.otherLabel : null };
        if (mode === 'add') draft = { mode, command: buildCreateServiceCommand(identity.operationId, identity.serviceId, completeFacts, includeObservation ? observation : undefined) };
        else if (mode === 'correction' && base) draft = { mode, command: buildCorrectionCommand(identity.operationId, identity.serviceId, base.revision, base.revisionId, reason, completeFacts) };
        else if (mode === 'observation') draft = { mode, command: ObserveServiceCommandSchema.parse({ ...identity, observation }) };
        else throw new Error('Missing service');
      }
    } catch { setMessage('Check the service type, dates, zones and reported heat values. Other services need a name; corrections need a reason. Unknown dates and heat are valid.'); return; }
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    try {
      await submitServiceDraft(secureStorage, owner, draft, sendDraft, () => alive.current);
      if (alive.current) onSaved();
    } catch (error) {
      if (!alive.current) return;
      const isConflict = String((error as { message?: string })?.message).includes('revision-conflict');
      setConflict(isConflict);
      if (isConflict) {
        setMessage('This service changed elsewhere. Your submitted facts are retained while the current entry loads.');
        const result = await loadServiceConflict(identity.serviceId, loadService);
        if (!alive.current) return;
        setLatest(result.latest);
        setMessage(result.message || 'The current entry is loaded below. Review it before discarding the failed attempt.');
      } else {
        setMessage('The save was not confirmed. Your command is locked for an identical retry.');
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };

  const loadLatest = async () => {
    setBusy(true); setMessage('');
    const result = await loadServiceConflict(identity.serviceId, loadService);
    if (alive.current) { setLatest(result.latest); setMessage(result.message); setBusy(false); }
  };
  const discard = async (review: boolean) => {
    setBusy(true); setMessage('');
    try {
      await removeServiceDraft(secureStorage, owner, identity.serviceId);
      if (!alive.current) return;
      if (review && latest && pending?.mode === 'correction') {
        setFacts(retainCorrectionFacts(pending.command)); setBase(latest);
        setIdentity(current => ({ ...current, operationId: Crypto.randomUUID() }));
        setPending(null); setConflict(false); setLatest(null);
        setMessage('The failed attempt was discarded. Your complete submitted facts are retained below. Review them before saving a new correction.');
      } else onCancel();
    } catch { if (alive.current) setMessage('The device draft could not be removed. Please try again.'); }
    finally { if (alive.current) setBusy(false); }
  };

  return <View style={styles.card}>
    <Text style={styles.heading}>{copy.title}</Text>
    <Text style={styles.body}>{mode === 'correction' ? 'Replace the current occurrence facts to correct a mistake. Earlier entries remain in the audit.' : mode === 'add' ? 'Record a chemical service you received. Approximate and unknown dates are welcome.' : 'An observation does not change when or how the service occurred.'}</Text>
    {pending && <Text style={styles.body}>A save is awaiting confirmation. The fields are locked so retrying sends the same command.</Text>}
    {mode !== 'observation' && <ServiceOccurrenceFields facts={facts} disabled={locked} onChange={setFacts} onError={setMessage} />}
    {mode === 'correction' && <Field label="Reason for correction" value={reason} editable={!locked} maxLength={500} onChangeText={setReason} />}
    {mode === 'add' && <Choice label="Include an initial presence observation" value={includeObservation ? 'yes' : 'no'} options={['no', 'yes']} disabled={locked} onChange={value => setIncludeObservation(value === 'yes')} />}
    {(mode === 'observation' || (mode === 'add' && includeObservation)) && <ServiceObservationFields observation={observation} disabled={locked} onChange={setObservation} />}
    {conflict && !latest && <Button title="Retry loading current service" secondary disabled={busy} onPress={() => void loadLatest()} />}
    {latest && <View style={styles.notice}>
      <Text style={styles.heading}>Current saved facts</Text><ServiceFactsView facts={latest.facts} />
      <Text style={styles.body}>Your submitted facts remain in the locked form above. Discarding this failed attempt starts a new correction against the current entry.</Text>
      <Button title="Discard failed attempt and review my facts" disabled={busy} onPress={() => void discard(true)} />
    </View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : pending ? 'Retry identical save' : copy.submit} disabled={busy || conflict} onPress={() => void submit()} />
    {pending && <Button title="Discard device draft" secondary disabled={busy} onPress={() => void discard(false)} />}
    <Button title={pending ? 'Back to services (keep draft)' : 'Cancel'} secondary disabled={busy} onPress={onCancel} />
  </View>;
}
