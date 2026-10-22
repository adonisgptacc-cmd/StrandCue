import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';

import type { CueCheckObservationField, CueCheckTiming } from '../../../packages/domain/src/index';
import type { CueCheckApi } from './cue-check-api';
import { CueCheckDetail } from './CueCheckDetail';
import { CueCheckForm } from './CueCheckForm';
import { CueCheckHistory } from './CueCheckHistory';
import { CueCheckRoutines } from './CueCheckRoutines';
import { CueCheckSummary } from './CueCheckSummary';
import { CueCheckVoidConfirmation } from './CueCheckVoidConfirmation';
import { entryOptions } from './cue-check-entry';
import { formatWhen } from './cue-check-records';
import { parseRoutines, type RoutineSummary } from './cue-check-routines';
import type { CueCheckCompose, CueCheckController, CueCheckState, TerminalExecutionContext } from './cue-check-state';
import { listProtocolExecutions, type ProtocolExecutionHistory } from './guidance/protocol-execution-api';
import { useCueCheckAnnouncements, useCueCheckController } from './useCueCheckController';
import { Button, styles } from './ui';

export interface CueCheckJourneyProps {
  readonly owner: string;
  readonly api?: CueCheckApi;
  /** Loads the owner's finished routines; defaults to the execution history. */
  readonly loadRoutines?: () => Promise<Pick<ProtocolExecutionHistory, 'items'>>;
  /** A routine the owner just chose to check in on, from the routine screen. */
  readonly intent?: TerminalExecutionContext | null;
  readonly onIntentHandled?: () => void;
  readonly now?: () => Date;
  readonly pageSize?: number;
}

const ROUTINES_FAILED = 'Your recent routines could not be loaded.';
const defaultLoadRoutines = () => listProtocolExecutions({ limit: 10, cursor: null });
const defaultNow = () => new Date();

function useRoutines(load: () => Promise<Pick<ProtocolExecutionHistory, 'items'>>) {
  const [loader] = useState(() => load);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'failed'; routines: readonly RoutineSummary[] }>({ status: 'loading', routines: [] });
  useEffect(() => {
    let live = true;
    loader().then(
      history => { if (live) setState({ status: 'ready', routines: parseRoutines(history) }); },
      () => { if (live) setState({ status: 'failed', routines: [] }); },
    );
    return () => { live = false; };
  }, [loader]);
  return state;
}

const SAVING_PHASES = new Set(['saving-new', 'saving-correction', 'voiding']);

function Composer({ state, controller, compose }: { state: CueCheckState; controller: CueCheckController; compose: CueCheckCompose }) {
  const saving = SAVING_PHASES.has(state.phase);
  // While a form is open every failure shows inside it, including a failed reload.
  const failure = state.failure;
  const selected = state.selected;
  if (compose.mode === 'void') {
    if (selected === null) return null;
    return <CueCheckVoidConfirmation
      timing={selected.timing}
      whenLabel={formatWhen(selected.observedAt)}
      reason={state.reason}
      saving={saving}
      failure={failure}
      reloadRequired={state.reloadRequired}
      onReload={() => void controller.reload()}
      onReason={controller.setReason}
      onConfirm={() => void controller.save()}
      onCancel={controller.cancel}
    />;
  }
  const timing: CueCheckTiming = compose.mode === 'new'
    ? (state.draft.timing === 'delayed' ? 'delayed' : 'immediate')
    : (selected?.timing ?? 'immediate');
  return <CueCheckForm
    mode={compose.mode === 'new' ? 'new' : 'correction'}
    timing={timing}
    draft={state.draft}
    original={compose.mode === 'correction' ? selected?.observation : undefined}
    reason={state.reason}
    saving={saving}
    failure={failure}
    reloadRequired={state.reloadRequired}
    onReload={() => void controller.reload()}
    onAnswer={(field: CueCheckObservationField, value) => controller.editDraft({ [field]: value })}
    onNotes={notes => controller.editDraft({ notes: notes === '' ? undefined : notes })}
    onReason={controller.setReason}
    onSave={() => void controller.save()}
    onCancel={controller.cancel}
  />;
}

