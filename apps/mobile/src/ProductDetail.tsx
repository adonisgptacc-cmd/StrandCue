import { useEffect, useRef, useState, type PropsWithChildren, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Linking, Pressable, Text, View } from 'react-native';

import type { DetailClaim, DetailEvidence, ProductDetail as ProductDetailData } from '../../../packages/domain/src/index';
import { getCatalogueProductDetail } from './catalogue-detail-api';
import {
  archivedLinkLabel,
  claimSourceSummary,
  claimTitle,
  detailFailure,
  directionLines,
  evidenceLines,
  historyLines,
  identityLines,
  lifecycleLines,
  ownerLines,
  sectionNotice,
  sourceLinkLabel,
  type DetailFailure,
} from './product-detail-copy';
import { Button, colors, styles } from './ui';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: DetailFailure }
  | { status: 'ready'; detail: ProductDetailData };

type Props = {
  owner: string;
  versionId: string;
  /** A Shelf context. Without one the screen reads the catalogue only and shows no owner facts. */
  userProductId: string | null;
  /** Where Back goes, in words: "search results", "the comparison", "your product". */
  backLabel: string;
  onBack: () => void;
};

/** Spoken once by the screen reader; a status that merely mounts with its text is not reliably announced. */
const announce = (text: string): void => { AccessibilityInfo.announceForAccessibility(text); };

/** Move the screen reader to a node, so a button that disappears does not drop focus to the top of the screen. */
function focusOn(ref: RefObject<unknown>): void {
  try {
    if (ref.current === null) return;
    const tag = findNodeHandle(ref.current as never);
    if (tag !== null && tag !== undefined) AccessibilityInfo.setAccessibilityFocus(tag);
  } catch { /* the platform has no focus control: the announcement still carries the change */ }
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {children}
  </View>;
}

function Lines({ lines }: { lines: readonly string[] }) {
  return <>{lines.map((line, index) => <Text key={`${index}-${line}`} style={styles.body}>{line}</Text>)}</>;
}

function SourceLink({ url, kind, label, onProblem }: { url: string; kind: 'source' | 'archive'; label: string; onProblem: () => void }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={label} accessibilityHint="Opens in your browser"
    onPress={() => { void Linking.openURL(url).catch(onProblem); }} style={[styles.button, styles.secondary]}>
    <Text style={[styles.buttonText, { color: colors.ink }]}>{kind === 'source' ? 'Open source' : 'Open archived copy'}</Text>
  </Pressable>;
}

function Claim({ claim, position, expanded, onToggle, onProblem }: {
  claim: DetailClaim; position: number; expanded: boolean; onToggle: () => void; onProblem: () => void;
}) {
  const title = claimTitle(claim, position);
  const label = `${expanded ? 'Hide' : 'Show'} evidence and limitations for: ${title}`;
  return <View style={styles.notice}>
    <Text style={styles.label}>{title}</Text>
    {claim.statement === null && <Text style={styles.body}>The reviewed record gives no statement for this claim.</Text>}
    {claim.statement !== null && claim.statement !== title && <Text style={styles.body}>{claim.statement}</Text>}
    <Text style={styles.body}>{claimSourceSummary(claim)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} onPress={onToggle} style={[styles.button, styles.secondary]}>
      <Text style={[styles.buttonText, { color: colors.ink }]}>{expanded ? 'Hide evidence and limitations' : 'Show evidence and limitations'}</Text>
    </Pressable>
    {expanded && claim.evidence.map(evidence => <EvidenceCard key={evidence.evidenceId} evidence={evidence} onProblem={onProblem} />)}
  </View>;
}

function EvidenceCard({ evidence, onProblem }: { evidence: DetailEvidence; onProblem: () => void }) {
  return <View style={styles.card}>
    <Lines lines={evidenceLines(evidence)} />
    <SourceLink url={evidence.sourceUrl} kind="source" label={sourceLinkLabel(evidence)} onProblem={onProblem} />
    {evidence.archivedUrl !== null && <SourceLink url={evidence.archivedUrl} kind="archive" label={archivedLinkLabel(evidence)} onProblem={onProblem} />}
  </View>;
}

function ClaimsSection({ detail, onProblem }: { detail: ProductDetailData; onProblem: () => void }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (claimId: string) => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(claimId)) next.delete(claimId); else next.add(claimId);
    return next;
  });
  const { claims } = detail;
  return <Section title="Claims and evidence">
    {claims.state === 'published'
      ? claims.content.items.map((claim, index) => <Claim key={claim.claimId} claim={claim} position={index + 1} expanded={expanded.has(claim.claimId)}
        onToggle={() => toggle(claim.claimId)} onProblem={onProblem} />)
      : <Text style={styles.body}>{sectionNotice('claims', claims.state)}</Text>}
  </Section>;
}

