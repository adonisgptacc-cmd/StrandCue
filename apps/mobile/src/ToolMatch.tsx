import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  CATALOGUE_SEARCH_DEFAULT_LIMIT,
  compareToolRecordToCandidate,
  MatchUserToolCommandSchema,
  ToolSearchRequestSchema,
  toolCandidateTitle,
  type ToolCatalogueCandidate,
  type ToolSearchResult,
} from '../../../packages/domain/src/index';
import { searchFailureMessage, suggestedSearchText } from './catalogue-match-copy';
import { secureStorage } from './client';
import { focusOn } from './focus';
import { toolCandidateLines, toolComparisonLine, toolLifecycleLine, toolMatchFailure, toolTypeLabel, wattageLine } from './tool-copy';
import { matchUserTool, type ToolDetail } from './tool-api';
import { removeToolDraft, submitToolDraft, type ToolDraft } from './tool-drafts';
import { searchToolCatalogue } from './tool-catalogue-api';
import { Button, Field, styles } from './ui';

type Search =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'done'; result: ToolSearchResult };

type Props = {
  owner: string;
  detail: ToolDetail;
  /** A confirmed match the device kept after a failed save. */
  resume?: ToolDraft;
  onMatched: () => void;
  onCancel: () => void;
  onLeaveWithDraft: () => void;
  onStale: () => void;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Spoken once by the screen reader; a status that merely mounts with its text is not reliably announced. */
const announce = (text: string): void => { AccessibilityInfo.announceForAccessibility(text); };

const retiredNote = 'Retired version: matching it records the older version you own. It is not the current version, and no newer version is chosen for you.';

function Lines({ lines }: { lines: readonly string[] }) {
  return <>{lines.map(line => <Text key={line} style={styles.body}>{line}</Text>)}</>;
}

function ownerLines(detail: ToolDetail): string[] {
  const lines = [`Brand: ${detail.manualBrand ?? 'Not answered'}`, `Model: ${detail.manualModel ?? 'Not answered'}`, `Type: ${toolTypeLabel(detail.toolType)}`];
  if (detail.wattageWatts !== null) lines.push(wattageLine(detail.wattageWatts));
  return lines;
}

/**
 * The spoken name of a result. The title alone can repeat, so the version is added when another result shares the title,
 * and the position when the version repeats too: never an identifier.
 */
function candidateName(candidate: ToolCatalogueCandidate, all: readonly ToolCatalogueCandidate[], position: number): string {
  const title = toolCandidateTitle(candidate);
  const sameTitle = all.filter(other => toolCandidateTitle(other) === title);
  const sameVersion = sameTitle.filter(other => other.versionLabel === candidate.versionLabel && other.lifecycle === candidate.lifecycle);
  return `${title}${candidate.lifecycle === 'retired' ? ', retired version' : ''}${sameTitle.length > 1 ? `, version ${candidate.versionLabel}` : ''}${sameVersion.length > 1 ? `, result ${position + 1} of ${all.length}` : ''}`;
}

function CandidateCard({ candidate, described, disabled, onChoose }: {
  candidate: ToolCatalogueCandidate; described: string; disabled: boolean; onChoose: () => void;
}) {
  const title = toolCandidateTitle(candidate);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    <Lines lines={toolCandidateLines(candidate)} />
    <Text style={styles.body}>{toolLifecycleLine(candidate)}</Text>
    <Button title="Compare with my tool" accessibilityLabel={`Compare with my tool: ${described}`} secondary disabled={disabled} onPress={onChoose} />
  </View>;
}

/**
 * Match a manual tool to one exact catalogue version.
 *
 * Search and selection only read. The link is written by one confirmed command after a side-by-side
 * comparison, only through the trusted tool match command: the same operation id is kept for a retry, a
 * stale entry is never retried, and nothing from the catalogue is copied into the owner's record. The
 * screen holds no state across owners: its parent is keyed by the owner, and a late answer is ignored once
 * it has been replaced.
 */
export function ToolMatch({ owner, detail, resume, onMatched, onCancel, onLeaveWithDraft, onStale }: Props) {
  const [text, setText] = useState(() => suggestedSearchText({ manualBrand: detail.manualBrand, manualName: detail.manualModel }));
  const [search, setSearch] = useState<Search>({ status: 'idle' });
  const [inputProblem, setInputProblem] = useState('');
  const [changedNote, setChangedNote] = useState(false);
  const [selected, setSelected] = useState<ToolCatalogueCandidate | null>(null);
  const [operationId, setOperationId] = useState(() => resume?.command.operationId ?? Crypto.randomUUID());
  const [pending, setPending] = useState<ToolDraft | null>(resume ?? null);
  const [blocked, setBlocked] = useState<'conflict' | 'refused' | null>(null);
  const [message, setMessage] = useState('');
  // Every message, even one worded like the last, takes the focus again: it is said once, at the message.
  const [saidAt, setSaidAt] = useState(0);
  const say = (text: string) => { setMessage(text); setSaidAt(count => count + 1); };
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const messageRef = useRef<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // A refusal removes the confirm button; the reason takes the focus it leaves.
  useEffect(() => { if (saidAt > 0) focusOn(messageRef); }, [saidAt]);

  const runSearch = () => {
    if (search.status === 'loading') return;
    const request = ToolSearchRequestSchema.safeParse({ query: text, limit: CATALOGUE_SEARCH_DEFAULT_LIMIT });
    if (!request.success) {
      ++generation.current;
      setSearch({ status: 'idle' });
      setInputProblem(request.error.issues[0]?.message ?? 'Check the search words and try again.');
      return;
    }
    const turn = ++generation.current;
    setInputProblem(''); setChangedNote(false); setSearch({ status: 'loading' });
    announce('Searching the tool catalogue.');
    searchToolCatalogue(request.data).then(result => {
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

  const choose = (candidate: ToolCatalogueCandidate) => {
    ++generation.current;
    setSelected(candidate);
    setOperationId(Crypto.randomUUID());
    setBlocked(null); setMessage('');
    announce('Compare with your tool.');
  };

  const backToResults = () => {
    setSelected(null); setMessage(''); setBlocked(null);
    announce('Back to the search results. Nothing was changed.');
  };

  const send = async (draft: ToolDraft) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    let saved = false;
    try {
      await submitToolDraft(secureStorage, owner, draft, command => {
        if (command.mode !== 'match') throw new Error('Unexpected command');
        return matchUserTool(command.command);
      }, () => mounted.current);
      saved = true;
      // The screen stays locked while the parent shows the matched tool.
      if (mounted.current) { announce('Match saved.'); onMatched(); }
    } catch (error) {
      if (!mounted.current) return;
      const failure = toolMatchFailure(error);
      say(failure.message);
      if (failure.kind !== 'retry') {
        // A stale entry or a refusal is final for this choice: the saved command is dropped.
        try { await removeToolDraft(secureStorage, owner, detail.id); } catch { /* the owner can still discard it */ }
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
        command: MatchUserToolCommandSchema.parse({
          operationId, userToolId: detail.id, expectedRevision: detail.revision, versionId: selected.versionId, confirmed: true,
        }),
      });
    } catch { say('The match could not be prepared. Nothing was linked. Go back and choose again.'); }
  };

  const discard = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      await removeToolDraft(secureStorage, owner, detail.id);
      if (!mounted.current) return;
      setPending(null); setBlocked(null); setOperationId(Crypto.randomUUID());
      say('The failed attempt was discarded. Nothing was linked.');
    } catch {
      if (mounted.current) say('The device draft could not be removed. Please try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const rematch = detail.versionId !== null;
  const heading = <Text accessibilityRole="header" style={styles.heading}>Match to catalogue</Text>;
  const messageNode = !!message && <Text ref={messageRef as never} style={styles.error}>{message}</Text>;
  const pendingActions = pending && <>
    <Button title={busy ? 'Saving…' : 'Try saving again'} accessibilityLabel={busy ? 'Saving the match' : 'Try saving the match again'} disabled={busy} onPress={confirm} />
    <Button title="Delete the saved attempt" secondary disabled={busy} onPress={() => void discard()} />
    <Button title="Back to tools (keep for later)" secondary disabled={busy} onPress={onLeaveWithDraft} />
  </>;

  // A confirmed match the device kept: nothing to search, only to retry or discard.
  if (pending && !selected) {
    return <View style={styles.card}>
      {heading}
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>A confirmed match is waiting to be saved.</Text>
      <Text style={styles.body}>{`It will link your tool to the catalogue version you confirmed. Nothing is linked until it is saved, and retrying will not record it twice.`}</Text>
      {messageNode}
      {pendingActions}
    </View>;
  }

  if (selected) {
    const rows = compareToolRecordToCandidate({ brand: detail.manualBrand, model: detail.manualModel, toolType: detail.toolType }, selected);
    const already = detail.versionId === selected.versionId;
    return <View style={{ gap: 20 }}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>Compare with your tool</Text>
        <Text accessibilityRole="header" style={styles.label}>Your tool</Text>
        <Lines lines={ownerLines(detail)} />
        <Text accessibilityRole="header" style={styles.label}>Catalogue version</Text>
        <Lines lines={toolCandidateLines(selected)} />
        <Text style={styles.body}>{toolLifecycleLine(selected)}</Text>
        {selected.lifecycle === 'retired' && <Text style={styles.body}>{retiredNote}</Text>}
        <Text accessibilityRole="header" style={styles.label}>How your tool compares</Text>
        <Lines lines={rows.map(toolComparisonLine)} />
        <Text style={styles.body}>Matching only links your tool to this catalogue version. Nothing from the catalogue is copied into your record, and your original details stay in your history.</Text>
        {already && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>Your tool is already linked to this catalogue version.</Text>}
        {messageNode}
        {/* One primary button keeps its place from the first tap to the retry, so focus is never lost on the consequential step. */}
        {(pending || (!already && !blocked)) && <Button title={busy ? 'Saving…' : pending ? 'Try saving again' : 'Confirm match'}
          accessibilityLabel={busy ? 'Saving the match' : pending ? 'Try saving the match again' : 'Confirm match to this catalogue version'} disabled={busy} onPress={confirm} />}
        {pending && <Button title="Delete the saved attempt" secondary disabled={busy} onPress={() => void discard()} />}
        {pending && <Button title="Back to tools (keep for later)" secondary disabled={busy} onPress={onLeaveWithDraft} />}
        {!pending && blocked === 'conflict' && <Button title="Show the latest entry" onPress={onStale} />}
        {!pending && blocked !== 'conflict' && <Button title="Back to results" accessibilityLabel="Back to search results" secondary disabled={busy} onPress={backToResults} />}
        {!pending && <Button title="Cancel" accessibilityLabel="Cancel and keep my tool as it is" secondary disabled={busy} onPress={onCancel} />}
      </View>
    </View>;
  }

  const result = search.status === 'done' ? search.result : null;
  return <View style={{ gap: 20 }}>
    <View style={styles.card}>
      {heading}
      <Text style={styles.body}>Search the catalogue for the exact tool you own. Choosing a result does not change your tool; you will compare it with your record first.</Text>
      {messageNode}
      {blocked === 'conflict' && <Button title="Show the latest entry" onPress={onStale} />}
      {rematch && <Text style={styles.body}>Your tool is already linked to a catalogue version. Choose a different catalogue version to add a new match to your history; the earlier match stays in it.</Text>}
      <Field label="Search the tool catalogue" value={text} maxLength={80} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
        accessibilityHint="Brand, tool name or type. Up to six words."
        onChangeText={changeText} onSubmitEditing={runSearch} />
      {!!inputProblem && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{inputProblem}</Text>}
      {changedNote && <Text style={styles.body}>The search words changed. Search again to see matching tools.</Text>}
      <Button title={search.status === 'loading' ? 'Searching…' : 'Search catalogue'} accessibilityLabel={search.status === 'loading' ? 'Searching the tool catalogue' : 'Search tool catalogue'} disabled={search.status === 'loading'} onPress={runSearch} />
      {search.status === 'loading' && <Text style={styles.body}>Searching the tool catalogue…</Text>}
      {search.status === 'failed' && <>
        <Text style={styles.error}>{search.message}</Text>
        <Button title="Try search again" onPress={runSearch} />
      </>}
      {result && result.results.length === 0 && <Text style={styles.body}>No catalogue versions matched. Check the spelling or try fewer words. Nothing was changed.</Text>}
    </View>
    {result && result.results.length > 0 && <>
      <Text accessibilityRole="header" style={styles.heading}>Search results</Text>
      <Text style={styles.body}>{`${plural(result.results.length, 'catalogue version')} found.`}</Text>
      {result.truncated && <Text style={styles.body}>More versions matched than are shown. Add a word to narrow the search.</Text>}
      {result.results.map((candidate, position) => <CandidateCard key={candidate.versionId} candidate={candidate} disabled={busy}
        described={candidateName(candidate, result.results, position)} onChoose={() => choose(candidate)} />)}
    </>}
    <Button title="Cancel" accessibilityLabel="Cancel and keep my tool as it is" secondary onPress={onCancel} />
  </View>;
}
