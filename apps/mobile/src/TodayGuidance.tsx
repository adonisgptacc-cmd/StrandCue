import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { GuidanceGap, ProtocolDecision } from '../../../packages/domain/src/index';
import {
  CONTENT_PENDING_BODY,
  confidenceLabel,
  DESTINATION_LABELS,
  GENERATE_LABEL,
  GENERATING_LABEL,
  gapDestination,
  LOADING_LABEL,
  NO_PURCHASE_NEEDED,
  RETRY_LABEL,
  SAVE_FAILED,
  statusTitle,
  stepLabel,
} from './guidance/guidance-copy';
import { recordRecommendationRun } from './guidance/recommendation-run-api';
import type { TodayGuidanceResult } from './guidance/today-guidance-service';
import { generateTodayGuidance } from './guidance/today-guidance-service';
import type { DestinationId } from './navigation';
import { Button, styles } from './ui';

export interface TodayGuidanceProps {
  readonly ownerId: string;
  readonly onNavigate: (destination: DestinationId) => void;
}

/**
 * Today's guidance state machine.
 *
 * States: `loading` (records being read), `blocked` (a safe refusal — setup
 * gaps, pending content, conflicts, unsupported), `ready` (a protocol to
 * show), and `error` (a source could not be read).
 *
 * Three rules this component exists to enforce:
 *
 * 1. A late response from an older request never overwrites the current
 *    owner's result. Every request carries an epoch; only the newest one may
 *    apply, and nothing applies after unmount.
 * 2. A generated plan is persisted exactly once. If saving fails, the plan is
 *    still shown and the failure is stated — it is never regenerated, because
 *    regenerating would silently change the decision the user is reading.
 * 3. Nothing is shown that a reviewed decision did not produce. There is no
 *    cached or generic fallback when a source fails.
 */

const GOAL_ID = 'basic_wash' as const;
const GOAL_LABEL = 'Basic wash';

type Phase = 'idle' | 'loading' | 'blocked' | 'ready' | 'error';

interface State {
  readonly phase: Phase;
  readonly result: TodayGuidanceResult | null;
  readonly saving: boolean;
  readonly saveFailed: boolean;
}