function OwnerCueCheckJourney(props: CueCheckJourneyProps) {
  const { owner, api, intent = null, onIntentHandled, pageSize } = props;
  const now = props.now ?? defaultNow;
  const { controller, state } = useCueCheckController(owner, api, pageSize);
  useCueCheckAnnouncements(state);
  const routines = useRoutines(props.loadRoutines ?? defaultLoadRoutines);

  // Load on mount, and again whenever the view is back to "not loaded" with nothing
  // open, so a draft cancelled before the first load finished can never strand it.
  useEffect(() => {
    if (state.phase === 'idle' && state.compose === null) void controller.loadList();
  }, [controller, state.phase, state.compose]);

  const unhandledIntent = useRef<TerminalExecutionContext | null>(intent);
  useEffect(() => () => {
    // Leaving the view with an unhandled request clears it, so it cannot fire later.
    if (unhandledIntent.current !== null) onIntentHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routinesFailed = routines.status === 'failed';
  useEffect(() => {
    if (routinesFailed) AccessibilityInfo.announceForAccessibility(ROUTINES_FAILED);
  }, [routinesFailed]);

  const begin = (execution: TerminalExecutionContext, timing: CueCheckTiming) => {
    controller.startNew(execution);
    if (controller.getState().compose?.mode === 'new') {
      // One observed time per draft: set once here, never on a re-render.
      controller.editDraft({ timing, observedAt: now().toISOString() });
    }
  };

  const handledIntent = useRef<string | null>(null);
  useEffect(() => {
    if (intent === null || state.phase !== 'list-ready' || handledIntent.current === intent.executionId) return;
    handledIntent.current = intent.executionId;
    unhandledIntent.current = null;
    const options = entryOptions(intent, state.items);
    if (options.immediate?.kind === 'open') void controller.openDetail(options.immediate.recordId);
    else if (options.immediate !== null) begin(intent, 'immediate');
    onIntentHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, state.phase]);

  if (state.compose !== null) return <Composer state={state} controller={controller} compose={state.compose} />;

  if (state.phase === 'loading-detail') {
    return <Text accessibilityLiveRegion="polite" style={styles.body}>Loading this check-in…</Text>;
  }

  const selected = state.selected;
  if (state.phase === 'detail-ready' && selected !== null) {
    const later = selected.timing === 'immediate'
      && entryOptions({ executionId: selected.executionId, status: selected.executionStatus }, state.items).delayed?.kind === 'start';
    return <CueCheckDetail
      detail={selected}
      canAddLater={later}
      historyUnavailable={state.historyUnavailable}
      onReloadHistory={() => void controller.reloadHistory()}
      onCorrect={controller.startCorrection}
      onRemove={controller.startVoid}
      onBack={controller.closeDetail}
      onAddLater={() => begin({ executionId: selected.executionId, status: selected.executionStatus }, 'delayed')}
    />;
  }

  const loading = state.phase === 'loading-list' || state.phase === 'idle';
  return <View style={{ gap: 20 }}>
    <Text style={styles.subtitle}>Check-ins are private notes about how your hair felt after a routine. They are your own observations, not advice.</Text>
    {routinesFailed && <Text accessibilityRole="alert" style={styles.error}>{ROUTINES_FAILED}</Text>}
    {routines.status === 'ready' && <CueCheckRoutines routines={routines.routines} items={state.items} onStart={begin} onOpen={id => void controller.openDetail(id)} />}
    <Text accessibilityRole="header" style={styles.heading}>Your check-ins</Text>
    <CueCheckHistory
      items={state.items}
      status={loading ? 'loading' : state.phase === 'failed' ? 'failed' : 'ready'}
      hasMore={state.hasMore}
      loadingMore={state.activeRequest?.kind === 'page'}
      failure={state.failure}
      onOpen={id => void controller.openDetail(id)}
      onLoadMore={() => void controller.loadMore()}
      onRetry={() => void controller.retry()}
    />
    <CueCheckSummary items={state.items} hasMore={state.hasMore} />
    <Button title="Reload check-ins" secondary disabled={loading} onPress={() => void controller.loadList()} />
  </View>;
}

/**
 * The Journey "Check-ins" view. Keyed by owner so a different owner always
 * starts from a fresh, empty view. The view follows the controller's phase:
 * list, detail, form, or removal confirmation.
 */
export function CueCheckJourney(props: CueCheckJourneyProps) {
  return <OwnerCueCheckJourney key={props.owner} {...props} />;
}
