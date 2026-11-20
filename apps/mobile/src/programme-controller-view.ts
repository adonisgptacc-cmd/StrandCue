import { useSyncExternalStore } from 'react';
import type { ProgrammeController, ProgrammeState } from './programme-state.ts';

/** Subscribe a directly mounted view to the controller's immutable snapshots. */
export function useProgrammeController(controller: ProgrammeController): ProgrammeState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
