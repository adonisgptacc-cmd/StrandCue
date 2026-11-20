import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';

import type { ToolDetail } from '../../../packages/domain/src/index';
import { focusOn } from './focus';
import { ClaimsSection, Lines, Section } from './ProductDetail';
import { getToolCatalogueDetail } from './tool-catalogue-api';
import {
  catalogueCapabilityLines,
  ownerToolLines,
  toolCandidateLines,
  toolDetailFailure,
  toolCapabilityNotice,
  toolOwnerHistoryLines,
  toolVersionLifecycleLines,
} from './tool-copy';
import { Button, styles } from './ui';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: ReturnType<typeof toolDetailFailure> }
  | { status: 'ready'; detail: ToolDetail };

type Props = {
  owner: string;
  versionId: string;
  /** An owner context. Without one the screen reads the catalogue only and shows no owner facts. */
  userToolId: string | null;
  /** Where Back goes, in words: "search results", "the comparison", "your tool". */
  backLabel: string;
  onBack: () => void;
};

/** Spoken once by the screen reader; a status that merely mounts with its text is not reliably announced. */
const announce = (text: string): void => { AccessibilityInfo.announceForAccessibility(text); };

function Body({ detail }: { detail: ToolDetail }) {
  const { capabilities, claims, owner } = detail;
  const [problem, setProblem] = useState(false);
  return <>
    {detail.lifecycle.state === 'retired' && <Text style={styles.error}>
      Retired version: this is an older version, not the current one.
    </Text>}
    <Section title="Exact catalogue identity">
      <Lines lines={toolCandidateLines(detail.identity)} />
    </Section>
    <Section title="Version status">
      <Lines lines={toolVersionLifecycleLines(detail.lifecycle)} />
    </Section>
    <Section title="Published capabilities">
      {capabilities.state === 'published'
        ? <Lines lines={catalogueCapabilityLines(capabilities.content)} />
        : <Text style={styles.body}>{toolCapabilityNotice(capabilities.state)}</Text>}
    </Section>
    <ClaimsSection claims={claims} onProblem={() => setProblem(true)} />
    {problem && <Text accessibilityRole="alert" style={styles.error}>The link could not be opened. Nothing was changed.</Text>}
    {owner !== null && <Section title="Your private record (only you can see this)">
      <Text style={styles.body}>What the catalogue lists is not something you observed. What you recorded is listed separately, under your private record.</Text>
      <Lines lines={ownerToolLines(owner)} />
      <Lines lines={toolOwnerHistoryLines(owner.revisions)} />
    </Section>}
  </>;
}

/**
 * The consumer detail of one exact tool version.
 *
 * Nothing but a loading state is painted until the server's publication gate has answered, and what it
 * answers is parsed against a strict contract, so no draft can flash. The owner's own record appears only
 * for an owner context and always in its own section. A late answer for a screen that closed, or for
 * another version or owner, is ignored; each state is announced once and screen-reader focus follows it.
 */
export function ToolCatalogueDetail({ owner, versionId, userToolId, backLabel, onBack }: Props) {
  const requestKey = `${owner}|${versionId}|${userToolId ?? ''}`;
  const [view, setView] = useState<{ key: string; value: LoadState }>({ key: requestKey, value: { status: 'loading' } });
  const generation = useRef(0);
  const mounted = useRef(true);
  const titleRef = useRef<unknown>(null);

  const load = () => {
    const turn = ++generation.current;
    setView({ key: requestKey, value: { status: 'loading' } });
    announce('Loading tool details.');
    getToolCatalogueDetail({ versionId, userToolId }).then(detail => {
      if (!mounted.current || turn !== generation.current) return;
      setView({ key: requestKey, value: { status: 'ready', detail } });
      announce(detail.lifecycle.state === 'retired' ? 'Tool details loaded. This is a retired version.' : 'Tool details loaded.');
    }, (error: unknown) => {
      if (!mounted.current || turn !== generation.current) return;
      const failure = toolDetailFailure(error);
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
    // A new owner, version or owner context is a new read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // An answer for an earlier request is never painted for this one.
  const current: LoadState = view.key === requestKey ? view.value : { status: 'loading' };
  useEffect(() => { if (current.status === 'ready') focusOn(titleRef); }, [current.status, requestKey]);

  return <View style={{ gap: 20 }}>
    <Text ref={titleRef as never} accessibilityRole="header" style={styles.title}>Tool details</Text>
    <Button title="Back" accessibilityLabel={`Back to ${backLabel}`} secondary onPress={onBack} />
    {current.status === 'loading' && <Text style={styles.body}>Loading tool details…</Text>}
    {current.status === 'failed' && <View style={styles.card}>
      <Text style={styles.error}>{current.failure.message}</Text>
      {current.failure.kind !== 'not_found' && <Button title="Try again" accessibilityLabel="Try loading the tool details again" onPress={load} />}
    </View>}
    {current.status === 'ready' && <Body key={requestKey} detail={current.detail} />}
  </View>;
}
