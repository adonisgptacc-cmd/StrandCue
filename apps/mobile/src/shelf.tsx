import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { secureStorage } from './client';
import { getUserProduct, listUserProducts, type ShelfCursor, type ShelfDetail, type ShelfItem } from './shelf-api';
import {
  clearShelfDrafts,
  readShelfDrafts,
  type ShelfDraft,
  type ShelfFormDraft,
} from './shelf-drafts';
import { appendShelfPage, availabilityLabel, recordedIdentityWording, revisionLines, shelfEditorCopy, shelfFactLines, shelfView, unreadableHistoryLabel, verificationBadge, type ShelfFormMode } from './shelf-history';
import { shelfStateBefore } from '../../../packages/domain/src/index';
import { CatalogueMatch } from './CatalogueMatch';
import { ShelfEditor } from './shelf-editor';
import { Button, styles } from './ui';

type Mode = { kind: 'list' } | { kind: 'detail'; detail: ShelfDetail }
  | { kind: 'match'; detail: ShelfDetail; resume?: ShelfDraft; session: number }
  | { kind: 'editor'; mode: ShelfFormMode; userProductId?: string; detail?: ShelfDetail; resume?: ShelfFormDraft; session: number };

/** The name of a revision kind, in the words the owner reads. */
function revisionKindLabel(kind: string): string {
  if (kind === 'baseline') return 'Original entry';
  if (kind === 'match') return 'Catalogue match';
  if (kind === 'archive') return 'Archive';
  if (kind === 'correction') return 'Correction';
  return 'Change';
}

function ShelfDetailView({ detail, onEdit, onBack }: {
  detail: ShelfDetail;
  onEdit: (mode: 'edit' | 'correct' | 'match' | 'archive') => void;
  onBack: () => void;
}) {
  const [audit, setAudit] = useState(false);
  const facts = shelfFactLines(detail);
  // Every revision, by its own id: a correction says which entry it
  // replaces, and the entry it replaces says what the fact held before.
  const byId = new Map(detail.revisions.map(revision => [revision.id, revision]));
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>{detail.manualName ?? 'Catalogue-linked product'}</Text>
      <Text style={styles.body}>{availabilityLabel(detail.availability)}</Text>
      <Text style={styles.body}>{detail.matched ? 'Matched to a catalogue entry (confirmed). Original manual details kept.' : 'Manual entry — not matched to the catalogue.'}</Text>
      <Text style={styles.body}>{verificationBadge('unverified')}</Text>
      {facts.map((line, index) => <Text key={`${index}-${line}`} style={styles.body}>{line}</Text>)}
      {detail.notes && <Text style={styles.body}>Notes: {detail.notes}</Text>}
      {detail.availability !== 'archived' &&
        <Button title="Edit this product" secondary onPress={() => onEdit('edit')} />}
      {detail.availability !== 'archived' &&
        <Button title="Correct this product's details" secondary onPress={() => onEdit('correct')} />}
      {detail.availability !== 'archived' &&
        <Button title={detail.matched ? 'Choose a different catalogue match' : 'Match to catalogue'} secondary onPress={() => onEdit('match')} />}
      {detail.availability !== 'archived' &&
        <Button title="Archive this product" secondary onPress={() => onEdit('archive')} />}
      <Button title={audit ? 'Hide product audit' : 'Show product audit'} secondary onPress={() => setAudit(value => !value)} />
      <Button title="Back to shelf" secondary onPress={onBack} />
    </View>
    {audit && <>
      <Text accessibilityRole="header" style={styles.heading}>Ownership entries and matches</Text>
      {detail.revisions.length === 0 && <Text style={styles.body}>No revisions recorded.</Text>}
      {detail.revisions.map(revision => {
        const replaced = revision.correctsId ? byId.get(revision.correctsId) : undefined;
        /*
         * The state of the record immediately before this correction: the
         * whole history up to the entry the correction replaces, replayed.
         * The entry it replaces alone does not say what the record held, so
         * a fact an earlier entry recorded would read as never answered.
         */
        const before = revision.kind === 'correction'
          ? shelfStateBefore(detail.revisions, revision.correctsId ?? null)
          : undefined;
        // A history that cannot be walked is never guessed at: a correction
        // that names no entry, or one whose chain is broken, is answered
        // with the wording that says so.
        const unreadable = revision.kind === 'correction' && before === null;
        const lines = unreadable ? [] : revisionLines(revision.patch, revision.kind, before);
        return <View key={revision.id} style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>{revisionKindLabel(revision.kind)}</Text>
          {revision.correctsId && <Text style={styles.body}>{replaced
            ? `Replaces the earlier entry that recorded ${recordedIdentityWording(replaced.patch)}.`
            : 'Replaces an earlier entry that could not be read.'}</Text>}
          {revision.matchVersionId && <Text style={styles.body}>Linked catalogue version recorded; original manual details preserved.</Text>}
          {revision.correctionReason && <Text style={styles.body}>Reason: {revision.correctionReason}</Text>}
          {/*
            * The facts of a revision are announced when the audit opens: the
            * owner asked to read the history, so the history speaks - and
            * the four answers stay apart by sound, not only on the screen.
            * A history that cannot be read is announced in the same region,
            * so the owner hears why the audit says nothing.
            */}
          <View accessibilityRole="alert" accessibilityLiveRegion="polite">
            {unreadable
              ? <Text style={styles.body}>{unreadableHistoryLabel}</Text>
              : lines.map(line => <Text key={`${revision.id}-${line}`} style={styles.body}>{line}</Text>)}
          </View>
        </View>;
      })}
    </>}
  </View>;
}

