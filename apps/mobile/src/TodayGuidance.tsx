import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  normalizeCurrentCondition,
  type CurrentConditionInput,
  type GuidanceGap,
  type ProtocolDecision,
} from '../../../packages/domain/src/index';
import {
  CHECK_IN_IDLE_BODY,
  CHECK_IN_START_LABEL,
  CHECK_IN_SUMMARY_HEADING,
  CHECK_IN_SUMMARY_SESSION_ONLY,
  CHECK_IN_SUMMARY_TIME,
  CONCERN_LABELS,
  CONTENT_PENDING_BODY,
  confidenceLabel,
  DESTINATION_LABELS,
  EXECUTION_BOUNDARY,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_FAILED,
  EXECUTION_RELOAD_LABEL,
  GENERATE_LABEL,
  GENERATING_LABEL,
  gapDestination,
  LOADING_LABEL,
  MISSING_HEADING,
  NO_PURCHASE_NEEDED,
  READY_TITLE,
  RETRY_LABEL,
  REVIEW_CHECK_IN_LABEL,
  SAVE_FAILED,
  START_OVER_LABEL,
  statusTitle,
  stepLabel,
} from './guidance/guidance-copy';
import {
  initialPreflight,
  preflightReducer,
  type CheckInDraft,
} from './guidance/current-condition-state';
import { recordRecommendationRun } from './guidance/recommendation-run-api';
import { generateTodayGuidance } from './guidance/today-guidance-service';
import { useTodayRestore } from './guidance/today-restore';
import { TodayCheckIn } from './TodayCheckIn';
import { ProtocolExecution } from './ProtocolExecution';
import type { DestinationId } from './navigation';
import { Button, styles } from './ui';

export interface TodayGuidanceProps {
  readonly ownerId: string;
  readonly onNavigate: (destination: DestinationId) => void;
}

/**
 * Today's guidance preflight state machine.
 *
 * States: `idle → checking_in → ready_to_generate → generating → result`,
 * with owner and request epochs. The check-in is a temporary cosmetic
 * self-report for one request only — never a diagnosis, never a Passport
 * write, never invented advice.
 *
 * Four rules this component exists to enforce:
 *
 * 1. Nothing generates on mount or on owner change. Guidance is produced
 *    only when the owner completes a check-in and asks for a plan. An owner
 *    change resets the machine to `idle` and discards in-flight responses.
 * 2. A late response from an older request never overwrites the current
 *    result. Every generation carries a request epoch; only the newest one
 *    may apply, and nothing applies after unmount.
 * 3. Duplicate taps generate once. An in-flight guard plus the reducer's
 *    `generation_started` gate mean one epoch is one generation.
 * 4. A generated plan is persisted exactly once. If saving fails, the plan is
 *    still shown and the failure is stated — it is never regenerated, because
 *    regenerating would silently change the decision being read.
 */

const GOAL_ID = 'basic_wash' as const;
const GOAL_LABEL = 'Basic wash';

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  // Must be a UUID: the persistence boundary and the uuid column both require
  // one. A non-UUID fallback would make every audit save fail silently.
  return Crypto.randomUUID();
}

function GapList({
  gaps,
  onNavigate,
  onReviewCheckIn,
}: {
  readonly gaps: readonly GuidanceGap[];
  readonly onNavigate: (destination: DestinationId) => void;
  readonly onReviewCheckIn: (() => void) | null;
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
        {destination === null && gap.kind === 'current_condition' && onReviewCheckIn !== null && (
          <Button
            title={REVIEW_CHECK_IN_LABEL}
            accessibilityLabel={REVIEW_CHECK_IN_LABEL}
            secondary
            onPress={onReviewCheckIn}
          />
        )}
      </View>;
    })}
  </View>;
}

function CheckInSummary({ draft }: { readonly draft: CheckInDraft }) {
  return <View style={styles.card}>
    <Text style={styles.heading} accessibilityRole="header" accessibilityLabel={CHECK_IN_SUMMARY_HEADING}>
      {CHECK_IN_SUMMARY_HEADING}
    </Text>
    <Text style={styles.body}>
      {draft.concerns.map(concern => CONCERN_LABELS[concern]).join(', ')}
    </Text>
    <Text style={styles.body}>{CHECK_IN_SUMMARY_TIME(draft.availableMinutes ?? 0)}</Text>
    <Text style={styles.body}>{CHECK_IN_SUMMARY_SESSION_ONLY}</Text>
  </View>;
}

