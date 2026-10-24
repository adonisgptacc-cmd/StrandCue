import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { ProgrammeApi } from './programme-api.ts';
import { createProgrammeController, type ProgrammeOfferBinding, type ProgrammeState } from './programme-state.ts';
import { ProgrammeDetail } from './ProgrammeDetail.tsx';
import { ProgrammeList } from './ProgrammeList.tsx';
import { focusOn } from './focus.ts';

export function ProgrammeJourney({ owner, api, programmeOffer, now, onNavigate }: { readonly owner: string; readonly api: ProgrammeApi; readonly programmeOffer: ProgrammeOfferBinding | null; readonly now: () => Date; readonly onNavigate?: (destination: 'my_shelf' | 'journey_activities' | 'journey_routines') => void }) {
  const controller = useMemo(() => createProgrammeController({ ownerKey: owner, api, now, newOperationId: Crypto.randomUUID }), [owner, api, now]);
  const [state, setState] = useState<ProgrammeState>(() => controller.getState());
  // A new owner creates a new controller during render, before effects can
  // replace React state. Never paint or announce the previous owner's state in
  // that frame; use the new controller's empty owner-keyed state immediately.
  const visibleState = state.ownerKey === owner ? state : controller.getState();
  const heading = useRef<unknown>(null);
  const lastFailure = useRef<ProgrammeState['failure']>(null);
  const lastSavedRequest = useRef<number | null>(null);
  const lastLoadedPhase = useRef<ProgrammeState['phase'] | null>(null);
  useLayoutEffect(() => {
    lastFailure.current = null;
    lastSavedRequest.current = null;
    lastLoadedPhase.current = null;
  }, [controller]);
  useEffect(() => {
    const unsubscribe = controller.subscribe(next => setState(next));
    void controller.loadList();
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  useEffect(() => {
    if (visibleState.failure !== null && visibleState.failure !== lastFailure.current) {
      lastFailure.current = visibleState.failure;
      AccessibilityInfo.announceForAccessibility(visibleState.failure.message);
      return;
    }
    if (visibleState.lastSaved !== null && visibleState.lastSaved.requestId !== lastSavedRequest.current) {
      lastSavedRequest.current = visibleState.lastSaved.requestId;
      AccessibilityInfo.announceForAccessibility('Programme saved');
      return;
    }
    if (visibleState.phase !== lastLoadedPhase.current) {
      lastLoadedPhase.current = visibleState.phase;
      if (visibleState.phase === 'detail-ready' || visibleState.phase === 'blocked-content') AccessibilityInfo.announceForAccessibility('Treatment programme loaded');
      else if (visibleState.phase === 'list-ready') AccessibilityInfo.announceForAccessibility('Treatment programmes loaded');
    }
  }, [visibleState.phase, visibleState.lastSaved, visibleState.failure]);
  useEffect(() => {
    if (visibleState.lastSaved?.kind !== 'enrol' || visibleState.selectedId === null) return;
    controller.closeDetail();
    void controller.loadList();
  }, [controller, visibleState.lastSaved, visibleState.selectedId]);
  useEffect(() => { if (visibleState.phase === 'detail-ready' || visibleState.phase === 'blocked-content' || visibleState.phase === 'list-ready') focusOn(heading); }, [visibleState.phase]);
  return <View style={{ gap: 12 }}>
    {(visibleState.selectedId !== null || visibleState.phase === 'loading-detail')
      ? <ProgrammeDetail detail={visibleState.selected as never} blockedReason={visibleState.blockedReason} saving={visibleState.phase === 'saving'} failure={visibleState.failure} controller={controller} headingRef={heading} onNavigate={onNavigate} />
      : <ProgrammeList state={visibleState} controller={controller} offer={programmeOffer} headingRef={heading} />}
  </View>;
}
