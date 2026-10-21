import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { toolStateBefore } from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import { getUserTool, listUserTools, type ToolCursor, type ToolDetail, type ToolItem } from './tool-api';
import {
  clearToolDrafts,
  readToolDrafts,
  type ToolDraft,
  type ToolFormDraft,
} from './tool-drafts';
import { appendToolPage, toolEditorCopy, toolView, type ToolFormMode } from './tool-history';
import {
  ownerToolLines,
  recordedToolIdentityWording,
  toolCardLines,
  toolDisplayName,
  toolPatchReadable,
  toolRevisionKindLabel,
  toolRevisionLines,
  toolUnreadableHistoryLabel,
} from './tool-copy';
import { ToolCatalogueDetail } from './ToolCatalogueDetail';
import { ToolEditor } from './tool-editor';
import { ToolMatch } from './ToolMatch';
import { Button, styles } from './ui';

type Mode = { kind: 'list' } | { kind: 'detail'; detail: ToolDetail }
  | { kind: 'match'; detail: ToolDetail; resume?: ToolDraft; session: number }
  | { kind: 'catalogue-detail'; detail: ToolDetail; versionId: string }
  | { kind: 'editor'; mode: ToolFormMode; userToolId?: string; detail?: ToolDetail; resume?: ToolFormDraft; session: number };

/** The spoken name of a list entry: two tools with the same name are told apart by their place in the list. */
function entryName(item: ToolItem, items: readonly ToolItem[]): string {
  const name = toolDisplayName(item);
  const same = items.filter(other => toolDisplayName(other) === name);
  return same.length > 1 ? `${name}, number ${same.indexOf(item) + 1} of ${same.length}` : name;
}

