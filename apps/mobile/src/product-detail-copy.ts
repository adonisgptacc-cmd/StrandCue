import {
  evidenceClassLabel,
  type DetailDirections,
  type DetailClaim,
  type DetailEvidence,
  type DetailOwnerFacts,
  type ProductDetail,
} from '../../../packages/domain/src/index';
import {
  availabilityLabel,
  categoryLabel,
  openedOnLabel,
  openedOnWords,
  quantityBandLabel,
  repurchaseIntentLabel,
} from './shelf-history';

/** Said wherever the catalogue entry holds no answer: never a guess, never blank. */
const notInCatalogue = 'Not recorded in the catalogue';
/** Said wherever the owner gave no answer. */
const notProvided = 'Not provided by you';
/** Said for a field a published, reviewed record leaves out. */
const notStated = 'Not stated in the reviewed directions';

type Identity = ProductDetail['identity'];
type Lifecycle = ProductDetail['lifecycle'];

/** The exact version, field by field. A fact the catalogue does not hold says so. */
export function identityLines(identity: Identity): string[] {
  return [
    `Brand: ${identity.brand}`,
    `Product: ${identity.productName}`,
    `Variant: ${identity.variant ?? notInCatalogue}`,
    `Category: ${categoryLabel(identity.category)}`,
    `Market: ${identity.market === 'ZA' ? 'South Africa' : notInCatalogue}`,
    `Barcode: ${identity.barcode ?? notInCatalogue}`,
    // A pack size is never a catalogue field, so it is always unknown here.
    'Size: Not recorded in the catalogue for this version',
    `Reference code (last 8 characters): ${identity.versionId.slice(-8)}`,
  ];
}

/** The version's state. A successor is a pointer only: it never replaces this version. */
export function lifecycleLines(lifecycle: Lifecycle): string[] {
  if (lifecycle.state === 'active') return ['Version status: current catalogue version.'];
  const status = 'Version status: retired version. This is a historical version, not the current formulation.';
  const { successor } = lifecycle;
  switch (successor.state) {
    case 'none': return [status, 'No newer version is recorded.'];
    case 'not_published': return [status, 'A newer version is recorded, but the link has not been published, so it is not shown.'];
    case 'under_review': return [status, 'A newer version is recorded, and the link is under review, so it is not shown yet.'];
    case 'published': {
      const { brand, productName, variant } = successor.version;
      return [status, `A reviewed newer version is listed: ${brand}: ${productName}${variant ? ` (${variant})` : ''}. Your product stays linked to this version.`];
    }
  }
}

export type DetailSection = 'directions' | 'claims' | 'ingredients' | 'formulationReference';
export type UnpublishedState = 'not_published' | 'under_review' | 'withdrawn';

const notices: Record<DetailSection, Record<UnpublishedState, string>> = {
  directions: {
    not_published: 'No published directions are available for this exact version.',
    under_review: 'Directions for this version are under review and are not shown yet.',
    withdrawn: 'Directions were published and later withdrawn. They are not shown.',
  },
  claims: {
    not_published: 'No reviewed claims are published for this exact version.',
    under_review: 'Claims for this version are under review and are not shown yet.',
    withdrawn: 'Claims were published and later withdrawn. They are not shown.',
  },
  ingredients: {
    not_published: 'Ingredients are not published for this exact version.',
    under_review: 'Ingredients for this version are under review and are not shown yet.',
    withdrawn: 'Ingredients were published and later withdrawn. They are not shown.',
  },
  formulationReference: {
    not_published: 'No formula reference is published for this version.',
    under_review: 'The formula reference is under review and is not shown yet.',
    withdrawn: 'The formula reference was published and later withdrawn. It is not shown.',
  },
};

/** Each reason a section is empty has its own sentence: one generic "unknown" would hide the cause. */
export function sectionNotice(section: DetailSection, state: UnpublishedState): string {
  return notices[section][state];
}

/** A calendar day in words, so a screen reader does not read digits. */
function dayWords(day: string): string {
  return openedOnWords({ precision: 'day', value: day });
}

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

const rinseWording = { 'rinse-out': 'Rinse-out', 'leave-in': 'Leave-in' } as const;
const frequencyUnits = { day: 'day', week: 'week', month: 'month', wash: 'wash', use: 'use' } as const;

function frequencyWording(frequency: NonNullable<DetailDirections['frequency']>): string {
  const unit = frequencyUnits[frequency.unit];
  if (frequency.count === 1) return `once a ${unit}`;
  return `${frequency.count} times a ${unit}`;
}

/**
 * Published reviewed directions. A field the record leaves out says so; an empty
 * list is a recorded "none", which is a different answer.
 */
export function directionLines(directions: DetailDirections): string[] {
  const list = (values: string[] | null, label: string, empty: string): string => {
    if (values === null) return `${label}: ${notStated}`;
    return `${label}: ${values.length === 0 ? empty : values.join('; ')}`;
  };
  return [
    `Where it fits: ${directions.routinePlacement ?? notStated}`,
    `Directions: ${directions.instructions ?? notStated}`,
    `Application order: ${directions.applicationOrder === null ? notStated : `step ${directions.applicationOrder}`}`,
    `Rinse-out or leave-in: ${directions.rinseMode === null ? notStated : rinseWording[directions.rinseMode]}`,
    `Wait time: ${directions.waitMinutes === null ? notStated : plural(directions.waitMinutes, 'minute')}`,
    `How often: ${directions.frequency === null ? notStated : frequencyWording(directions.frequency)}`,
    `Needs activation: ${directions.activation ?? notStated}`,
    list(directions.requiredTools, 'Tools needed', 'None listed in the reviewed directions'),
    list(directions.requiredConditions, 'Conditions needed', 'None listed in the reviewed directions'),
    list(directions.incompatibilities, 'Do not combine with', 'None listed in the reviewed directions'),
    `Limits: ${directions.limitations ?? notStated}`,
  ];
}