// A keyed child removes the old owner's visible facts and invalidates pending work immediately.
export function Shelf({ owner }: { owner: string }) {
  return <OwnerShelf key={owner} owner={owner} />;
}

function OwnerShelf({ owner }: { owner: string }) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [cursor, setCursor] = useState<ShelfCursor | null>(null);
  const [drafts, setDrafts] = useState<ShelfDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const session = useRef(0);
  const busy = useRef(false);

  const load = useCallback((append = false, pageCursor: ShelfCursor | null = null) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    return Promise.all([listUserProducts({ cursor: append ? pageCursor : null }), readShelfDrafts(secureStorage, owner)]).then(([page, pending]) => {
      if (mounted.current && request === generation.current) {
        setItems(previous => append ? appendShelfPage(previous, page.items) : page.items);
        setCursor(page.nextCursor);
        setDrafts(pending);
      }
    }, async () => {
      if (mounted.current && request === generation.current) {
        setError('Shelf or device drafts could not be loaded. Please try again.');
        try {
          const pending = await readShelfDrafts(secureStorage, owner);
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
   * Read one product with its audit and show it. `next` decides what a loaded
   * entry opens: the product detail, or the pending-match screen. `fallback`
   * is the screen shown when the entry cannot be read after a save.
   */
  const openProduct = async (
    userProductId: string,
    next: (detail: ShelfDetail) => Mode = detail => ({ kind: 'detail', detail }),
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
      const detail = await getUserProduct(userProductId, true);
      if (mounted.current && request === generation.current) {
        if (!detail) failed('This product could not be found. Reload the list to check your saved entries.');
        else setMode(next(detail));
      }
    } catch { if (mounted.current && request === generation.current) failed('This product could not be loaded. Please try again.'); }
    finally { busy.current = false; if (mounted.current && request === generation.current) setLoading(false); }
  };
  const back = () => { setMode({ kind: 'list' }); void refresh(); };
  const startMatch = (detail: ShelfDetail) => {
    // A product holds one saved command at a time: a saved match resumes, and any other saved command is never overwritten.
    const saved = drafts.find(draft => draft.command.userProductId === detail.id);
    if (saved && saved.mode !== 'match') {
      setError('This product has an unsent change saved on your device. Review it from the pending saves on your shelf before matching.');
      return;
    }
    setMode({ kind: 'match', detail, resume: saved, session: ++session.current });
  };
  const reviewDraft = (draft: ShelfDraft) => {
    if (draft.mode === 'match') void openProduct(draft.command.userProductId, detail => ({ kind: 'match', detail, resume: draft, session: ++session.current }));
    else startEditor(draft.mode, undefined, draft);
  };
  const startEditor = (editorMode: ShelfFormMode, userProductId?: string, resume?: ShelfFormDraft, detail?: ShelfDetail) => {
    setMode({ kind: 'editor', mode: resume?.mode ?? editorMode, userProductId: userProductId ?? resume?.command.userProductId, detail, resume, session: ++session.current });
  };
  const view = shelfView(loading, items, mode.kind === 'detail' ? mode.detail : null);

  if (mode.kind === 'editor') return <>
    {/* The tree is swapped for a new screen, so the new screen says so. */}
    <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>{`${shelfEditorCopy(mode.mode).title} screen opened.`}</Text>
    <ShelfEditor key={mode.session} owner={owner} mode={mode.mode} userProductId={mode.userProductId} detail={mode.detail} resume={mode.resume} onSaved={back} onCancel={back} />
  </>;
  if (mode.kind === 'match') {
    const matching = mode.detail;
    return <View style={{ gap: 20 }}>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <CatalogueMatch key={`${matching.id}-${mode.session}`} owner={owner} detail={matching} resume={mode.resume}
        onMatched={() => void openProduct(matching.id, undefined, 'The match was saved, but the product could not be reloaded. Open it from your shelf to see it.')}
        onCancel={() => setMode({ kind: 'detail', detail: matching })}
        onLeaveWithDraft={back}
        onStale={() => void openProduct(matching.id)} />
    </View>;
  }
  return <View style={{ gap: 20 }}>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {mode.kind === 'detail' ? <ShelfDetailView key={mode.detail.id} detail={mode.detail}
      onEdit={editorMode => editorMode === 'match' ? startMatch(mode.detail) : startEditor(editorMode, mode.detail.id, undefined, mode.detail)} onBack={back} /> : <>
      <Text style={styles.subtitle}>Products you own, with manual details kept private. Catalogue facts show their verification status.</Text>
      <Button title="Add a product" disabled={loading} onPress={() => startEditor('add')} />
      {drafts.map((draft, index) => <View key={draft.command.userProductId} style={styles.notice}>
        <Text style={styles.body}>Pending save {index + 1}: {shelfEditorCopy(draft.mode).title}. Review or retry the same command.</Text>
        <Button title={`Review pending save ${index + 1}`} disabled={loading} onPress={() => reviewDraft(draft)} />
      </View>)}
      {view === 'loading' && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>Loading shelf…</Text>}
      {view === 'empty' && !error && <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Your shelf is empty.</Text>
        <Text style={styles.body}>Add a product you own. Unknown brands and catalogue entries are both valid.</Text>
      </View>}
      {items.map(item => <View key={item.id} style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>{item.manualName ?? 'Catalogue-linked product'}</Text>
        <Text style={styles.body}>{availabilityLabel(item.availability)}</Text>
        {shelfFactLines(item).map((line, index) => <Text key={`${index}-${line}`} style={styles.body}>{line}</Text>)}
        <Button title="View product entry" accessibilityLabel={`View product entry: ${item.manualName ?? 'Catalogue-linked product'}`} secondary disabled={loading} onPress={() => void openProduct(item.id)} />
      </View>)}
      {cursor && <Button title={loading ? 'Loading more products…' : 'Load more products'} secondary disabled={loading} onPress={() => void refresh(true)} />}
      <Button title="Reload shelf" secondary disabled={loading} onPress={() => void refresh()} />
      <Button title="Clear departing drafts" secondary disabled={loading} onPress={() => { void clearShelfDrafts(secureStorage, owner).then(() => void refresh()); }} />
    </>}
  </View>;
}