function ToolDetailView({ detail, onEdit, onViewCatalogue, onBack }: {
  detail: ToolDetail;
  onEdit: (mode: 'edit' | 'correct' | 'match' | 'archive') => void;
  onViewCatalogue: (versionId: string) => void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState(false);
  const archived = detail.availability === 'archived';
  const revisions = detail.revisions;
  const byId = new Map(revisions.map(revision => [revision.id, revision]));
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{toolDisplayName(detail)}</Text>
      <Text style={styles.body}>{detail.matched
        ? 'Linked to a catalogue version. Your own brand, model and type are kept as you recorded them.'
        : 'Manual entry, not linked to the catalogue.'}</Text>
      {ownerToolLines(detail).map(line => <Text key={line} style={styles.body}>{line}</Text>)}
      {archived && <Text style={styles.body}>This tool is archived. Its history stays readable and nothing was deleted.</Text>}
      {detail.matched && detail.versionId !== null && <Button title="View catalogue details" secondary onPress={() => onViewCatalogue(detail.versionId as string)} />}
      {!archived && <Button title="Edit this tool" secondary onPress={() => onEdit('edit')} />}
      {!archived && <Button title="Correct this tool's identity" secondary onPress={() => onEdit('correct')} />}
      {!archived && <Button title={detail.matched ? 'Choose a different catalogue match' : 'Match to catalogue'} secondary onPress={() => onEdit('match')} />}
      {!archived && <Button title="Archive this tool" secondary onPress={() => onEdit('archive')} />}
      <Button title={history ? 'Hide tool history' : 'Show tool history'} secondary onPress={() => setHistory(value => !value)} />
      <Button title="Back to tools" secondary onPress={onBack} />
    </View>
    {history && <>
      <Text accessibilityRole="header" style={styles.heading}>Tool history</Text>
      {revisions.length === 0 && <Text style={styles.body}>No history recorded.</Text>}
      {revisions.map((revision, index) => {
        const replaced = revision.correctsId ? byId.get(revision.correctsId) : undefined;
        // What the record held just before this entry, replayed from the whole history. A history that cannot be
        // walked is never guessed at: it is answered with the wording that says so.
        const before = index === 0 ? undefined : toolStateBefore(revisions, revisions[index - 1].id);
        const unreadable = !toolPatchReadable(revision.patch) || (revision.kind === 'correction'
          ? replaced === undefined || before === null || toolStateBefore(revisions, revision.correctsId) === null
          : revision.kind === 'change' && before === null);
        const lists = revision.kind === 'baseline' || revision.kind === 'change' || revision.kind === 'correction';
        const lines = unreadable || !lists ? [] : toolRevisionLines(revision.patch, before, revision.kind);
        return <View key={revision.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>{toolRevisionKindLabel(revision.kind)}</Text>
          {revision.correctsId && <Text style={styles.body}>{replaced
            ? `Replaces the earlier entry that recorded ${recordedToolIdentityWording(replaced.patch)}.`
            : 'Replaces an earlier entry that could not be read.'}</Text>}
          {revision.correctionReason && <Text style={styles.body}>Reason: {revision.correctionReason}</Text>}
          {revision.kind === 'match' && <Text style={styles.body}>Matched to an exact catalogue version. Your own brand, model and type stay as you recorded them. What the catalogue lists is not something you recorded.</Text>}
          {revision.kind === 'archive' && <Text style={styles.body}>Archived. Nothing was deleted and the history stays readable.</Text>}
          {/* The owner opened the history, so it is read in place: a burst of announcements for every entry would drown it. */}
          <View>
            {unreadable
              ? <Text style={styles.body}>{toolUnreadableHistoryLabel}</Text>
              : lines.map(line => <Text key={`${revision.id}-${line}`} style={styles.body}>{line}</Text>)}
          </View>
        </View>;
      })}
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
  const [cursor, setCursor] = useState<ToolCursor | null>(null);
  const [drafts, setDrafts] = useState<ToolDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const session = useRef(0);
  const busy = useRef(false);

  const load = useCallback((append = false, pageCursor: ToolCursor | null = null) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    return Promise.all([listUserTools({ cursor: append ? pageCursor : null }), readToolDrafts(secureStorage, owner)]).then(([page, pending]) => {
      if (mounted.current && request === generation.current) {
        setItems(previous => append ? appendToolPage(previous, page.items) : page.items);
        setCursor(page.nextCursor);
        setDrafts(pending);
      }
    }, async () => {
      if (mounted.current && request === generation.current) {
        setError('Tools or device drafts could not be loaded. Please try again.');
        try {
          const pending = await readToolDrafts(secureStorage, owner);
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

  /**
   * Read one tool with its history and show it. `next` decides what a loaded tool opens: its detail, or the
   * pending-match screen. `fallback` is the message shown on the list when the tool cannot be read after a save.
   */
  const openTool = async (
    userToolId: string,
    next: (detail: ToolDetail) => Mode = detail => ({ kind: 'detail', detail }),
    fallback?: string,
  ) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true); setError('');
    const failed = (message: string) => {
      setError(fallback ?? message);
      if (fallback) setMode({ kind: 'list' });
    };
    try {
      const detail = await getUserTool(userToolId, true);
      if (mounted.current && request === generation.current) {
        if (!detail) failed('This tool could not be found. Reload the list to check your saved entries.');
        else setMode(next(detail));
      }
    } catch { if (mounted.current && request === generation.current) failed('This tool could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  const back = () => { setMode({ kind: 'list' }); void refresh(); };
  /** A tool holds one saved command at a time: a different one is never overwritten, because it may already have reached the server. */
  const savedFor = (userToolId: string) => drafts.find(draft => draft.command.userToolId === userToolId);
  const refuseOverwrite = (verb: string): void => {
    setError(`This tool has an unsent change saved on your device. Review it from the pending saves in your tools before ${verb}.`);
  };
  const startMatch = (detail: ToolDetail) => {
    const saved = savedFor(detail.id);
    if (saved && saved.mode !== 'match') { refuseOverwrite('matching'); return; }
    setMode({ kind: 'match', detail, resume: saved, session: ++session.current });
  };
  const startEditor = (editorMode: ToolFormMode, userToolId?: string, resume?: ToolFormDraft, detail?: ToolDetail) => {
    setMode({ kind: 'editor', mode: resume?.mode ?? editorMode, userToolId: userToolId ?? resume?.command.userToolId, detail, resume, session: ++session.current });
  };
  const reviewDraft = (draft: ToolDraft) => {
    if (draft.mode === 'match') void openTool(draft.command.userToolId, detail => ({ kind: 'match', detail, resume: draft, session: ++session.current }));
    else startEditor(draft.mode, undefined, draft);
  };
  const view = toolView(loading, items, mode.kind === 'detail' ? mode.detail : null);

  if (mode.kind === 'editor') return <>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {/* The tree is swapped for a new screen, so the new screen says so. */}
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>{`${toolEditorCopy(mode.mode).title} screen opened.`}</Text>
    <ToolEditor key={mode.session} owner={owner} mode={mode.mode} userToolId={mode.userToolId} detail={mode.detail} resume={mode.resume} onSaved={back} onCancel={back} onStale={() => void openTool(mode.userToolId ?? '')} />
  </>;
  if (mode.kind === 'catalogue-detail') {
    const viewed = mode.detail;
    return <ToolCatalogueDetail key={viewed.id} owner={owner} versionId={mode.versionId} userToolId={viewed.id}
      backLabel="your tool" onBack={() => setMode({ kind: 'detail', detail: viewed })} />;
  }
  if (mode.kind === 'match') {
    const matching = mode.detail;
    return <View style={{ gap: 20 }}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <ToolMatch key={`${matching.id}-${mode.session}`} owner={owner} detail={matching} resume={mode.resume}
        onMatched={() => void openTool(matching.id, undefined, 'The match was saved, but the tool could not be reloaded. Open it from your tools to see it.')}
        onCancel={() => setMode({ kind: 'detail', detail: matching })}
        onLeaveWithDraft={back}
        onStale={() => void openTool(matching.id)} />
    </View>;
  }
  return <View style={{ gap: 20 }}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {mode.kind === 'detail' ? <ToolDetailView key={mode.detail.id} detail={mode.detail}
      onEdit={editorMode => {
        if (editorMode === 'match') { startMatch(mode.detail); return; }
        if (savedFor(mode.detail.id)) { refuseOverwrite({ edit: 'editing', correct: 'correcting', archive: 'archiving' }[editorMode]); return; }
        startEditor(editorMode, mode.detail.id, undefined, mode.detail);
      }}
      onViewCatalogue={versionId => setMode({ kind: 'catalogue-detail', detail: mode.detail, versionId })} onBack={back} /> : <>
      <Text style={styles.subtitle}>Styling tools you own. Only what you record is shown here. Nothing is guessed from a brand, a model or a wattage.</Text>
      <Button title="Add a tool" disabled={loading} onPress={() => startEditor('add')} />
      {drafts.map((draft, index) => <View key={draft.command.userToolId} style={styles.notice}>
        <Text style={styles.body}>Pending save {index + 1}: {toolEditorCopy(draft.mode).title}. Review or retry the same command.</Text>
        <Button title={`Review pending save ${index + 1}`} accessibilityLabel={`Review pending save ${index + 1}: ${toolEditorCopy(draft.mode).title}`} disabled={loading} onPress={() => reviewDraft(draft)} />
      </View>)}
      {view === 'loading' && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>Loading tools…</Text>}
      {view === 'empty' && !error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>No tools recorded yet.</Text>
        <Text style={styles.body}>Add a tool you own. Brand, model, temperature and wattage can all be left as not answered.</Text>
      </View>}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{toolDisplayName(item)}</Text>
        {toolCardLines(item).map(line => <Text key={line} style={styles.body}>{line}</Text>)}
        <Button title="View tool entry" accessibilityLabel={`View tool entry: ${entryName(item, items)}`} secondary disabled={loading} onPress={() => void openTool(item.id)} />
      </View>)}
      {cursor && <Button title={loading ? 'Loading more tools…' : 'Load more tools'} secondary disabled={loading} onPress={() => refresh(true)} />}
      <Button title="Reload tools" secondary disabled={loading} onPress={() => refresh()} />
      <Button title="Delete unsent saves on this device" secondary disabled={loading} onPress={() => {
        void clearToolDrafts(secureStorage, owner).then(() => refresh(), () => setError('The unsent saves could not be deleted. Nothing else was changed. Please try again.'));
      }} />
    </>}
  </View>;
}
