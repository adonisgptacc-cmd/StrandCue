import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import {
  CanonicalSnapshotSchema,
  CompiledRulesetSchema,
  EngineDecisionSchema,
} from '../../../packages/engine/src/index.js';

/**
 * The on-disk shape of one golden fixture.
 *
 * A fixture stores the compiled ruleset, the canonical input and the reviewed
 * expected decision. The expected decision is authored from the rule semantics
 * and is reviewed with any change to the rules, the schema or the evaluator.
 */
export const GoldenFixtureSchema = z.object({
  fixtureId: z.string().min(1),
  synthetic: z.literal(true),
  note: z.string().min(1),
  review: z.object({
    status: z.enum(['pending_independent_review', 'independently_reviewed']),
    expectedByRole: z.string().min(1),
    note: z.string().min(1),
  }).strict().readonly(),
  ruleset: CompiledRulesetSchema,
  input: z.object({
    evaluatedAt: z.string().datetime({ offset: true }),
    snapshot: CanonicalSnapshotSchema,
  }).strict().readonly(),
  expectedDecision: EngineDecisionSchema,
}).strict().readonly();

export type GoldenFixture = z.infer<typeof GoldenFixtureSchema>;

/** Loads every golden fixture, in a stable file-name order. */
export const loadGoldenFixtures = (): GoldenFixture[] => {
  const directory = new URL('./golden/', import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => GoldenFixtureSchema.parse(JSON.parse(readFileSync(new URL(name, directory), 'utf8'))));
};

/** Every identifier that appears in a fixture, so they can be checked for synthetic content. */
export const fixtureIdentifiers = (fixture: GoldenFixture): readonly string[] => {
  const identifiers: string[] = [
    fixture.ruleset.ref.rulesetId,
    fixture.input.snapshot.ownerScopeId,
    fixture.input.snapshot.passport.entryId,
  ];
  fixture.ruleset.capabilities.forEach((capability) => {
    identifiers.push(capability.capabilityId, capability.subjectId, capability.claimId);
    identifiers.push(...capability.evidenceIds);
  });
  fixture.ruleset.rules.forEach((rule) => {
    identifiers.push(rule.ruleId, ...rule.claimIds, ...rule.evidenceIds, ...rule.capabilityIds);
    if (rule.when.kind === 'fact_equals' || rule.when.kind === 'fact_in' || rule.when.kind === 'fact_exists') {
      identifiers.push(rule.when.factId);
    }
    rule.effects.forEach((effect) => {
      if (effect.kind === 'include_candidate' || effect.kind === 'exclude_candidate') identifiers.push(effect.candidateId);
      if (effect.kind === 'require_prerequisite') identifiers.push(effect.prerequisiteId);
      if (effect.kind === 'insert_wait') identifiers.push(effect.afterActionId);
    });
  });
  fixture.input.snapshot.factRegistry.forEach((fact) => {
    identifiers.push(fact.factId);
    if (fact.claimId !== undefined) identifiers.push(fact.claimId);
    identifiers.push(...fact.evidenceIds);
  });
  [...fixture.input.snapshot.shelf, ...fixture.input.snapshot.tools].forEach((entry) => identifiers.push(entry.entryId));
  fixture.input.snapshot.eventHistory.forEach((event) => identifiers.push(event.eventId, event.eventType));
  fixture.expectedDecision.steps.forEach((step) => identifiers.push(step.actionId, ...step.prerequisiteIds));
  fixture.expectedDecision.omissions.forEach((omission) => identifiers.push(omission.candidateId));
  fixture.expectedDecision.alternatives.forEach((alternative) => identifiers.push(alternative.alternativeId));
  fixture.expectedDecision.questions.forEach((question) => identifiers.push(...question.neededFactIds));
  return identifiers;
};
