import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Crypto from 'expo-crypto';

import * as realApi from './cue-check-api';
import type { CueCheckApi } from './cue-check-api';
import { announcementFor } from './cue-check-announce';
import {
  createCueCheckController,
  type CueCheckController,
  type CueCheckState,
} from './cue-check-state';

/** The production API: the five Cue Check RPC wrappers. */
export const defaultCueCheckApi: CueCheckApi = {
  recordCueCheck: realApi.recordCueCheck,
  correctCueCheck: realApi.correctCueCheck,
  voidCueCheck: realApi.voidCueCheck,
  listCueChecks: realApi.listCueChecks,
  getCueCheck: realApi.getCueCheck,
};

/**
 * Bind one owner's Cue Check controller to React. A different owner gets a
 * brand-new controller during the same render, so nothing of the previous
 * owner's lists, drafts or in-flight work can reach the new owner's screen.
 */
export function useCueCheckController(
  ownerKey: string,
  api: CueCheckApi = defaultCueCheckApi,
  pageSize?: number,
): { readonly controller: CueCheckController; readonly state: CueCheckState } {
  const controller = useMemo(
    () => createCueCheckController({ ownerKey, api, newOperationId: () => Crypto.randomUUID(), pageSize }),
    [ownerKey, api, pageSize],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { controller, state };
}

/** Speak each outcome once: saving started, saved, removed, more loaded. */
export function useCueCheckAnnouncements(state: CueCheckState): void {
  const previous = useRef(state);
  useEffect(() => {
    const spoken = announcementFor(previous.current, state);
    previous.current = state;
    if (spoken !== null) AccessibilityInfo.announceForAccessibility(spoken);
  }, [state]);
}