function Body({ detail, onProblem }: { detail: ProductDetailData; onProblem: () => void }) {
  const { directions, ingredients, formulationReference } = detail;
  return <>
    {detail.lifecycle.state === 'retired' && <Text accessibilityRole="alert" style={styles.error}>
      Retired version: this is a historical version, not the current formulation.
    </Text>}
    <Section title="Exact catalogue identity">
      <Lines lines={identityLines(detail.identity)} />
      {formulationReference.state === 'published'
        ? <Text style={styles.body}>{`Formula reference: ${formulationReference.content.value}`}</Text>
        : <Text style={styles.body}>{sectionNotice('formulationReference', formulationReference.state)}</Text>}
    </Section>
    <Section title="Version status">
      <Lines lines={lifecycleLines(detail.lifecycle)} />
    </Section>
    <Section title="Directions">
      {directions.state === 'published'
        ? <Lines lines={directionLines(directions.content)} />
        : <Text style={styles.body}>{sectionNotice('directions', directions.state)}</Text>}
    </Section>
    <ClaimsSection detail={detail} onProblem={onProblem} />
    <Section title="Ingredients">
      {ingredients.state === 'published'
        ? <>
          <Text style={styles.body}>{ingredients.content.text}</Text>
          <Text style={styles.body}>Ingredient text is shown as printed on the label. It does not say whether the product will suit you or how it will work.</Text>
        </>
        : <Text style={styles.body}>{sectionNotice('ingredients', ingredients.state)}</Text>}
    </Section>
    {detail.owner !== null && <Section title="Your private record (only you can see this)">
      <Lines lines={ownerLines(detail.owner)} />
      <Lines lines={historyLines(detail.owner.revisions)} />
    </Section>}
  </>;
}

/**
 * The consumer detail of one exact catalogue version.
 *
 * Nothing but a loading state is painted until the server's publication gate
 * has answered, and what it answers is parsed against a strict contract, so no
 * draft can flash. The owner's own record appears only for a Shelf context and
 * always in its own section. A late answer for a screen that closed, or for
 * another version or owner, is ignored; each state is announced once and
 * screen-reader focus follows the change.
 */
export function ProductDetail({ owner, versionId, userProductId, backLabel, onBack }: Props) {
  const requestKey = `${owner}|${versionId}|${userProductId ?? ''}`;
  const [view, setView] = useState<{ key: string; value: LoadState }>({ key: requestKey, value: { status: 'loading' } });
  const [problemKey, setProblemKey] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const titleRef = useRef<unknown>(null);
  const statusRef = useRef<unknown>(null);

  const load = () => {
    const turn = ++generation.current;
    setProblemKey(null);
    setView({ key: requestKey, value: { status: 'loading' } });
    announce('Loading product details.');
    getCatalogueProductDetail({ versionId, userProductId }).then(detail => {
      if (!mounted.current || turn !== generation.current) return;
      setView({ key: requestKey, value: { status: 'ready', detail } });
      announce(detail.lifecycle.state === 'retired' ? 'Product details loaded. This is a retired version.' : 'Product details loaded.');
    }, (error: unknown) => {
      if (!mounted.current || turn !== generation.current) return;
      const failure = detailFailure(error);
      setView({ key: requestKey, value: { status: 'failed', failure } });
      announce(failure.message);
    });
  };

  // Closing the screen, or a new request, invalidates every read still in flight.
  const invalidate = () => { mounted.current = false; ++generation.current; };

  useEffect(() => {
    mounted.current = true;
    // The read starts when the request changes; its state updates are the screen's loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return invalidate;
    // A new owner, version or Shelf context is a new read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // An answer for an earlier request is never painted for this one.
  const current: LoadState = view.key === requestKey ? view.value : { status: 'loading' };
  useEffect(() => { focusOn(current.status === 'ready' ? titleRef : statusRef); }, [current.status, requestKey]);

  return <View style={{ gap: 20 }}>
    <Text ref={titleRef as never} accessibilityRole="header" style={styles.title}>Product details</Text>
    <Button title="Back" accessibilityLabel={`Back to ${backLabel}`} secondary onPress={onBack} />
    {current.status === 'loading' && <Text ref={statusRef as never} style={styles.body}>Loading product details…</Text>}
    {current.status === 'failed' && <View style={styles.card}>
      <Text ref={statusRef as never} style={styles.error}>{current.failure.message}</Text>
      {current.failure.kind !== 'not_found' && <Button title="Try again" accessibilityLabel="Try loading the product details again" onPress={load} />}
    </View>}
    {current.status === 'ready' && <Body key={requestKey} detail={current.detail} onProblem={() => { setProblemKey(requestKey); announce('The link could not be opened. Nothing was changed.'); }} />}
    {problemKey === requestKey && <Text accessibilityRole="alert" style={styles.error}>The link could not be opened. Nothing was changed.</Text>}
  </View>;
}
