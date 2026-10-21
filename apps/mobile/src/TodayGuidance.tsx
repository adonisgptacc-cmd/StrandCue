import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  normalizeCurrentCondition,
  type CurrentConditionInput,
  type ProtocolDecision,
} from '../../../packages/domain/src/index';
import {
  CHECK_IN_IDLE_BODY,
  CHECK_IN_START_LABEL,
  CHECK_IN_SUMMARY_HEADING,
  CHECK_IN_SUMMARY_SESSION_ONLY,
  CHECK_IN_SUMMARY_TIME,
  CONCERN_LABELS,
  confidenceLabel,
  EXECUTION_BOUNDARY,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_FAILED,
  EXECUTION_RELOAD_LABEL,
  GENERATE_LABEL,
  GENERATING_LABEL,
  LOADING_LABEL,
  MISSING_HEADING,
  NO_PURCHASE_NEEDED,
  READY_TITLE,
  REVIEW_CHECK_IN_LABEL,
  RETRY_FAILED_MESSAGE,
  RESOLVER_CONTENT_HEADING,
  RESOLVER_FAILED_HEADING,
  RESOLVER_HEADING,
  RESOLVER_SETUP_HEADING,
  SAVE_FAILED,
  START_OVER_LABEL,
  statusTitle,
  stepLabel,
} from './guidance/guidance-copy';
import {
  clearCheckInDraft,
  initialPreflight,
  loadCheckInDraft,
  loadResolverFocus,
  preflightReducer,
  saveCheckInDraft,
  saveResolverFocus,
  type CheckInDraft,
} from './guidance/current-condition-state';
import { resolverItems, type GuidanceResolverItem } from './guidance/guidance-gap-state';
import { recordRecommendationRun } from './guidance/recommendation-run-api';
import { generateTodayGuidance } from './guidance/today-guidance-service';
import { useTodayRestore } from './guidance/today-restore';
import { GuidanceGapResolver } from './GuidanceGapResolver';
import { TodayCheckIn } from './TodayCheckIn';
import { ProtocolExecution, type TerminalAbandonReceipt } from './ProtocolExecution';
import type { GuidanceRoute } from './navigation';
import { Button, styles } from './ui';

export interface TodayGuidanceProps {
  readonly ownerId: string;
  readonly onNavigate: (route: GuidanceRoute) => void;
}

/**
 * The part of the check-in a gap named, so the resolver can bring the owner
 * back to exactly that answer.
 */
type CheckInSection = 'concerns' | 'goal' | 'time' | 'observed_at' | 'zones';

function sectionFor(subject: string | null): CheckInSection | null {
  switch (subject) {
    case 'current.concerns':
      return 'concerns';
    case 'current.goal':
      return 'goal';
    case 'current.availableMinutes':
      return 'time';
    case 'current.observedAt':
      return 'observed_at';
    case 'current.zones':
    case 'current.zoneConcerns':
      return 'zones';
    default:
      return null;
  }
}

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