/** One source, in words. The kind of source leads, so marketing is never read as independent proof. */
export function evidenceLines(evidence: DetailEvidence): string[] {
  const lines = [
    `Kind of source: ${evidenceClassLabel(evidence.sourceType)}`,
    `Source: ${evidence.title}`,
    `Published by: ${evidence.publisher}`,
    `First seen ${dayWords(evidence.firstSeen)}; last checked ${dayWords(evidence.lastChecked)}`,
    `Applies to: ${evidence.applicability}`,
    `Limits: ${evidence.limitations}`,
  ];
  if (evidence.excerpt !== null) lines.push(`Excerpt: ${evidence.excerpt}`);
  return lines;
}

export function sourceLinkLabel(evidence: Pick<DetailEvidence, 'title' | 'publisher'>): string {
  return `Open source: ${evidence.title}, published by ${evidence.publisher}`;
}

export function archivedLinkLabel(evidence: Pick<DetailEvidence, 'title' | 'publisher'>): string {
  return `Open archived copy: ${evidence.title}, published by ${evidence.publisher}`;
}

const TITLE_LIMIT = 60;

/**
 * What a claim is called on screen and to a screen reader: its own statement, shortened, never an
 * internal key. A claim with no statement is named by its place in the list.
 */
export function claimTitle(claim: Pick<DetailClaim, 'statement'>, position: number): string {
  if (claim.statement === null) return `Claim ${position}`;
  return claim.statement.length <= TITLE_LIMIT ? claim.statement : `${claim.statement.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
}

/** The kinds of source behind a claim, said before it is opened, so a marketing-only claim is never a bare statement. */
export function claimSourceSummary(claim: Pick<DetailClaim, 'evidence'>): string {
  if (claim.evidence.length === 0) return 'No published source is available for this claim.';
  const kinds = [...new Set(claim.evidence.map(evidence => evidenceClassLabel(evidence.sourceType)))];
  return `Source kinds: ${kinds.join('; ')}`;
}

/** The owner's own record, kept apart from the catalogue. What they did not give says so. */
export function ownerLines(owner: DetailOwnerFacts): string[] {
  const answer = (value: string | null): string => (value === null || value.trim() === '' ? notProvided : value);
  const identity = [owner.manualBrand, owner.manualName, owner.manualCategory === null ? null : categoryLabel(owner.manualCategory)]
    .filter((part): part is string => part !== null && part.trim() !== '');
  const opened = openedOnLabel(owner.openedOn);
  return [
    `Status: ${availabilityLabel(owner.availability)}`,
    // The request itself proves the entry is linked to this version, so there is no "not linked" wording here.
    owner.matched && owner.matchConfirmed
      ? 'Linked to this catalogue version by you, after you confirmed it.'
      : 'Linked to this catalogue version, but the link was not confirmed.',
    `You recorded: ${identity.length === 0 ? notProvided : identity.join(', ')}`,
    `Size you recorded: ${answer(owner.manualSize)}`,
    `Variant you recorded: ${answer(owner.manualVariant)}`,
    `Opened: ${opened ?? notProvided}`,
    `Expiry date: ${answer(owner.expiryOn)}`,
    `Period after opening: ${answer(owner.pao)}`,
    `How much is left: ${owner.quantityBand === null ? notProvided : quantityBandLabel(owner.quantityBand)}`,
    `Buying again: ${owner.repurchaseIntent === null ? notProvided : repurchaseIntentLabel(owner.repurchaseIntent)}`,
    `Your notes: ${answer(owner.notes)}`,
  ];
}

const historyKinds: Record<DetailOwnerFacts['revisions'][number]['kind'], string> = {
  baseline: 'Original entry', change: 'Change', correction: 'Correction', match: 'Catalogue match', archive: 'Archive',
};

/** The owner's own history, oldest first, one line each. */
export function historyLines(revisions: DetailOwnerFacts['revisions']): string[] {
  return revisions.map((revision, index) => `Entry ${index + 1}: ${historyKinds[revision.kind]}`);
}

export type DetailFailure = { kind: 'not_found' | 'auth' | 'retry'; message: string };

/** A failed read, in plain words. Server and network text is never repeated. */
export function detailFailure(error: unknown): DetailFailure {
  const text = String((error as { message?: unknown } | null)?.message ?? '');
  if (text.includes('not-found')) {
    return { kind: 'not_found', message: 'These product details are no longer available. Go back and choose again.' };
  }
  if (text.includes('authentication-required')) {
    return { kind: 'auth', message: 'Sign in again to see product details. Nothing was changed.' };
  }
  return { kind: 'retry', message: 'The product details could not be loaded. Nothing was changed. Try again.' };
}