const INITIAL: State = { phase: 'idle', result: null, saving: false, saveFailed: false };

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}-${Math.random()}`;
}

function GapList({
  gaps,
  onNavigate,
}: {
  readonly gaps: readonly GuidanceGap[];
  readonly onNavigate: (destination: DestinationId) => void;
}) {
  return <View style={styles.card}>
    <Text style={styles.heading}>What is needed</Text>
    {gaps.map(gap => {
      const destination = gapDestination(gap.kind);
      return <View key={`${gap.kind}-${gap.subject ?? ''}-${gap.detail}`} style={styles.notice}>
        <Text style={styles.body}>{gap.detail}</Text>
        {destination !== null && (
          <Button
            title={DESTINATION_LABELS[destination]}
            accessibilityLabel={DESTINATION_LABELS[destination]}
            secondary
            onPress={() => onNavigate(destination)}
          />
        )}
      </View>;
    })}
  </View>;
}

function DecisionView({ decision }: { readonly decision: ProtocolDecision }) {
  const evidence = decision.audit.evaluatedRules.flatMap(entry => entry.evidenceIds);
  return <View style={styles.card}>
    <Text style={styles.label}>Confidence</Text>
    <Text style={styles.body}>{confidenceLabel(decision.confidence)}</Text>
    {decision.noPurchaseNeeded === true && (
      <Text style={styles.body} accessibilityRole="text">{NO_PURCHASE_NEEDED}</Text>
    )}
    <Text style={styles.label}>Steps</Text>
    {decision.steps.map(step => (
      <View key={step.stepId} style={styles.notice}>
        <Text style={styles.label}>{stepLabel(step.position)}</Text>
        <Text style={styles.body}>{step.action}</Text>
        {step.reasons.map(reason => <Text key={reason} style={styles.subtitle}>{reason}</Text>)}
      </View>
    ))}
    {decision.omissions.length > 0 && <>
      <Text style={styles.label}>Not included</Text>
      {decision.omissions.map(omission => <Text key={omission} style={styles.body}>{omission}</Text>)}
    </>}
    {decision.alternatives.length > 0 && <>
      <Text style={styles.label}>Alternatives</Text>
      {decision.alternatives.map(alternative => <Text key={alternative} style={styles.body}>{alternative}</Text>)}
    </>}
    {decision.missingInputs.length > 0 && <>
      <Text style={styles.label}>Still needed</Text>
      {decision.missingInputs.map(missing => <Text key={missing} style={styles.body}>{missing}</Text>)}
    </>}
    <Text style={styles.label}>Evidence</Text>
    {evidence.length === 0
      ? <Text style={styles.body}>No evidence references were attached to this decision.</Text>
      : evidence.map(id => <Text key={id} style={styles.body}>{id}</Text>)}
  </View>;
}

export function TodayGuidance({ ownerId, onNavigate }: TodayGuidanceProps) {
  const [state, setState] = useState<State>(INITIAL);
  const epoch = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Supersede any request still in flight for this owner.
      epoch.current += 1;
    };
  }, []);

  const run = useCallback(async () => {
    const current = ++epoch.current;
    setState(previous => ({ ...previous, phase: 'loading', saveFailed: false }));
    const asOf = nowIso();
    try {
      const result = await generateTodayGuidance({
        ownerId,
        goalId: GOAL_ID,
        requestId: requestId(),
        asOf,
        loadedAt: nowIso(),
      });
      // A response from a superseded request, or after unmount, is discarded.
      if (!mounted.current || current !== epoch.current) return;

      if (result.status === 'ready' || result.status === 'needs_input'
        || result.status === 'rule_conflict' || result.status === 'unsupported') {
        setState({ phase: 'ready', result, saving: true, saveFailed: false });
        try {
          await recordRecommendationRun({
            requestId: result.requestId,
            inputFingerprint: result.inputFingerprint,
            asOf: result.asOf,
            engineVersion: result.engineVersion,
            bundleId: result.bundleId,
            bundleVersion: result.bundleVersion,
            status: result.status,
            input: result.decision.audit,
            decision: result.decision,
          });
          if (!mounted.current || current !== epoch.current) return;
          setState(previous => ({ ...previous, saving: false, saveFailed: false }));
        } catch {
          // The plan stands; only the private copy failed. Never regenerate.
          if (!mounted.current || current !== epoch.current) return;
          setState(previous => ({ ...previous, saving: false, saveFailed: true }));
        }
        return;
      }

      setState({
        phase: result.status === 'source_error' ? 'error' : 'blocked',
        result,
        saving: false,
        saveFailed: false,
      });
    } catch {
      if (!mounted.current || current !== epoch.current) return;
      setState({
        phase: 'error',
        result: { status: 'source_error', detail: 'Your records could not be read completely.' },
        saving: false,
        saveFailed: false,
      });
    }
  }, [ownerId]);

  // Today never generates on mount: guidance is produced only when the user
  // asks for it, so simply opening the screen cannot create a stored decision
  // run. The parent keys this component by owner, so a different owner starts
  // clean and any request in flight for the previous owner is superseded.

  const busy = state.phase === 'loading' || state.saving;
  const result = state.result;

  return <View style={{ gap: 16 }}>
    <Text style={styles.kicker}>TODAY · {GOAL_LABEL.toUpperCase()}</Text>
    <Button
      title={busy ? GENERATING_LABEL : GENERATE_LABEL}
      accessibilityLabel={busy ? GENERATING_LABEL : GENERATE_LABEL}
      disabled={busy}
      onPress={() => void run()}
    />

    {state.phase === 'loading' && <Text style={styles.body}>{LOADING_LABEL}</Text>}
    {state.phase === 'idle' && (
      <Text style={styles.body}>
        Choose a goal and generate a plan. Nothing is created until you ask for it.
      </Text>
    )}

    {state.saveFailed && (
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{SAVE_FAILED}</Text>
      </View>
    )}

    {result !== null && state.phase !== 'loading' && (
      <>
        <Text style={styles.title}>{statusTitle(result)}</Text>

        {result.status === 'content_pending' && (
          <Text style={styles.body}>{CONTENT_PENDING_BODY}</Text>
        )}

        {result.status === 'needs_setup' && (
          <GapList gaps={result.missing} onNavigate={onNavigate} />
        )}

        {result.status === 'source_error' && (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.error}>{result.detail}</Text>
            <Button title={RETRY_LABEL} accessibilityLabel={RETRY_LABEL} secondary onPress={() => void run()} />
          </View>
        )}

        {result.status === 'ready' && <DecisionView decision={result.decision} />}

        {result.status === 'needs_input' && (
          <View style={styles.card}>
            <Text style={styles.body}>
              A reviewed rule needs information you have not recorded yet, so no plan was produced.
            </Text>
            <DecisionView decision={result.decision} />
          </View>
        )}

        {result.status === 'rule_conflict' && (
          <View style={styles.card}>
            <Text style={styles.body}>
              Two reviewed rules cannot both apply here, so no plan was produced.
            </Text>
          </View>
        )}

        {result.status === 'unsupported' && (
          <View style={styles.card}>
            <Text style={styles.body}>
              No published reviewed rule covers this situation yet. Nothing is being suggested in its place.
            </Text>
          </View>
        )}
      </>
    )}

    <Text style={styles.subtitle}>
      Cosmetic hair-care guidance from your own records, not a diagnosis. Nothing here promises a result.
    </Text>
  </View>;
}