/** The check-in, as the service expects it: zones only when they were named. */
function currentConditionOf(draft: CheckInDraft): Record<string, unknown> {
  return {
    observedAt: draft.observedAt,
    concerns: [...draft.concerns],
    goal: draft.goal,
    availableMinutes: draft.availableMinutes,
    ...(draft.zones.length > 0 ? { zones: draft.zones.map(zone => ({ ...zone })) } : {}),
    ...(draft.zoneConcerns.length > 0
      ? {
          zoneConcerns: draft.zoneConcerns.map(entry => ({
            zone: { ...entry.zone },
            concerns: [...entry.concerns],
          })),
        }
      : {}),
  };
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

/**
 * Today's guidance preflight state machine.
 *
 * States: `idle → checking_in → ready_to_generate → generating → result`,
 * with owner and request epochs. The check-in is a temporary cosmetic
 * self-report for one request only — never a diagnosis, never a Passport
 * write, never invented advice.
 *
 * Five rules this component exists to enforce:
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
 * 5. The check-in survives the trip to a destination. It is kept in an
 *    owner-scoped session draft, so opening My Hair, My Shelf or My Tools and
 *    coming back finds the owner's own answers, unchanged. The draft lives in
 *    the app's memory only: it is never written to the Hair Passport and
 *    never sent anywhere. (The facts a *generated plan* used are kept in the
 *    owner-scoped private run record, which is the accepted audit design from
 *    Task 3.1; that record is not this draft.) The draft is cleared the
 *    moment the owner changes, signs out or deletes the account.
 */
export function TodayGuidance({ ownerId, onNavigate }: TodayGuidanceProps) {
  const [preflight, dispatch] = useReducer(preflightReducer, ownerId, initialPreflight);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [focusSection, setFocusSection] = useState<CheckInSection | null>(null);
  // Fix E: process-death recovery. This read-only restore runs on mount and
  // on every owner change, independently of generating new guidance. It never
  // generates, records, or starts anything: a validated restore only exposes
  // the STORED decision as context for the execution surface below.
  const restore = useTodayRestore(ownerId);
  const requestEpoch = useRef(0);
  const ownerToken = useRef(0);
  const inflight = useRef(false);
  const mounted = useRef(true);
  const attempted = useRef(false);
  const resultRef = useRef<Text | null>(null);

  // An owner change is handled during the render, not in an effect: the
  // previous owner's answers are cleared before anything is painted, so no
  // frame of the previous owner's check-in can ever be shown to the next one.
  const [previousOwner, setPreviousOwner] = useState(ownerId);
  const [restoredOwner, setRestoredOwner] = useState<string | null>(null);
  if (previousOwner !== ownerId) {
    setPreviousOwner(ownerId);
    clearCheckInDraft(previousOwner);
    dispatch({ type: 'owner_changed', ownerId });
  }
  if (restoredOwner !== ownerId) {
    setRestoredOwner(ownerId);
    const draft = loadCheckInDraft(ownerId);
    if (draft !== null) dispatch({ type: 'restore_check_in', draft });
  }

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
    // A new owner starts with a clean slate: no attempt of the previous
    // owner counts as theirs.
    attempted.current = false;
  }, [ownerId]);

  // The check-in is kept in an owner-scoped session draft so it survives a
  // trip to another screen. It is session-only and never leaves the device.
  useEffect(() => {
    if (preflight.phase === 'idle') {
      clearCheckInDraft(ownerId);
      return;
    }
    saveCheckInDraft(ownerId, preflight.checkIn);
  }, [ownerId, preflight.phase, preflight.checkIn]);

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
        currentConditionOf(preflight.checkIn),
        new Date(asOf),
      );
    } catch {
      // A check-in the domain cannot use must return to the form with a
      // reason, never generate and never disappear without a word.
      dispatch({ type: 'back_to_check_in', error: 'check_in_unusable' });
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
    setRetryFailed(false);
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

      // A read has been attempted. A later failure is a retry that failed
      // again, not the first failure, and is said as such.
      const isRetryFailure = attempted.current;
      attempted.current = true;

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
      if (result.status === 'source_error' && isRetryFailure) setRetryFailed(true);
    } catch {
      if (!live()) return;
      dispatch({
        type: 'generation_finished',
        requestEpoch: current,
        result: { status: 'source_error', detail: 'Your records could not be read completely.' },
      });
      if (attempted.current) setRetryFailed(true);
      attempted.current = true;
    } finally {
      inflight.current = false;
    }
  }, [ownerId, preflight.checkIn, preflight.phase]);

  // Fix G: post-abandon return to idle, gated on the authoritative terminal
  // receipt. The execution surface notifies only after the server confirms
  // abandoned status (never from the optimistic preview or a failed
  // transition), so returning here can never hide a live execution behind a
  // fresh check-in. Offline, failed, or conflicting abandonment keeps the
  // active execution visible with retry/error copy instead.
  const releaseAbandoned = restore.releaseAbandoned;
  const restoredExecutionId = restore.execution?.executionId ?? null;
  const handleTerminalAbandoned = useCallback((receipt: TerminalAbandonReceipt) => {
    if (receipt.status !== 'abandoned') return;
    // Execution-scoped (Fix H carried hardening): only a receipt for the
    // execution actually restored on this screen may release the restored
    // context. A mismatched or foreign reply — another execution, another
    // owner's session — must never drop this screen to a fresh check-in over
    // an execution that is still live server-side.
    if (restoredExecutionId === null || receipt.executionId !== restoredExecutionId) return;
    releaseAbandoned();
  }, [releaseAbandoned, restoredExecutionId]);

  // Today never generates on mount: guidance is produced only when the owner
  // completes a check-in and asks for it, so simply opening the screen cannot
  // create a stored decision run.

  const busy = preflight.phase === 'generating' || saving;
  const result = preflight.result;
  /**
   * A retry keeps the resolver on screen: the owner sees the same gap, the
   * retry button is disabled while the read runs, and a failed retry leaves
   * their focus where it was.
   */
  const isRetry = preflight.phase === 'generating' && result !== null;

  /**
   * The resolver list. A failed read becomes one item per source, a
   * contradicted or missing answer becomes one item per gap, and content
   * that is not published becomes one item that asks nothing of the owner.
   *
   * The blocking gaps and the optional setup never share a list: a setup
   * item is the owner's own next step, not something a plan needs.
   */
  const items: readonly GuidanceResolverItem[] = useMemo(() => {
    if (result === null) return [];
    if (result.status === 'needs_setup') {
      return resolverItems({
        gaps: [...result.missing],
        failedSources: [],
        contentPending: false,
      });
    }
    if (result.status === 'source_error') {
      return resolverItems({
        gaps: [],
        failedSources: result.incompleteSources ?? [],
        contentPending: false,
        sourceReadFailed: true,
      });
    }
    if (result.status === 'content_pending') {
      return resolverItems({ gaps: [], failedSources: [], contentPending: true });
    }
    return resolverItems({
      gaps: [...(result.setup ?? [])],
      failedSources: [],
      contentPending: false,
    });
  }, [result]);

  /** The heading names what the resolver is showing, so it is never wrong. */
  const resolverHeading = useMemo(() => {
    if (result === null) return RESOLVER_HEADING;
    if (result.status === 'needs_setup') return RESOLVER_HEADING;
    if (result.status === 'source_error') return RESOLVER_FAILED_HEADING;
    if (result.status === 'content_pending') return RESOLVER_CONTENT_HEADING;
    return RESOLVER_SETUP_HEADING;
  }, [result]);

  const handleNavigate = useCallback((route: GuidanceRoute) => {
    onNavigate(route);
  }, [onNavigate]);

  const handleReviewCheckIn = useCallback((subject: string | null) => {
    setFocusSection(sectionFor(subject));
    dispatch({ type: 'back_to_check_in' });
  }, []);

  const handleRetry = useCallback(() => {
    void run();
  }, [run]);

  /** The gap the owner was resolving, so focus can go back to it. */
  const focusKey = useMemo(() => {
    const stored = loadResolverFocus(ownerId);
    return stored !== null && items.some(item => item.key === stored) ? stored : null;
  }, [items, ownerId]);

  const rememberFocus = useCallback((key: string | null) => {
    saveResolverFocus(ownerId, key);
  }, [ownerId]);

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
        The execution surface resumes directly from the receipt carried here —
        one validated read, no second active-execution read that another
        session could race. There is deliberately no local dismiss
        here: hiding a live execution would invite a second execution over
        it. The only way back to idle is the audited abandon transition —
        Today returns through the server-confirmed terminal receipt via
        onTerminalAbandoned, reusing the dispatcher + transition RPC. */}
    {restore.phase === 'restored' && restore.decision !== null && restore.execution !== null && (
      <>
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={READY_TITLE}
        >
          {READY_TITLE}
        </Text>
        <DecisionView decision={restore.decision} />
        <ProtocolExecution
          key={ownerId}
          ownerId={ownerId}
          decision={restore.decision}
          initialExecution={restore.execution}
          initialRevision={restore.revision ?? undefined}
          onTerminalAbandoned={handleTerminalAbandoned}
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
        focusSection={focusSection}
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

    {preflight.phase === 'generating' && !isRetry && <>
      <Text style={styles.body}>{LOADING_LABEL}</Text>
      <Button
        title={GENERATING_LABEL}
        accessibilityLabel={GENERATING_LABEL}
        disabled
        onPress={() => undefined}
      />
    </>}

    {isRetry && <Text style={styles.body}>{LOADING_LABEL}</Text>}

    {saveFailed && (
      <View style={styles.notice}>
        <Text accessibilityRole="alert" style={styles.error}>{SAVE_FAILED}</Text>
      </View>
    )}

    {result !== null && (preflight.phase === 'result' || isRetry) && (
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

        {result.status === 'source_error' && (
          <Text style={styles.body}>{result.detail}</Text>
        )}

        {items.length > 0 && (
          <GuidanceGapResolver
            items={items}
            heading={resolverHeading}
            onNavigate={(route, key) => { rememberFocus(key); handleNavigate(route); }}
            onRetry={handleRetry}
            onReviewCheckIn={handleReviewCheckIn}
            retrying={isRetry}
            retryError={retryFailed && result.status === 'source_error' ? RETRY_FAILED_MESSAGE : null}
            focusKey={focusKey}
          />
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
