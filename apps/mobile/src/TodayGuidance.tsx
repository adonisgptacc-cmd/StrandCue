import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import {
  normalizeCurrentCondition,
  type CurrentConditionInput,
} from '../../../packages/domain/src/index';
import {
  CHECK_IN_IDLE_BODY,
  CHECK_IN_START_LABEL,
  CHECK_IN_SUMMARY_HEADING,
  CHECK_IN_SUMMARY_SESSION_ONLY,
  CHECK_IN_SUMMARY_TIME,
  CONCERN_LABELS,
  EXECUTION_BOUNDARY,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_FAILED,
  EXECUTION_RELOAD_LABEL,
  GENERATE_LABEL,
  GENERATING_LABEL,
  LOADING_LABEL,
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
} from './guidance/guidance-copy';
import { buildProtocolPreview, type ProtocolPreviewModel } from './guidance/protocol-preview-model';
import { CURRENT_REVIEWED_BUNDLE } from './guidance/reviewed-bundle';
import { CHECKED_IN_EVIDENCE_REGISTRY } from './guidance/evidence-registry';
import { ProtocolPreview } from './ProtocolPreview';
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
import { resolverItems, type GuidanceResolverItem, type GuidanceResolverRole } from './guidance/guidance-gap-state';
import { recordRecommendationRun } from './guidance/recommendation-run-api';
import { hasMatchingTrustedReceipt, requestTodayGuidance } from './guidance/today-guidance-server-api';
import { useTodayRestore } from './guidance/today-restore';
import { GuidanceGapResolver } from './GuidanceGapResolver';
import { TodayCheckIn } from './TodayCheckIn';
import { ProtocolExecution, type TerminalAbandonReceipt } from './ProtocolExecution';
import type { GuidanceRoute } from './navigation';
import type { TerminalExecutionContext } from './cue-check-state';
import { Button, styles } from './ui';

export interface TodayGuidanceProps {
  readonly ownerId: string;
  readonly onNavigate: (route: GuidanceRoute) => void;
  /** Opens the Cue Check form for a finished routine; see ProtocolExecution. */
  readonly onCueCheck?: (execution: TerminalExecutionContext) => void;
  /** Opens a separate owner-entered heat-intent flow; carries no Today verdict. */
  readonly onOpenHeatCoach?: () => void;
}

