import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { secureStorage } from './client';
import { getActivity, listActivities, type ActivityCursor, type ActivityDetail } from './activity-api';
import {
  clearActivityDrafts,
  readActivityDrafts,
  type ActivityDraft,
} from './activity-drafts';
import { activityEditorCopy, activityView, appendActivityPage, type ActivityEditorMode } from './activity-history';
import { ActivityEditor } from './activity-editor';
import { Button, styles } from './ui';

type Mode = { kind: 'list' } | { kind: 'detail'; detail: ActivityDetail }
  | { kind: 'editor'; mode: ActivityEditorMode; activityId?: string; resume?: ActivityDraft; session: number };

type ActivityItem = { id: string; revision: number };

function ActivityDetailView({ detail, onEdit, onBack }: {
  detail: ActivityDetail;
  onEdit: (mode: 'correction' | 'void') => void;
  onBack: () => void;
}) {
  const [audit, setAudit] = useState(false);
  const visible = audit ? detail.revisions : detail.revisions.filter(revision => revision.kind !== 'void');
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text style={styles.heading}>{detail.voided ? 'Voided activity' : 'Activity entry'}</Text>
      {!detail.voided && <>
        <Button title="Correct this activity entry" secondary onPress={() => onEdit('correction')} />
        <Button title="Void this activity entry" secondary onPress={() => onEdit('void')} />
      </>}
      <Button title={audit ? 'Hide activity audit' : 'Show activity audit'} secondary onPress={() => setAudit(value => !value)} />
      <Button title="Back to activities" secondary onPress={onBack} />
    </View>
    {visible.map(revision => <View key={revision.id} style={styles.card}>
      <Text style={styles.label}>{revision.kind === 'baseline' ? 'Original entry' : revision.kind === 'correction' ? 'Correction' : 'Void'}</Text>
      {revision.correctsId && <Text style={styles.body}>Corrects an earlier entry.</Text>}
      {revision.voidReason && <Text style={styles.body}>Reason: {revision.voidReason}</Text>}
    </View>)}
    {audit && detail.revisions.length === 0 && <Text style={styles.body}>No revisions recorded.</Text>}
  </View>;
}

// A keyed child removes the old owner's visible facts and invalidates pending work immediately.
export function Activities({ owner }: { owner: string }) {
  return <OwnerActivities key={owner} owner={owner} />;
}

function OwnerActivities({ owner }: { owner: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<ActivityCursor | null>(null);
  const [drafts, setDrafts] = useState<ActivityDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const session = useRef(0);
  const busy = useRef(false);

  const load = useCallback((append = false, pageCursor: ActivityCursor | null = null) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return Promise.all([listActivities(today, { cursor: append ? pageCursor : null }), readActivityDrafts(secureStorage, owner)]).then(([page, pending]) => {
      if (mounted.current && request === generation.current) {
        setItems(previous => append ? appendActivityPage(previous, page.items) : page.items);
        setCursor(page.nextCursor);
        setDrafts(pending);
      }
    }, async () => {
      if (mounted.current && request === generation.current) {
        setError('Activities or device drafts could not be loaded. Please try again.');
        try {
          const pending = await readActivityDrafts(secureStorage, owner);
          if (mounted.current && request === generation.current) setDrafts(pending);
        } catch { /* drafts already reported */ }
      }
    }).finally(() => {
      if (mounted.current && request === generation.current) {
        busy.current = false;
        setLoading(false);
      }
    });
  }, [owner]);
  const refresh = (append = false) => {
    if (!mounted.current || busy.current) return;
    setLoading(true); setError('');
    void load(append, append ? cursor : null);
  };
  const invalidate = useCallback(() => {
    mounted.current = false;
    busy.current = false;
    ++generation.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return invalidate;
  }, [load, invalidate]);

  const openActivity = async (activityId: string) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const detail = await getActivity(activityId, true);
      if (mounted.current && request === generation.current) {
        if (!detail) setError('This activity could not be found. Reload the list to check your saved entries.');
        else setMode({ kind: 'detail', detail });
      }
    } catch { if (mounted.current && request === generation.current) setError('This activity could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  const back = () => { setMode({ kind: 'list' }); void refresh(); };
  const startEditor = (editorMode: ActivityEditorMode, activityId?: string, resume?: ActivityDraft) => {
    setMode({ kind: 'editor', mode: resume?.mode ?? editorMode, activityId: activityId ?? resume?.command.activityId, resume, session: ++session.current });
  };
  const view = activityView(loading, items, mode.kind === 'detail' ? mode.detail : null);

  if (mode.kind === 'editor') return <ActivityEditor key={mode.session} owner={owner} mode={mode.mode} activityId={mode.activityId} resume={mode.resume} onSaved={back} onCancel={back} />;
  return <View style={{ gap: 20 }}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {mode.kind === 'detail' ? <ActivityDetailView key={mode.detail.id} detail={mode.detail} onEdit={editorMode => startEditor(editorMode, mode.detail.id)} onBack={back} /> : <>
      <Text style={styles.subtitle}>Factual wash, styling and other activities you have recorded. No recommendations are generated.</Text>
      <Button title="Record an activity" disabled={loading} onPress={() => startEditor('add')} />
      {drafts.map((draft, index) => <View key={draft.command.activityId} style={styles.notice}>
        <Text style={styles.body}>Pending save {index + 1}: {activityEditorCopy(draft.mode).title}. Review or retry the same command.</Text>
        <Button title={`Review pending save ${index + 1}`} disabled={loading} onPress={() => startEditor(draft.mode, undefined, draft)} />
      </View>)}
      {view === 'loading' && <Text style={styles.body}>Loading activities…</Text>}
      {view === 'empty' && !error && <View style={styles.card}><Text style={styles.heading}>No activities recorded yet.</Text><Text style={styles.body}>Start with a wash or styling session you remember. Unknown dates are valid.</Text></View>}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text style={styles.heading}>Activity · revision {item.revision}</Text>
        <Text style={styles.body}>Open the entry to review its recorded date, corrections and audit.</Text>
        <Button title="View activity entry" secondary disabled={loading} onPress={() => void openActivity(item.id)} />
      </View>)}
      {cursor && <Button title={loading ? 'Loading more activities…' : 'Load more activities'} secondary disabled={loading} onPress={() => void refresh(true)} />}
      <Button title="Reload activities" secondary disabled={loading} onPress={() => void refresh()} />
      <Button title="Clear departing drafts" secondary disabled={loading} onPress={() => { void clearActivityDrafts(secureStorage, owner).then(() => void refresh()); }} />
    </>}
  </View>;
}
