import { useEffect, useMemo, useRef, useState } from 'react';
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
  const heading = useRef<unknown>(null);
  const lastFailure = useRef<ProgrammeState['failure']>(null);
  const lastSavedRequest = useRef<number | null>(null);
  const lastLoadedPhase = useRef<ProgrammeState['phase'] | null>(null);
  useEffect(() => {
    const unsubscribe = controller.subscribe(next => setState(next));
    void controller.loadList();
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  useEffect(() => {
    if (state.failure !== null && state.failure !== lastFailure.current) {
      lastFailure.current = state.failure;
      AccessibilityInfo.announceForAccessibility(state.failure.message);
      return;
    }
    if (state.lastSaved !== null && state.lastSaved.requestId !== lastSavedRequest.current) {
      lastSavedRequest.current = state.lastSaved.requestId;
      AccessibilityInfo.announceForAccessibility('Programme saved');
      return;
    }
    if (state.phase !== lastLoadedPhase.current) {
      lastLoadedPhase.current = state.phase;
      if (state.phase === 'detail-ready' || state.phase === 'blocked-content') AccessibilityInfo.announceForAccessibility('Treatment programme loaded');
      else if (state.phase === 'list-ready') AccessibilityInfo.announceForAccessibility('Treatment programmes loaded');
    }
  }, [state.phase, state.lastSaved, state.failure]);
  useEffect(() => {
    if (state.lastSaved?.kind !== 'enrol' || state.selectedId === null) return;
    controller.closeDetail();
    void controller.loadList();
  }, [controller, state.lastSaved, state.selectedId]);
  useEffect(() => { if (state.phase === 'detail-ready' || state.phase === 'blocked-content' || state.phase === 'list-ready') focusOn(heading); }, [state.phase]);
  return <View style={{ gap: 12 }}>
    {(state.selectedId !== null || state.phase === 'loading-detail')
      ? <ProgrammeDetail detail={state.selected as never} blockedReason={state.blockedReason} saving={state.phase === 'saving'} failure={state.failure} controller={controller} headingRef={heading} onNavigate={onNavigate} />
      : <ProgrammeList state={state} controller={controller} offer={programmeOffer} headingRef={heading} />}
  </View>;
}