/** A route hint from recorded facts, never a heat decision. */
export function todayHasHeatContext(checkIn: CheckInDraft): boolean {
  return checkIn.concerns.includes('heat-concern');
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
 * 4. Non-executable outcomes are persisted exactly once. Only a server-ready
 *    result with a matching trusted receipt can offer Start; the database
 *    independently checks the stored run and source revision.
 * 5. The check-in survives the trip to a destination. It is kept in an
 *    owner-scoped session draft, so opening My Hair, My Shelf or My Tools and
 *    coming back finds the owner's own answers, unchanged. The draft lives in
 *    the app's memory only: it is never written to the Hair Passport.
 *    Its answers are sent to the authenticated guidance function only when
 *    the owner requests a plan. Non-executable guidance outcomes may have an
 *    owner-scoped private run record; that record is not this draft. The draft is cleared the
 *    moment the owner changes, signs out or deletes the account.
 */
export function TodayGuidance({ ownerId, onNavigate, onCueCheck, onOpenHeatCoach }: TodayGuidanceProps) {
  const [preflight, dispatch] = useReducer(preflightReducer, ownerId, initialPreflight);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
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
  const readFailed = useRef(false);
  const resultRef = useRef<Text | null>(null);

  /**
   * The fail-closed preview for the current server decision, rebuilt from its
   * exact context. The checked-in bundle and
   * evidence registry are the authority for every binding. `null` when there
   * is nothing to preview (idle, check-in, or a non-decision result).
   */

  // An owner change is handled during the render, not in an effect: the
  // previous owner's answers are cleared before anything is painted, so no
  // frame of the previous owner's check-in can ever be shown to the next one.
  const [previousOwner, setPreviousOwner] = useState(ownerId);
  const [restoredOwner, setRestoredOwner] = useState<string | null>(null);
  if (previousOwner !== ownerId) {
    setPreviousOwner(ownerId);
    setStartRequested(false);
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
    readFailed.current = false;
  }, [ownerId]);

  // The check-in is kept in an owner-scoped session draft so it survives a
  // trip to another screen. The draft is session-only; its answers are sent
  // to the authenticated guidance function only on explicit generation.
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
    setStartRequested(false);
    try {
      const result = await requestTodayGuidance({
        goalId: GOAL_ID,
        requestId: requestId(),
        currentCondition,
      });
      if (!live()) return;

      dispatch({ type: 'generation_finished', requestEpoch: current, result });

      if (result.status === 'needs_input'
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
      // A read has failed. A later failure is a retry that failed again, not
      // the first failure, and is said as such.
      if (result.status === 'source_error' && readFailed.current) setRetryFailed(true);
      if (result.status === 'source_error') readFailed.current = true;
    } catch {
      if (!live()) return;
      dispatch({
        type: 'generation_finished',
        requestEpoch: current,
        result: { status: 'source_error', detail: 'Your records could not be read completely.' },
      });
      if (readFailed.current) setRetryFailed(true);
      readFailed.current = true;
    } finally {
      inflight.current = false;
    }
  }, [preflight.checkIn, preflight.phase]);

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
   * The fail-closed preview for the current decision, rebuilt only from the
   * stored decision and its exact stored context. The checked-in bundle and
   * evidence registry are the authority for every binding. `null` when there
   * is nothing to preview (idle, check-in, or a non-decision result).
   */
  const previewModel = useMemo<ProtocolPreviewModel | null>(() => {
    if (result === null || result.status !== 'ready') return null;
    return buildProtocolPreview({
      decision: result.decision,
      context: result.input,
      bundle: CURRENT_REVIEWED_BUNDLE,
      evidenceRegistry: CHECKED_IN_EVIDENCE_REGISTRY,
    });
  }, [result]);

  /**
   * The same fail-closed preview for a restored stored decision, built from
   * the decision and its exact stored context rather than the live shelf.
   */
  const restoredPreviewModel = useMemo<ProtocolPreviewModel | null>(() => {
    if (restore.decision === null || restore.run === null) return null;
    return buildProtocolPreview({
      decision: restore.decision,
      context: restore.run.input,
      bundle: CURRENT_REVIEWED_BUNDLE,
      evidenceRegistry: CHECKED_IN_EVIDENCE_REGISTRY,
    });
  }, [restore.decision, restore.run]);
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

  /** The role decides what the resolver announces, so it never overstates. */
  const resolverRole = useMemo<GuidanceResolverRole>(() => {
    if (result === null) return 'attention';
    if (result.status === 'needs_setup') return 'attention';
    if (result.status === 'source_error') return 'failed';
    if (result.status === 'content_pending') return 'content';
    return 'setup';
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
    {onOpenHeatCoach && restore.phase === 'absent'
      && todayHasHeatContext(preflight.checkIn) &&
      <Button title="Review heat choices in Heat Coach" secondary onPress={onOpenHeatCoach}/>}

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
        {restoredPreviewModel !== null && <ProtocolPreview model={restoredPreviewModel} />}
        <ProtocolExecution
          key={ownerId}
          ownerId={ownerId}
          decision={restore.decision}
          initialExecution={restore.execution}
          initialRevision={restore.revision ?? undefined}
          onTerminalAbandoned={handleTerminalAbandoned}
          onOpenCueCheck={onCueCheck}
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
          accessibilityRole={items.length > 0 ? 'text' : 'header'}
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
            role={resolverRole}
            onNavigate={(route, key) => { rememberFocus(key); handleNavigate(route); }}
            onRetry={handleRetry}
            onReviewCheckIn={handleReviewCheckIn}
            retrying={isRetry}
            retryError={retryFailed && result.status === 'source_error' ? RETRY_FAILED_MESSAGE : null}
            focusKey={focusKey}
          />
        )}

        {result.status === 'ready' && previewModel !== null && !startRequested && (
          <ProtocolPreview
            model={previewModel}
            onStart={hasMatchingTrustedReceipt(result) ? () => setStartRequested(true) : undefined}
          />
        )}
        {result.status === 'ready' && startRequested && hasMatchingTrustedReceipt(result) && (
          <ProtocolExecution
            key={`${ownerId}:${result.receipt.id}`}
            ownerId={ownerId}
            decision={result.decision}
            onOpenCueCheck={onCueCheck}
          />
        )}
        {result.status === 'ready' && !hasMatchingTrustedReceipt(result) && (
          <Text style={styles.subtitle}>
            Preview only. Starting this routine is unavailable.
          </Text>
        )}

        {result.status === 'needs_input' && (
          <View style={styles.card}>
            <Text style={styles.body}>
              A reviewed rule needs information you have not recorded yet, so no plan was produced.
            </Text>
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

        <Button
          title={START_OVER_LABEL}
          accessibilityLabel={START_OVER_LABEL}
          secondary
          onPress={() => {
            setStartRequested(false);
            dispatch({ type: 'reset' });
          }}
        />
      </>
    )}
    </>}

    <Text style={styles.subtitle}>
      Cosmetic hair-care guidance from your own records, not a diagnosis. Nothing here promises a result.
    </Text>
  </View>;
}
