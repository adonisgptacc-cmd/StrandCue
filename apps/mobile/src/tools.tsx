import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { secureStorage } from './client';
import { getUserTool, listUserTools, type ToolDetail, type ToolItem } from './tool-api';
import {
  clearToolDrafts,
  readToolDrafts,
  type ToolDraft,
} from './tool-drafts';
import { availabilityLabel, capabilitySummary, toolEditorCopy, toolView, type ToolEditorMode } from './tool-history';
import { ToolEditor } from './tool-editor';
import { Button, styles } from './ui';

type Mode = { kind: 'list' } | { kind: 'detail'; detail: ToolDetail }
  | { kind: 'editor'; mode: ToolEditorMode; userToolId?: string; detail?: ToolDetail; resume?: ToolDraft; session: number };

function ToolDetailView({ detail, onEdit, onBack }: {
  detail: ToolDetail;
  onEdit: (mode: 'match' | 'archive') => void;
  onBack: () => void;
}) {
  const [audit, setAudit] = useState(false);
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text style={styles.heading}>{detail.manualModel ?? 'Catalogue-linked tool'}</Text>
      <Text style={styles.body}>{availabilityLabel(detail.availability)}</Text>
      <Text style={styles.body}>{detail.matched ? 'Matched to a catalogue entry (confirmed). Original manual details kept.' : 'Manual entry — not matched to the catalogue.'}</Text>
      {!detail.matched && detail.availability !== 'archived' &&
        <Button title="Match to catalogue entry" secondary onPress={() => onEdit('match')} />}
      {detail.availability !== 'archived' &&
        <Button title="Archive this tool" secondary onPress={() => onEdit('archive')} />}
      <Button title={audit ? 'Hide tool audit' : 'Show tool audit'} secondary onPress={() => setAudit(value => !value)} />
      <Button title="Back to tools" secondary onPress={onBack} />
    </View>
    {audit && <>
      <Text style={styles.heading}>Ownership entries and matches</Text>
      {detail.revisions.length === 0 && <Text style={styles.body}>No revisions recorded.</Text>}
      {detail.revisions.map(revision => <View key={revision.id} style={styles.card}>
        <Text style={styles.label}>{revision.kind === 'baseline' ? 'Original entry' : revision.kind === 'match' ? 'Catalogue match' : revision.kind === 'archive' ? 'Archive' : revision.kind === 'correction' ? 'Correction' : 'Change'}</Text>
        {revision.correctsId && <Text style={styles.body}>Corrects an earlier entry.</Text>}
        {revision.matchVersionId && <Text style={styles.body}>Linked catalogue version recorded; original manual details preserved.</Text>}
      </View>)}
    </>}
  </View>;
}

// A keyed child removes the old owner's visible facts and invalidates pending work immediately.
export function Tools({ owner }: { owner: string }) {
  return <OwnerTools key={owner} owner={owner} />;
}

function OwnerTools({ owner }: { owner: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [items, setItems] = useState<ToolItem[]>([]);
  const [drafts, setDrafts] = useState<ToolDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const session = useRef(0);
  const busy = useRef(false);

  const refresh = async () => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const [page, pending] = await Promise.all([listUserTools(), readToolDrafts(secureStorage, owner)]);
      if (mounted.current && request === generation.current) {
        setItems(page.items);
        setDrafts(pending);
      }
    } catch {
      if (mounted.current && request === generation.current) {
        setError('Tools or device drafts could not be loaded. Please try again.');
        try { setDrafts(await readToolDrafts(secureStorage, owner)); } catch { /* drafts already reported */ }
      }
    } finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true; void refresh();
    return () => { mounted.current = false; ++generation.current; };
  }, [owner]);

  const openTool = async (userToolId: string) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const detail = await getUserTool(userToolId, true);
      if (mounted.current && request === generation.current) {
        if (!detail) setError('This tool could not be found. Reload the list to check your saved entries.');
        else setMode({ kind: 'detail', detail });
      }
    } catch { if (mounted.current && request === generation.current) setError('This tool could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  const back = () => { setMode({ kind: 'list' }); void refresh(); };
  const startEditor = (editorMode: ToolEditorMode, userToolId?: string, resume?: ToolDraft, detail?: ToolDetail) => {
    setMode({ kind: 'editor', mode: resume?.mode ?? editorMode, userToolId: userToolId ?? resume?.command.userToolId, detail, resume, session: ++session.current });
  };
  const view = toolView(loading, items, mode.kind === 'detail' ? mode.detail : null);
  const unknownCapabilities = capabilitySummary({ wattageWatts: null, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'unknown', airHeat: 'unknown' });

  if (mode.kind === 'editor') return <ToolEditor key={mode.session} owner={owner} mode={mode.mode} userToolId={mode.userToolId} detail={mode.detail} resume={mode.resume} onSaved={back} onCancel={back} />;
  return <View style={{ gap: 20 }}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {mode.kind === 'detail' ? <ToolDetailView key={mode.detail.id} detail={mode.detail} onEdit={editorMode => startEditor(editorMode, mode.detail.id, undefined, mode.detail)} onBack={back} /> : <>
      <Text style={styles.subtitle}>Styling tools you own. Capability facts show explicit unknowns — wattage never implies temperature.</Text>
      <Text style={styles.body}>Uncatalogued tool capabilities: wattage {unknownCapabilities.wattage} · temperature {unknownCapabilities.temperature}.</Text>
      <Button title="Add a tool" disabled={loading} onPress={() => startEditor('add')} />
      {drafts.map((draft, index) => <View key={draft.command.userToolId} style={styles.notice}>
        <Text style={styles.body}>Pending save {index + 1}: {toolEditorCopy(draft.mode).title}. Review or retry the same command.</Text>
        <Button title={`Review pending save ${index + 1}`} disabled={loading} onPress={() => startEditor(draft.mode, undefined, draft)} />
      </View>)}
      {view === 'loading' && <Text style={styles.body}>Loading tools…</Text>}
      {view === 'empty' && !error && <View style={styles.card}><Text style={styles.heading}>No tools recorded yet.</Text><Text style={styles.body}>Add a tool you own. Unknown brands and temperatures are both valid.</Text></View>}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.heading}>{item.manualModel ?? 'Catalogue-linked tool'}</Text>
        <Text style={styles.body}>{availabilityLabel(item.availability)}</Text>
        <Button title="View tool entry" secondary disabled={loading} onPress={() => void openTool(item.id)} />
      </View>)}
      <Button title="Reload tools" secondary disabled={loading} onPress={() => void refresh()} />
      <Button title="Clear departing drafts" secondary disabled={loading} onPress={() => { void clearToolDrafts(secureStorage, owner).then(() => void refresh()); }} />
    </>}
  </View>;
}
