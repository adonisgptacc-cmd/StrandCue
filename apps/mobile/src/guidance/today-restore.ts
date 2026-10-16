import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProtocolDecision } from '../../../../packages/domain/src/index.ts';
import { getActiveExecutionWithDecision } from './protocol-execution-api.ts';
import {
  EXECUTION_RESUME_UNVERIFIED,
} from './guidance-copy.ts';
import {
  resumeErrorCopy,
  validateRestoredBundle,
  type RestoredRunIdentifiers,
} from './protocol-execution-resume.ts';

export type TodayRestorePhase = 'restoring' | 'absent' | 'restored' | 'failed';

export interface TodayRestoreState {
  readonly phase: TodayRestorePhase;
  /** The exact stored trusted decision, painted only after validation. */
  readonly decision: ProtocolDecision | null;
  readonly run: RestoredRunIdentifiers | null;
  readonly error: string | null;
  readonly offline: boolean;
}

const IDLE_ABSENT: TodayRestoreState = {
  phase: 'absent',
  decision: null,
  run: null,
  error: null,
  offline: false,
};

export interface TodayRestoreController extends TodayRestoreState {
  readonly retry: () => void;
  /** Leave the restored plan and return to the normal idle journey. */
  readonly dismiss: () => void;
}

/**
 * Fix E: process-death recovery for the Today journey.
 *
 * On mount and on every owner change — independently of generating new
 * guidance — this hook reads the single owner-scoped aggregate
 * (`getActiveExecutionWithDecision`, owner derived server-side from
 * `auth.uid()`) and validates the bundle before anything paints. While
 * restoring the caller renders neutral loading only; a failed restore is an
 * explicit error with an idempotent retry, never a fall back to idle; a
 * validated restore exposes the STORED decision as context (no new check-in,
 * no new run, no auto-generation — generation still requires explicit user
 * action through the existing machine).
 *
 * Owner and lateness guards mirror the Today preflight: a response applies
 * only while mounted and current for this owner, so a late bundle can never
 * paint a previous owner's execution or decision.
 */
export function useTodayRestore(ownerId: string): TodayRestoreController {
  const [state, setState] = useState<TodayRestoreState>({ ...IDLE_ABSENT, phase: 'restoring' });
  const [retryNonce, setRetryNonce] = useState(0);
  const mounted = useRef(true);
  const ownerToken = useRef(0);
  // Render-time adjustment (never in an effect): a new owner discards the
  // previous owner's restore outcome alongside the reload below, so the old
  // decision can never paint under the new owner's session.
  const [seenOwner, setSeenOwner] = useState(ownerId);
  if (seenOwner !== ownerId) {
    setSeenOwner(ownerId);
    setState({ ...IDLE_ABSENT, phase: 'restoring' });
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownerToken.current += 1;
    };
  }, []);

  useEffect(() => {
    ownerToken.current += 1;
    const token = ownerToken.current;
    const live = () => mounted.current && token === ownerToken.current;
    void (async () => {
      let bundle: unknown;
      try {
        bundle = await getActiveExecutionWithDecision();
      } catch (error) {
        if (!live()) return;
        const mapping = resumeErrorCopy(error);
        setState({
          ...IDLE_ABSENT,
          phase: 'failed',
          error: mapping.copy,
          offline: mapping.offline,
        });
        return;
      }
      if (!live()) return;
      const validated = validateRestoredBundle(bundle);
      if (!live()) return;
      if (validated.status === 'resumable') {
        setState({
          phase: 'restored',
          decision: validated.decision,
          run: validated.run,
          error: null,
          offline: false,
        });
      } else if (validated.status === 'absent') {
        setState({ ...IDLE_ABSENT });
      } else {
        setState({
          ...IDLE_ABSENT,
          phase: 'failed',
          error: EXECUTION_RESUME_UNVERIFIED,
          offline: false,
        });
      }
    })();
  }, [ownerId, retryNonce]);

  const retry = useCallback(() => {
    // Event-handler state (never in an effect): the failed card swaps back
    // to neutral loading for the attempt. The effect below reloads through
    // the same token-guarded read, so the retry can never duplicate history.
    setState({ ...IDLE_ABSENT, phase: 'restoring' });
    setRetryNonce(nonce => nonce + 1);
  }, []);

  const dismiss = useCallback(() => {
    setState({ ...IDLE_ABSENT });
    ownerToken.current += 1;
  }, []);

  return { ...state, retry, dismiss };
}