function DecisionView({ decision }: { readonly decision: ProtocolDecision }) {
  const evidence = decision.audit.evaluatedRules.flatMap(entry => entry.evidenceIds);
  return <View style={styles.card}>
    <Text style={styles.label}>Confidence</Text>
    <Text style={styles.body}>{confidenceLabel(decision.confidence)}</Text>
    {decision.noPurchaseNeeded === true && (
      <Text style={styles.body} accessibilityRole="text" accessibilityLabel={NO_PURCHASE_NEEDED}>{NO_PURCHASE_NEEDED}</Text>
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
  const [preflight, dispatch] = useReducer(preflightReducer, ownerId, initialPreflight);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Fix E: process-death recovery. This read-only restore runs on mount and
  // on every owner change, independently of generating new guidance. It never
  // generates, records, or starts anything: a validated restore only exposes
  // the STORED decision as context for the execution surface below.
  const restore = useTodayRestore(ownerId);
  const requestEpoch = useRef(0);
  const ownerToken = useRef(0);
  const inflight = useRef(false);
  const mounted = useRef(true);
  const resultRef = useRef<Text | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Supersede any request still in flight for this owner.
      requestEpoch.current += 1;
      ownerToken.current += 1;
      inflight.current = false;
    };
  }, []);

  // The parent keys this component by owner, so a different owner normally
  // remounts it. This effect keeps the same guarantee when the prop changes
  // without a remount: the old owner's draft and result are discarded and no
  // generation follows.
  useEffect(() => {
    dispatch({ type: 'owner_changed', ownerId });
    ownerToken.current += 1;
    inflight.current = false;
  }, [ownerId]);

  useEffect(() => {
    if (preflight.phase === 'result') resultRef.current?.focus?.();
  }, [preflight.phase]);

  const run = useCallback(async () => {
    if (preflight.phase !== 'ready_to_generate' && preflight.phase !== 'result') return;
    if (inflight.current) return;
    // Normalize the validated draft with an explicit instant before anything
    // generates. Unreachable after form validation, but a check-in that
    // cannot be normalized must return to the form — never generate.
    const asOf = nowIso();
    let currentCondition: CurrentConditionInput;
    try {
      currentCondition = normalizeCurrentCondition(
        {
          observedAt: preflight.checkIn.observedAt,
          concerns: [...preflight.checkIn.concerns],
          goal: preflight.checkIn.goal,
          availableMinutes: preflight.checkIn.availableMinutes,
        },
        new Date(asOf),
      );
    } catch {
      dispatch({ type: 'back_to_check_in' });
      return;
    }
    inflight.current = true;
    const current = ++requestEpoch.current;
    const owner = ownerToken.current;
    // A response applies only while mounted, current for this owner, and
    // from the newest request: anything else is a late response and is
    // discarded before it can render or persist.
    const live = () => mounted.current && owner === ownerToken.current && current === requestEpoch.current;
    dispatch({ type: 'generation_started', requestEpoch: current });
    setSaveFailed(false);
    try {
      const result = await generateTodayGuidance({
        ownerId,
        goalId: GOAL_ID,
        requestId: requestId(),
        asOf,
        loadedAt: nowIso(),
        currentCondition,
        now: asOf,
      });
      if (!live()) return;

      dispatch({ type: 'generation_finished', requestEpoch: current, result });

      if (result.status === 'ready' || result.status === 'needs_input'
        || result.status === 'rule_conflict' || result.status === 'unsupported') {
        setSaving(true);
        try {
          await recordRecommendationRun({
            requestId: result.requestId,
            inputFingerprint: result.inputFingerprint,
            asOf: result.asOf,
            engineVersion: result.engineVersion,
            bundleId: result.bundleId,
            bundleVersion: result.bundleVersion,
            status: result.status,
            input: result.input,
            decision: result.decision,
          });
          if (!live()) return;
          setSaving(false);
          setSaveFailed(false);
        } catch {
          // The plan stands; only the private copy failed. Never regenerate.
          if (!live()) return;
          setSaving(false);
          setSaveFailed(true);
        }
        return;
      }
    } catch {
      if (!live()) return;
      dispatch({
        type: 'generation_finished',
        requestEpoch: current,
        result: { status: 'source_error', detail: 'Your records could not be read completely.' },
      });
    } finally {
      inflight.current = false;
    }
  }, [ownerId, preflight.checkIn, preflight.phase]);

  // Today never generates on mount: guidance is produced only when the owner
  // completes a check-in and asks for it, so simply opening the screen cannot
  // create a stored decision run.

  const busy = preflight.phase === 'generating' || saving;
  const result = preflight.result;

  return <View style={{ gap: 16 }}>
    <Text style={styles.kicker}>TODAY · {GOAL_LABEL.toUpperCase()}</Text>

    {restore.phase === 'restoring' && (
      <View style={styles.card}>
        <Text style={styles.body}>{EXECUTION_LOADING_LABEL}</Text>
        <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
      </View>
    )}

    {/* A failed restore is an explicit error with an idempotent retry — never
        a silent fall back to the idle check-in, which would hide a
        server-held execution behind a fresh start. */}
    {restore.phase === 'failed' && (
      <View style={styles.card}>
        <Text accessibilityRole="alert" style={styles.error}>{restore.error ?? EXECUTION_LOAD_FAILED}</Text>
        <Button
          title={EXECUTION_RELOAD_LABEL}
          accessibilityLabel={EXECUTION_RELOAD_LABEL}
          secondary
          onPress={() => restore.retry()}
        />
        <Text style={styles.subtitle}>{EXECUTION_BOUNDARY}</Text>
      </View>
    )}

    {/* A validated restore mounts the recovered execution with the STORED
        decision as context: no new check-in, no new run, no auto-generation.
        The execution surface reloads the same receipt itself and resumes at
        the authoritative revision. Leaving starts a fresh check-in journey. */}
    {restore.phase === 'restored' && restore.decision !== null && (
      <>
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={READY_TITLE}
        >
          {READY_TITLE}
        </Text>
        <DecisionView decision={restore.decision} />
        <ProtocolExecution key={ownerId} ownerId={ownerId} decision={restore.decision} />
        <Button
          title={START_OVER_LABEL}
          accessibilityLabel={START_OVER_LABEL}
          secondary
          onPress={() => restore.dismiss()}
        />
      </>
    )}

    {restore.phase === 'absent' && <>
    {preflight.phase === 'idle' && <>
      <Text style={styles.body}>{CHECK_IN_IDLE_BODY}</Text>
      <Button
        title={CHECK_IN_START_LABEL}
        accessibilityLabel={CHECK_IN_START_LABEL}
        onPress={() => dispatch({ type: 'begin_check_in', observedAt: nowIso() })}
      />
    </>}

    {preflight.phase === 'checking_in' && (
      <TodayCheckIn
        draft={preflight.checkIn}
        errors={preflight.errors}
        nowIso={nowIso}
        dispatch={dispatch}
      />
    )}

    {preflight.phase === 'ready_to_generate' && <>
      <CheckInSummary draft={preflight.checkIn} />
      <Button
        title={busy ? GENERATING_LABEL : GENERATE_LABEL}
        accessibilityLabel={busy ? GENERATING_LABEL : GENERATE_LABEL}
        disabled={busy}
        onPress={() => void run()}
      />
      <Button
        title={REVIEW_CHECK_IN_LABEL}
        accessibilityLabel={REVIEW_CHECK_IN_LABEL}
        secondary
        onPress={() => dispatch({ type: 'back_to_check_in' })}
      />
    </>}

    {preflight.phase === 'generating' && <>
      <Text style={styles.body}>{LOADING_LABEL}</Text>
      <Button
        title={GENERATING_LABEL}
        accessibilityLabel={GENERATING_LABEL}
        disabled
        onPress={() => undefined}
      />
    </>}

    {saveFailed && (
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{SAVE_FAILED}</Text>
      </View>
    )}

    {result !== null && preflight.phase === 'result' && (
      <>
        <Text
          ref={resultRef}
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={statusTitle(result)}
        >
          {statusTitle(result)}
        </Text>
        <CheckInSummary draft={preflight.checkIn} />

        {result.status === 'content_pending' && (
          <Text style={styles.body}>{CONTENT_PENDING_BODY}</Text>
        )}

        {result.status === 'needs_setup' && (
          <GapList
            gaps={result.missing}
            onNavigate={onNavigate}
            onReviewCheckIn={() => dispatch({ type: 'back_to_check_in' })}
          />
        )}

        {result.status === 'source_error' && (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.error}>{result.detail}</Text>
            <Button title={RETRY_LABEL} accessibilityLabel={RETRY_LABEL} secondary onPress={() => void run()} />
          </View>
        )}

        {result.status === 'ready' && <>
          <DecisionView decision={result.decision} />
          {result.decision.steps.length > 0 && (
            <ProtocolExecution key={ownerId} ownerId={ownerId} decision={result.decision} />
          )}
        </>}

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
            {result.decision.omissions.length > 0 && <>
              <Text style={styles.label} accessibilityRole="header" accessibilityLabel={MISSING_HEADING}>{MISSING_HEADING}</Text>
              {result.decision.omissions.map(omission => <Text key={omission} style={styles.body} accessibilityRole="text" accessibilityLabel={omission}>{omission}</Text>)}
            </>}
          </View>
        )}

        <Button
          title={START_OVER_LABEL}
          accessibilityLabel={START_OVER_LABEL}
          secondary
          onPress={() => dispatch({ type: 'reset' })}
        />
      </>
    )}
    </>}

    <Text style={styles.subtitle}>
      Cosmetic hair-care guidance from your own records, not a diagnosis. Nothing here promises a result.
    </Text>
  </View>;
}
