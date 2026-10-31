import type { EngineInput, SnapshotFact } from '../../contracts.js';
import { addBlocker, defineStage } from '../stage-runner.js';
import type { PipelineState, ResolvedFact } from '../state.js';
import { EMPTY_PROVENANCE, ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION, compareStrings } from '../state.js';

/** Explicit unknown resolution: a fact counts as verified only while it is current. */
export const resolveFact = (fact: SnapshotFact, nowMs: number): ResolvedFact => {
  const make = (resolution: ResolvedFact['resolution']): ResolvedFact => ({ factId: fact.factId, resolution, fact });
  if (fact.status !== 'verified') return make(fact.status);
  if (fact.expiresAt !== undefined && Date.parse(fact.expiresAt) <= nowMs) return make('expired');
  if (fact.effectiveAt !== undefined && Date.parse(fact.effectiveAt) > nowMs) return make('unknown');
  if (fact.value === undefined) return make('unknown');
  return make('verified');
};

export const createPipelineState = (input: EngineInput): PipelineState => ({
  input,
  evaluatedAtMs: Date.parse(input.evaluatedAt),
  halted: false,
  trace: [],
  blockers: [],
  questions: [],
  noProtocol: [],
  facts: new Map(),
  treatment: { eventTypes: [] },
  candidates: new Map(),
  omissions: [],
  alternatives: [],
  heat: undefined,
  heatRelevant: false,
  heatSignals: [],
  ranking: [],
  requirements: [],
  waits: [],
  graph: undefined,
  steps: [],
});

const hasDuplicates = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

const revisionProblems = (input: EngineInput): readonly string[] => {
  const { snapshot } = input;
  const { revisions } = snapshot;
  const problems: string[] = [];
  if (snapshot.passport.revision > revisions.passport) problems.push('revision_inconsistent');
  if (snapshot.chemicalServiceHistory.some((entry) => entry.revision > revisions.chemicalServiceHistory)) problems.push('revision_inconsistent');
  if (snapshot.shelf.some((entry) => entry.revision > revisions.shelf)) problems.push('revision_inconsistent');
  if (snapshot.tools.some((entry) => entry.revision > revisions.tools)) problems.push('revision_inconsistent');
  if (snapshot.eventHistory.some((event) => event.revision > revisions.events)) problems.push('revision_inconsistent');
  return problems;
};

export const validateSnapshot = defineStage({
  stageId: 'validate_snapshot',
  intrinsic: true,
  before: (state) => {
    const { input, evaluatedAtMs } = state;
    const { snapshot, ruleset } = input;
    let next = state;
    const block = (reasonCode: string): void => {
      next = addBlocker(next, reasonCode, EMPTY_PROVENANCE);
    };

    if (ruleset.ref.evaluatorVersion !== ENGINE_EVALUATOR_VERSION || ruleset.ref.schemaVersion !== ENGINE_SCHEMA_VERSION) {
      block('ruleset_version_unsupported');
    }
    if (hasDuplicates([...snapshot.shelf, ...snapshot.tools, ...snapshot.chemicalServiceHistory].map((entry) => entry.entryId))
      || hasDuplicates(snapshot.eventHistory.map((event) => event.eventId))) {
      block('duplicate_identity');
    }
    if (revisionProblems(input).length > 0) block('revision_inconsistent');
    if (snapshot.factRegistry.some((fact) => Date.parse(fact.recordedAt) > evaluatedAtMs)) block('fact_recorded_in_future');
    if (snapshot.eventHistory.some((event) => Date.parse(event.happenedAt) > evaluatedAtMs)) block('future_event_recorded');

    const facts = new Map<string, ResolvedFact>();
    [...snapshot.factRegistry]
      .sort((left, right) => compareStrings(left.factId, right.factId))
      .forEach((fact) => facts.set(fact.factId, resolveFact(fact, evaluatedAtMs)));
    return { ...next, facts };
  },
});

export type { PipelineState };
