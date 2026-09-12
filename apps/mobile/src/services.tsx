import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { secureStorage } from './client';
import { loadService, loadServices, type ServiceCursor, type ServiceDetail, type ServiceSummary } from './services-api';
import { appendServicePage, loadServiceScreenData, readServiceDrafts, serviceDateLabel, serviceEditorCopy, servicePresenceLabel, serviceView, type ServiceDraft, type ServiceEditorMode } from './service-form';
import { ServiceEditor, ServiceFactsView } from './service-editor';
import { Button, styles } from './ui';

type Mode = { kind: 'list' } | { kind: 'detail'; detail: ServiceDetail }
  | { kind: 'editor'; mode: ServiceEditorMode; detail?: ServiceDetail; resume?: ServiceDraft; session: number };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function ServiceDetailView({ detail, onEdit, onBack }: { detail: ServiceDetail; onEdit: (mode: 'correction' | 'observation') => void; onBack: () => void }) {
  const [audit, setAudit] = useState(false);
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <ServiceFactsView facts={detail.facts} />
      <Text style={styles.body}>{servicePresenceLabel(detail.currentPresence)}</Text>
      {detail.currentObservation && <Text style={styles.body}>Observation: {serviceDateLabel(detail.currentObservation.observedOn)} · {detail.currentObservation.source.replaceAll('-', ' ')}</Text>}
      <Button title="Correct this service entry" secondary onPress={() => onEdit('correction')} />
      <Button title="Record whether the effect is still present" secondary onPress={() => onEdit('observation')} />
      <Button title={audit ? 'Hide service audit' : 'Show service audit'} secondary onPress={() => setAudit(value => !value)} />
      <Button title="Back to services" secondary onPress={onBack} />
    </View>
    {audit && <>
      <Text style={styles.heading}>Occurrence entries and corrections</Text>
      {detail.revisions.map(revision => <View key={revision.id} style={styles.card}>
        <Text style={styles.label}>{revision.kind === 'baseline' ? 'Original entry' : 'Correction'} · Recorded {revision.recordedAt.slice(0, 10)}</Text>
        <ServiceFactsView facts={revision.facts} />
        {revision.reason && <Text style={styles.body}>Reason: {revision.reason}</Text>}
      </View>)}
      <Text style={styles.heading}>Presence observations</Text>
      {detail.observations.length === 0 && <Text style={styles.body}>No presence observations recorded.</Text>}
      {detail.observations.map(observation => <View key={observation.id} style={styles.card}>
        <Text style={styles.body}>{servicePresenceLabel(observation.effectStatus)}</Text>
        <Text style={styles.body}>{serviceDateLabel(observation.observedOn)} · {observation.source.replaceAll('-', ' ')}</Text>
        <Text style={styles.body}>Recorded {observation.recordedAt.slice(0, 10)}</Text>
      </View>)}
    </>}
  </View>;
}

// A keyed child removes the old owner's visible facts and invalidates pending work immediately.
export function Services({ owner }: { owner: string }) {
  return <OwnerServices key={owner} owner={owner} />;
}

function OwnerServices({ owner }: { owner: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [items, setItems] = useState<ServiceSummary[]>([]);
  const [cursor, setCursor] = useState<ServiceCursor | null>(null);
  const [asOf] = useState(today);
  const [drafts, setDrafts] = useState<ServiceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const session = useRef(0);
  const busy = useRef(false);

  const refresh = async (append = false) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await loadServiceScreenData(() => loadServices(asOf, { cursor: append ? cursor : null }), () => readServiceDrafts(secureStorage, owner));
      if (mounted.current && request === generation.current) {
        if (result.page) {
          const page = result.page;
          setItems(previous => append ? appendServicePage(previous, page.items) : page.items);
          setCursor(page.nextCursor);
        }
        if (result.drafts) setDrafts(result.drafts);
        setError(result.error);
      }
    } catch { if (mounted.current && request === generation.current) setError('Services or device drafts could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true; void refresh();
    return () => { mounted.current = false; ++generation.current; };
  }, [owner]);

  const openService = async (serviceId: string) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const detail = await loadService(serviceId);
      if (mounted.current && request === generation.current) {
        if (!detail) setError('This service could not be found. Reload the list to check your saved entries.');
        else setMode({ kind: 'detail', detail });
      }
    } catch { if (mounted.current && request === generation.current) setError('This service could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  const back = () => { setMode({ kind: 'list' }); void refresh(); };
  const startEditor = (editorMode: ServiceEditorMode, detail?: ServiceDetail, resume?: ServiceDraft) => {
    const pending = resume ?? drafts.find(draft => draft.command.serviceId === detail?.serviceId);
    setMode({ kind: 'editor', mode: pending?.mode ?? editorMode, detail, resume: pending, session: ++session.current });
  };
  const view = serviceView(loading, items, mode.kind === 'detail' ? mode.detail : null);

  if (mode.kind === 'editor') return <ServiceEditor key={mode.session} owner={owner} mode={mode.mode} detail={mode.detail} resume={mode.resume} onSaved={back} onCancel={back} />;
  return <View style={{ gap: 20 }}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {mode.kind === 'detail' ? <ServiceDetailView key={mode.detail.serviceId} detail={mode.detail} onEdit={editorMode => startEditor(editorMode, mode.detail)} onBack={back} /> : <>
      <Text style={styles.subtitle}>Chemical services you have recorded, with occurrence facts and separate presence observations.</Text>
      <Button title="Add a service" disabled={loading} onPress={() => startEditor('add')} />
      {drafts.map((draft, index) => <View key={draft.command.serviceId} style={styles.notice}>
        <Text style={styles.body}>Pending save {index + 1}: {serviceEditorCopy(draft.mode).title}. Review or retry the same command.</Text>
        <Button title={`Review pending save ${index + 1}`} disabled={loading} onPress={() => startEditor(draft.mode, undefined, draft)} />
      </View>)}
      {view === 'loading' && <Text style={styles.body}>Loading services…</Text>}
      {view === 'empty' && !error && <View style={styles.card}><Text style={styles.heading}>No services recorded yet.</Text><Text style={styles.body}>Start with a service you remember. Unknown and approximate details are valid.</Text></View>}
      {items.map(item => <View key={item.serviceId} style={styles.card}>
        <Text style={styles.heading}>{item.facts.serviceType === 'other' ? item.facts.otherLabel : item.facts.serviceType.replaceAll('-', ' ')}</Text>
        <Text style={styles.body}>{serviceDateLabel(item.facts.occurredOn)}</Text>
        {item.facts.zones.map(zone => <Text key={`${zone.region}:${zone.segment}`} style={styles.body}>{zone.region.replaceAll('-', ' ')} · {zone.segment.replaceAll('-', ' ')}</Text>)}
        <Text style={styles.body}>{servicePresenceLabel(item.currentPresence)}</Text>
        <Button title={`View ${item.facts.serviceType === 'other' ? item.facts.otherLabel : item.facts.serviceType.replaceAll('-', ' ')} service`} secondary disabled={loading} onPress={() => void openService(item.serviceId)} />
      </View>)}
      {cursor && <Button title={loading ? 'Loading more services…' : 'Load more services'} secondary disabled={loading} onPress={() => void refresh(true)} />}
      <Button title="Reload services" secondary disabled={loading} onPress={() => void refresh()} />
    </>}
  </View>;
}
