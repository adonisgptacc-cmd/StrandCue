import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  CATALOGUE_SEARCH_DEFAULT_LIMIT,
  CatalogueSearchRequestSchema,
  compareManualRecordToCandidate,
  MatchUserProductCommandSchema,
  versionsOfSameProduct,
  type CatalogueCandidate,
  type CatalogueSearchResult,
} from '../../../packages/domain/src/index';
import { searchCatalogue } from './catalogue-search-api';
import {
  candidateLines,
  candidateTitle,
  comparisonLine,
  lifecycleLine,
  manualRecordLines,
  matchFailure,
  searchFailureMessage,
  suggestedSearchText,
  versionReference,
} from './catalogue-match-copy';
import { secureStorage } from './client';
import { matchUserProduct, type ShelfDetail } from './shelf-api';
import { removeShelfDraft, submitShelfDraft, type ShelfDraft } from './shelf-drafts';
import { Button, Field, styles } from './ui';

type Search =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'done'; result: CatalogueSearchResult };

type Props = {
  owner: string;
  detail: ShelfDetail;
  /** A confirmed match the device kept after a failed save. */
  resume?: ShelfDraft;
  onMatched: () => void;
  onCancel: () => void;
  onLeaveWithDraft: () => void;
  onStale: () => void;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Spoken once by the screen reader; a status that merely mounts with its text is not reliably announced. */
const announce = (text: string): void => { AccessibilityInfo.announceForAccessibility(text); };

function Lines({ lines }: { lines: readonly string[] }) {
  return <>{lines.map(line => <Text key={line} style={styles.body}>{line}</Text>)}</>;
}

function CandidateCard({ candidate, siblings, lookAlike, disabled, onChoose }: {
  candidate: CatalogueCandidate; siblings: number; lookAlike: boolean; disabled: boolean; onChoose: () => void;
}) {
  const title = candidateTitle(candidate);
  const label = `Compare with my record: ${title}${candidate.variant ? ` (${candidate.variant})` : ''}${candidate.barcode ? `, barcode ${candidate.barcode}` : ''}${candidate.lifecycle === 'retired' ? ', retired version' : ''}${lookAlike ? `, catalogue code ${candidate.versionId.slice(-8)}` : ''}`;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    <Lines lines={candidateLines(candidate)} />
    <Text style={styles.body}>{lifecycleLine(candidate)}</Text>
    <Text style={styles.body}>{versionReference(candidate)}</Text>
    {siblings > 1 && <Text style={styles.body}>{`${siblings} versions of this product are listed. Check the variant and barcode to choose the exact one.`}</Text>}
    <Button title="Compare with my record" accessibilityLabel={label} secondary disabled={disabled} onPress={onChoose} />
  </View>;
}

/**
 * Match a manual Shelf entry to one exact catalogue version.
 *
 * Search and selection only read. The link is written by one confirmed
 * command after a side-by-side comparison, and only through the trusted Shelf
 * match command: the same operation id is kept for a retry, a stale entry is
 * never retried, and nothing from the catalogue is copied into the owner's
 * record. The screen holds no state across owners: its parent is keyed by the
 * owner, and a late answer is ignored once it has been replaced.
 */
export function CatalogueMatch({ owner, detail, resume, onMatched, onCancel, onLeaveWithDraft, onStale }: Props) {
  const [text, setText] = useState(() => suggestedSearchText(detail));
  const [search, setSearch] = useState<Search>({ status: 'idle' });
  const [inputProblem, setInputProblem] = useState('');
  const [changedNote, setChangedNote] = useState(false);
  const [selected, setSelected] = useState<CatalogueCandidate | null>(null);
  const [operationId, setOperationId] = useState(() => resume?.command.operationId ?? Crypto.randomUUID());
  const [pending, setPending] = useState<ShelfDraft | null>(resume ?? null);
  const [blocked, setBlocked] = useState<'conflict' | 'refused' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const runSearch = () => {
    if (search.status === 'loading') return;
    const request = CatalogueSearchRequestSchema.safeParse({ query: text, limit: CATALOGUE_SEARCH_DEFAULT_LIMIT });
    if (!request.success) {
      ++generation.current;
      setSearch({ status: 'idle' });
      setInputProblem(request.error.issues[0]?.message ?? 'Check the search words and try again.');
      return;
    }
    const turn = ++generation.current;
    setInputProblem(''); setChangedNote(false); setSearch({ status: 'loading' });
    announce('Searching the catalogue.');
    searchCatalogue(request.data).then(result => {
      if (!mounted.current || turn !== generation.current) return;
      setSearch({ status: 'done', result });
      announce(result.results.length === 0
        ? 'No catalogue versions matched.'
        : `${plural(result.results.length, 'catalogue version')} found.`);
    }, (error: unknown) => {
      if (!mounted.current || turn !== generation.current) return;
      const failed = searchFailureMessage(error);
      setSearch({ status: 'failed', message: failed });
      announce(failed);
    });
  };

  const changeText = (value: string) => {
    ++generation.current;
    setText(value);
    setInputProblem('');
    // A list found for other words must not be chosen from.
    if (search.status !== 'idle') setChangedNote(true);
    setSearch({ status: 'idle' });
  };

  const choose = (candidate: CatalogueCandidate) => {
    ++generation.current;
    setSelected(candidate);
    setOperationId(Crypto.randomUUID());
    setBlocked(null); setMessage('');
    announce('Compare with your record.');
  };

  const backToResults = () => {
    setSelected(null); setMessage(''); setBlocked(null);
    announce('Back to the search results. Nothing was changed.');
  };

  const send = async (draft: ShelfDraft) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    let saved = false;
    try {
      await submitShelfDraft(secureStorage, owner, draft, command => {
        if (command.mode !== 'match') throw new Error('Unexpected command');
        return matchUserProduct(command.command);
      }, () => mounted.current);
      saved = true;
      // The screen stays locked while the parent shows the matched entry.
      if (mounted.current) onMatched();
    } catch (error) {
      if (!mounted.current) return;
      const failure = matchFailure(error);
      setMessage(failure.message);
      if (failure.kind !== 'retry') {
        // A stale entry or a refusal is final for this choice: the saved command is dropped.
        try { await removeShelfDraft(secureStorage, owner, detail.id); } catch { /* the owner can still discard it */ }
        if (!mounted.current) return;
        setPending(null); setBlocked(failure.kind); setOperationId(Crypto.randomUUID());
      }
    } finally {
      inFlight.current = false;
      if (mounted.current && !saved) setBusy(false);
    }
  };

  const confirm = () => {
    if (pending) { void send(pending); return; }
    if (!selected) return;
    try {
      void send({
        mode: 'match',
        command: MatchUserProductCommandSchema.parse({
          operationId, userProductId: detail.id, expectedRevision: detail.revision, versionId: selected.versionId, confirmed: true,
        }),
      });
    } catch { setMessage('The match could not be prepared. Nothing was linked. Go back and choose again.'); }
  };

  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      await removeShelfDraft(secureStorage, owner, detail.id);
      if (!mounted.current) return;
      setPending(null); setBlocked(null); setOperationId(Crypto.randomUUID());
      setMessage('The failed attempt was discarded. Nothing was linked.');
    } catch {
      if (mounted.current) setMessage('The device draft could not be removed. Please try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const rematch = detail.versionId !== null;
  const heading = <Text accessibilityRole="header" style={styles.heading}>Match to catalogue</Text>;
  const messageNode = !!message && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text>;
  const pendingActions = pending && <>
    <Button title={busy ? 'Saving…' : 'Try saving again'} accessibilityLabel={busy ? 'Saving the match' : 'Try saving the match again'} disabled={busy} onPress={confirm} />
    <Button title="Delete the saved attempt" secondary disabled={busy} onPress={() => void discard()} />
    <Button title="Back to shelf (keep for later)" secondary disabled={busy} onPress={onLeaveWithDraft} />
  </>;

  // A confirmed match the device kept: nothing to search, only to retry or discard.
  if (pending && !selected) {
    return <View style={styles.card}>
      {heading}
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>A confirmed match is waiting to be saved.</Text>
      <Text style={styles.body}>{`It will link your entry to the catalogue version ending ${pending.mode === 'match' ? pending.command.versionId.slice(-8) : ''}. Nothing is linked until it is saved, and retrying will not record it twice.`}</Text>
      {messageNode}
      {pendingActions}
    </View>;
  }

  if (selected) {
    const rows = compareManualRecordToCandidate({
      brand: detail.manualBrand, name: detail.manualName, category: detail.manualCategory,
      variant: detail.manualVariant, size: detail.manualSize, barcode: detail.manualBarcode,
    }, selected);
    const already = detail.versionId === selected.versionId;
    return <View style={{ gap: 20 }}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Compare with your record</Text>
        <Text accessibilityRole="header" style={styles.label}>Your record</Text>
        <Lines lines={manualRecordLines(detail)} />
        <Text accessibilityRole="header" style={styles.label}>Catalogue version</Text>
        <Lines lines={candidateLines(selected)} />
        <Text style={styles.body}>{lifecycleLine(selected)}</Text>
        <Text style={styles.body}>{versionReference(selected)}</Text>
        <Text accessibilityRole="header" style={styles.label}>How your record compares</Text>
        <Lines lines={rows.map(comparisonLine)} />
        <Text style={styles.body}>Matching only links your entry to this catalogue version. Nothing from the catalogue is copied into your record, and your original details stay in your history.</Text>
        {already && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>Your entry is already linked to this catalogue version.</Text>}
        {messageNode}
        {/* One primary button keeps its place from the first tap to the retry, so focus is never lost on the consequential step. */}
        {(pending || (!already && !blocked)) && <Button title={busy ? 'Saving…' : pending ? 'Try saving again' : 'Confirm match'}
          accessibilityLabel={busy ? 'Saving the match' : pending ? 'Try saving the match again' : 'Confirm match to this catalogue version'} disabled={busy} onPress={confirm} />}
        {pending && <Button title="Delete the saved attempt" secondary disabled={busy} onPress={() => void discard()} />}
        {pending && <Button title="Back to shelf (keep for later)" secondary disabled={busy} onPress={onLeaveWithDraft} />}
        {!pending && blocked === 'conflict' && <Button title="Show the latest entry" onPress={onStale} />}
        {!pending && blocked !== 'conflict' && <Button title="Back to results" accessibilityLabel="Back to search results" secondary disabled={busy} onPress={backToResults} />}
        {!pending && <Button title="Cancel" accessibilityLabel="Cancel and keep my entry as it is" secondary disabled={busy} onPress={onCancel} />}
      </View>
    </View>;
  }

  const result = search.status === 'done' ? search.result : null;
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      {heading}
      <Text style={styles.body}>Search the catalogue for the exact product you own. Choosing a result does not change your entry; you will compare it with your record first.</Text>
      {messageNode}
      {blocked === 'conflict' && <Button title="Show the latest entry" onPress={onStale} />}
      {rematch && <Text style={styles.body}>Your entry is already linked to a catalogue version. Choose a different catalogue version to add a new match to your history; the earlier match stays in it.</Text>}
      <Field label="Search the catalogue" value={text} maxLength={80} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
        accessibilityHint="Brand, product name, variant, category or a full barcode number. Up to six words."
        onChangeText={changeText} onSubmitEditing={runSearch} />
      {!!inputProblem && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{inputProblem}</Text>}
      {changedNote && <Text style={styles.body}>The search words changed. Search again to see matching products.</Text>}
      <Button title={search.status === 'loading' ? 'Searching…' : 'Search catalogue'} accessibilityLabel={search.status === 'loading' ? 'Searching the catalogue' : 'Search catalogue'} disabled={search.status === 'loading'} onPress={runSearch} />
      {search.status === 'loading' && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>Searching the catalogue…</Text>}
      {search.status === 'failed' && <>
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{search.message}</Text>
        <Button title="Try search again" onPress={runSearch} />
      </>}
      {result && result.results.length === 0 && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>No catalogue versions matched. Check the spelling or try fewer words. Nothing was changed.</Text>}
    </View>
    {result && result.results.length > 0 && <>
      <Text accessibilityRole="header" style={styles.heading}>Search results</Text>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>{`${plural(result.results.length, 'catalogue version')} found.`}</Text>
      {result.truncated && <Text style={styles.body}>More versions matched than are shown. Add a word to narrow the search.</Text>}
      {result.results.map(candidate => <CandidateCard key={candidate.versionId} candidate={candidate}
        siblings={versionsOfSameProduct(result.results, candidate)} lookAlike={result.results.some(other => other !== candidate && candidateTitle(other) === candidateTitle(candidate) && other.variant === candidate.variant && other.barcode === candidate.barcode && other.lifecycle === candidate.lifecycle)} disabled={busy} onChoose={() => choose(candidate)} />)}
    </>}
    <Button title="Cancel" accessibilityLabel="Cancel and keep my entry as it is" secondary onPress={onCancel} />
  </View>;
}
