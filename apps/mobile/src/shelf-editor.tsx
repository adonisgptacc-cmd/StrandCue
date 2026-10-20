import { useEffect, useRef, useState } from 'react';
import { Text, View, type AccessibilityState } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CorrectUserProductCommandSchema,
  CORRECTION_IDENTITY_CHANGE_RULE,
  CORRECTION_IDENTITY_RULE,
  correctionChangesIdentity,
  CreateUserProductCommandSchema,
  currentDateOnly,
  DateOnlySchema,
  MatchUserProductCommandSchema,
  shelfIdentity,
  type ShelfIdentity,
} from '../../../packages/domain/src/index';
import { secureStorage } from './client';
import {
  archiveUserProduct,
  changeUserProduct,
  correctUserProduct,
  correctionIdentity,
  correctionTarget,
  getUserProduct,
  matchUserProduct,
  recordUserProduct,
  todayEffectiveDate,
  type ShelfDetail,
} from './shelf-api';
import {
  removeShelfDraft,
  submitShelfDraft,
  type ShelfDraft,
} from './shelf-drafts';
import {
  availabilityLabel,
  categoryLabel,
  clearedLabel,
  notAnsweredLabel,
  quantityBandLabel,
  recordedIdentityWording,
  repurchaseIntentLabel,
  shelfCategories,
  shelfEditorCopy,
  type ShelfEditorMode,
} from './shelf-history';
import { Button, Choice, Field, styles } from './ui';

const categories = shelfCategories;
const availabilities = ['available', 'low', 'empty', 'archived'] as const;
/**
 * The state older rows still carry. It stays readable - the shelf has always
 * called it "Not currently available" - but the owner cannot newly record
 * it, so the editor only offers it while the saved entry already holds it.
 */
const legacyAvailability = 'out_of_stock';
/** One vocabulary for the state, wherever it is shown. */
const availabilityLabels: Record<string, string> = {
  available: availabilityLabel('available'),
  low: availabilityLabel('low'),
  empty: availabilityLabel('empty'),
  archived: availabilityLabel('archived'),
  [legacyAvailability]: availabilityLabel(legacyAvailability),
};
const quantityBands = ['full', 'about-three-quarters', 'about-half', 'about-quarter', 'nearly-empty', 'unknown'] as const;
const repurchaseIntents = ['would-rebuy', 'would-not-rebuy', 'unsure', 'unknown'] as const;
const openedPrecisions = ['day', 'month', 'year', 'unknown'] as const;

/**
 * The answer that means "the owner cleared this".
 *
 * It is a value of its own, so the three states stay apart on the wire: a
 * group the owner never answered is absent, a group the owner cleared is an
 * explicit null, and a group the owner answered carries the value. Without
 * it an owner who picked the wrong answer could never take it back.
 *
 * The value says what the owner did, so it agrees with the label it is read
 * with: it is the clearing answer, never the "never answered" one.
 */
const clearedSentinel = 'cleared';

const quantityBandChoices = [clearedSentinel, ...quantityBands];
const repurchaseIntentChoices = [clearedSentinel, ...repurchaseIntents];
const openedPrecisionChoices = [clearedSentinel, ...openedPrecisions];

const quantityBandOptions: Record<string, string> = {
  [clearedSentinel]: clearedLabel,
  ...Object.fromEntries(quantityBands.map(band => [band, quantityBandLabel(band)])),
};
const repurchaseIntentOptions: Record<string, string> = {
  [clearedSentinel]: clearedLabel,
  ...Object.fromEntries(repurchaseIntents.map(intent => [intent, repurchaseIntentLabel(intent)])),
};
const openedPrecisionOptions: Record<string, string> = {
  [clearedSentinel]: clearedLabel,
  day: 'A day',
  month: 'A month',
  year: 'A year',
  unknown: 'Not sure',
};
const categoryOptions: Record<string, string> = Object.fromEntries(categories.map(category => [category, categoryLabel(category)]));
/**
 * The category group of a correction offers the way back, like every other
 * group that takes an answer: a category the owner recorded can be taken
 * back, and the same word says so.
 */
const correctionCategoryChoices = [clearedSentinel, ...categories];
const correctionCategoryOptions: Record<string, string> = { [clearedSentinel]: clearedLabel, ...categoryOptions };
/** A bare "no" and "yes" say nothing on their own: the answer reads itself. */
const archiveConfirmationLabels: Record<string, string> = { no: 'No, keep it on my shelf', yes: 'Yes, archive this product' };
const matchConfirmationLabels: Record<string, string> = { no: 'No, they are different products', yes: 'Yes, they are the same product' };
/** Announced when the archive confirmation appears, so it is never silent. */
const archiveConfirmationNotice = 'Archiving this product needs a confirmation now. Choose "Yes, archive this product" to go ahead, or "No, keep it on my shelf" to keep it.';

/**
 * The accessibility state of an input.
 *
 * React Native's own state has no "invalid" member, but the state the web
 * accessibility API defines does, and a screen reader reads it: the field
 * itself says that its answer was refused, not only the message under it.
 */
const inputState = (disabled: boolean, invalid = false): AccessibilityState =>
  ({ disabled, invalid } as unknown as AccessibilityState);

type FactsDraft = {
  manualVariant: string;
  manualSize: string;
  manualBarcode: string;
  openedPrecision: '' | typeof openedPrecisions[number] | typeof clearedSentinel;
  openedValue: string;
  expiryOn: string;
  pao: string;
  quantityBand: '' | typeof quantityBands[number] | typeof clearedSentinel;
  repurchaseIntent: '' | typeof repurchaseIntents[number] | typeof clearedSentinel;
  notes: string;
};

const emptyFacts: FactsDraft = {
  manualVariant: '', manualSize: '', manualBarcode: '',
  openedPrecision: '', openedValue: '', expiryOn: '',
  pao: '', quantityBand: '', repurchaseIntent: '', notes: '',
};

function factsFrom(detail: ShelfDetail | null | undefined): FactsDraft {
  if (!detail) return emptyFacts;
  const opened = detail.openedOn;
  return {
    manualVariant: detail.manualVariant ?? '',
    manualSize: detail.manualSize ?? '',
    manualBarcode: detail.manualBarcode ?? '',
    openedPrecision: opened ? (opened.precision as FactsDraft['openedPrecision']) : '',
    openedValue: opened && opened.value !== null ? opened.value : '',
    expiryOn: detail.expiryOn ?? '',
    pao: detail.pao ?? '',
    quantityBand: (detail.quantityBand as FactsDraft['quantityBand']) ?? '',
    repurchaseIntent: (detail.repurchaseIntent as FactsDraft['repurchaseIntent']) ?? '',
    notes: detail.notes ?? '',
  };
}

/** The facts a retained draft already holds, so a review shows what was sent. */
function factsFromCommand(command: Record<string, unknown>): FactsDraft {
  const opened = command.openedOn as { precision: string; value: string | null } | null | undefined;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    manualVariant: text(command.manualVariant),
    manualSize: text(command.manualSize),
    manualBarcode: text(command.manualBarcode),
    openedPrecision: opened ? (opened.precision as FactsDraft['openedPrecision']) : '',
    openedValue: opened && opened.value !== null ? opened.value : '',
    expiryOn: text(command.expiryOn),
    pao: text(command.pao),
    quantityBand: (typeof command.quantityBand === 'string' ? command.quantityBand : '') as FactsDraft['quantityBand'],
    repurchaseIntent: (typeof command.repurchaseIntent === 'string' ? command.repurchaseIntent : '') as FactsDraft['repurchaseIntent'],
    notes: text(command.notes),
  };
}

/**
 * Three states stay distinct on the way to the server: an untouched field
 * the owner never answered is absent, a field the owner emptied is an
 * explicit null (cleared), and a field the owner filled carries the value.
 */
function recordedValue(draft: string, current: string | null | undefined): string | null | undefined {
  const trimmed = draft.trim();
  if (trimmed !== '') return trimmed;
  if (current === null || current === undefined) return undefined;
  return null;
}

/**
 * The answer of a choice group on the way to the server. A group the owner
 * never answered stays absent, a group the owner cleared is an explicit
 * null, and a group the owner answered carries the value.
 */
function answerValue(draft: string): string | null | undefined {
  if (draft === clearedSentinel) return null;
  return draft === '' ? undefined : draft;
}

/**
 * The opening date, in the precision the owner knows. "Not answered" clears
 * a date that was recorded; a date the owner never gave stays absent, so
 * the three states stay apart on the wire.
 */
function openedOnValue(draft: FactsDraft): { precision: string; value: string | null } | null | undefined {
  if (draft.openedPrecision === clearedSentinel) return null;
  if (draft.openedPrecision === '') return undefined;
  if (draft.openedPrecision === 'unknown') return { precision: 'unknown', value: null };
  return { precision: draft.openedPrecision, value: draft.openedValue.trim() };
}

// --- What a correction carries ---------------------------------------------

/**
 * The text a correction sends for one fact.
 *
 * Nothing at all when the owner did not change it, so the answer is
 * preserved; an explicit null when the owner emptied it, so the answer is
 * cleared; and the recorded value when the owner wrote one.
 */
export function correctedText(start: string, current: string): string | null | undefined {
  const before = start.trim();
  const after = current.trim();
  if (before === after) return undefined;
  return after === '' ? null : after;
}

/**
 * The answer a correction sends for one choice group: nothing when the
 * owner left the answer as it was, an explicit null when the owner took it
 * back, and the answer when the owner chose another one.
 */
export function correctedAnswer(start: string, current: string): string | null | undefined {
  if (current === clearedSentinel) return null;
  if (current === '') return undefined;
  if (current === start) return undefined;
  return current;
}

/**
 * The category a correction sends.
 *
 * The category group offers the way back, so a cleared category is an
 * answer of its own: an explicit null takes the category back, a value
 * replaces it, and nothing at all leaves it as it was.
 */
function correctedCategory(start: string, current: string): string | null | undefined {
  const before = start === clearedSentinel ? null : (start.trim() === '' ? undefined : start);
  const after = current === clearedSentinel ? null : (current.trim() === '' ? undefined : current);
  if (after === undefined) return undefined;
  if (after === before) return undefined;
  return after;
}

/**
 * The opening date a correction sends, in the precision the owner knows.
 */
export function correctedOpened(
  start: FactsDraft,
  current: FactsDraft,
): { precision: string; value: string | null } | null | undefined {
  if (current.openedPrecision === clearedSentinel) return null;
  if (current.openedPrecision === '') return undefined;
  const unchanged = current.openedPrecision === start.openedPrecision
    && current.openedValue.trim() === start.openedValue.trim();
  if (unchanged) return undefined;
  if (current.openedPrecision === 'unknown') return { precision: 'unknown', value: null };
  return { precision: current.openedPrecision, value: current.openedValue.trim() };
}

/**
 * The identity a correction carries: only the parts the owner answered.
 *
 * A key that is absent preserves the answer the entry holds, an explicit
 * null clears it and a value replaces it. A field the owner edited is part
 * of the correction even when the answer is the one the record already
 * holds: the correction carries the identity, so the record it replaces
 * keeps an identity to correct. The editor keeps a name on the product, so
 * the name is only ever replaced here.
 */
export function correctedIdentity(
  start: { brand: string; name: string; category: string },
  current: { brand: string; name: string; category: string },
  touched: { brand: boolean; name: boolean; category: boolean } = { brand: false, name: false, category: false },
): { manualBrand?: string | null; manualName?: string | null; manualCategory?: string | null } {
  const changes: { manualBrand?: string | null; manualName?: string | null; manualCategory?: string | null } = {};
  const brand = correctedText(start.brand, current.brand);
  if (brand !== undefined) changes.manualBrand = brand;
  else if (touched.brand) changes.manualBrand = current.brand.trim() === '' ? null : current.brand.trim();
  const name = correctedText(start.name, current.name);
  if (name !== undefined) changes.manualName = name;
  else if (touched.name) changes.manualName = current.name.trim() === '' ? null : current.name.trim();
  const category = correctedCategory(start.category, current.category);
  if (category !== undefined) changes.manualCategory = category;
  else if (touched.category) changes.manualCategory = current.category === clearedSentinel ? null : (current.category.trim() === '' ? null : current.category.trim());
  return changes;
}

/**
 * The facts a correction carries: only the ones the owner changed.
 */
export function correctedFacts(start: FactsDraft, current: FactsDraft): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const record = (key: string, value: unknown): void => {
    if (value === undefined) return;
    facts[key] = value;
  };
  record('manualVariant', correctedText(start.manualVariant, current.manualVariant));
  record('manualSize', correctedText(start.manualSize, current.manualSize));
  record('manualBarcode', correctedText(start.manualBarcode, current.manualBarcode));
  record('openedOn', correctedOpened(start, current));
  record('expiryOn', correctedText(start.expiryOn, current.expiryOn));
  record('pao', correctedText(start.pao, current.pao));
  record('quantityBand', correctedAnswer(start.quantityBand, current.quantityBand));
  record('repurchaseIntent', correctedAnswer(start.repurchaseIntent, current.repurchaseIntent));
  record('notes', correctedText(start.notes, current.notes));
  return facts;
}

// --- The problems the owner can act on -----------------------------------

/** Every field the editor can hold a problem for. */
type EditorField =
  | 'manualBrand' | 'manualName' | 'identity' | 'reason'
  | 'manualVariant' | 'manualSize' | 'manualBarcode' | 'openedOn' | 'expiryOn' | 'pao' | 'notes';

/** One problem, tied to the field it belongs to. */
type EditorProblem = { field: EditorField; label: string; rule: string };

/** The name the owner knows the field by. */
const fieldLabels: Record<EditorField, string> = {
  manualBrand: 'Brand',
  manualName: 'Product name',
  identity: 'Brand, product name and category',
  reason: 'Reason for this correction',
  manualVariant: 'Variant',
  manualSize: 'Size',
  manualBarcode: 'Barcode',
  openedOn: 'Opening date',
  expiryOn: 'Expiry date',
  pao: 'Period after opening',
  notes: 'Notes',
};

/** The length the domain holds each owner-entered text to. */
const textBounds: Partial<Record<EditorField, number>> = {
  manualBrand: 200, manualName: 200, manualVariant: 200, manualSize: 200,
  manualBarcode: 100, pao: 200, notes: 2000, reason: 500,
};

const dayShape = /^\d{4}-\d{2}-\d{2}$/;
const monthShape = /^\d{4}-\d{2}$/;
const yearShape = /^\d{4}$/;

/** Whether the typed value has the shape the chosen precision needs. */
function openedValueComplete(precision: string, value: string): boolean {
  if (precision === 'day') return dayShape.test(value);
  if (precision === 'month') return monthShape.test(value);
  if (precision === 'year') return yearShape.test(value);
  return false;
}

/** Whether a complete value is a real date in that precision. */
function openedValueReal(precision: string, value: string): boolean {
  if (precision === 'day') return DateOnlySchema.safeParse(value).success;
  if (precision === 'month') return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
  if (precision === 'year') return /^[1-9]\d{3}$/.test(value);
  return false;
}

/** The first day the recorded date covers, the way the domain reads it. */
function openedIntervalStart(precision: string, value: string): string {
  if (precision === 'day') return value;
  if (precision === 'month') return `${value}-01`;
  return `${value}-01-01`;
}

/** Whether the owner gave an opening date of a real precision. */
function openedPrecisionAnswered(draft: FactsDraft): boolean {
  return draft.openedPrecision !== '' && draft.openedPrecision !== 'unknown' && draft.openedPrecision !== clearedSentinel;
}

/**
 * The problems in the facts, one per field.
 *
 * `live` is the check that runs while the owner types. It only judges a
 * value that is complete enough to judge - a date that has the shape of the
 * precision the owner chose, a text longer than the domain holds - so a
 * half-typed date is never scolded and a missing answer is only mentioned
 * once the owner asks to save.
 */
function factsProblems(draft: FactsDraft, scope: 'live' | 'submit'): EditorProblem[] {
  const problems: EditorProblem[] = [];
  const texts: [EditorField, string][] = [
    ['manualVariant', draft.manualVariant],
    ['manualSize', draft.manualSize],
    ['manualBarcode', draft.manualBarcode],
    ['pao', draft.pao],
    ['notes', draft.notes],
  ];
  for (const [field, value] of texts) {
    const bound = textBounds[field] ?? 0;
    if (value.trim().length > bound) {
      problems.push({ field, label: fieldLabels[field], rule: `Use at most ${bound} characters.` });
    } else if (scope === 'submit' && value !== '' && value.trim() === '') {
      problems.push({ field, label: fieldLabels[field], rule: 'This cannot be blank. Clear the field instead if you do not want to record it.' });
    }
  }
  if (openedPrecisionAnswered(draft)) {
    const value = draft.openedValue.trim();
    if (value === '') {
      if (scope === 'submit') {
        problems.push({ field: 'openedOn', label: fieldLabels.openedOn, rule: 'Enter the date you opened this product, or choose "not sure".' });
      }
    } else if (!openedValueComplete(draft.openedPrecision, value)) {
      if (scope === 'submit') {
        problems.push({ field: 'openedOn', label: fieldLabels.openedOn, rule: 'That is not a complete date. Use a day (2026-03-01), a month (2026-03) or a year (2026), or choose "not sure".' });
      }
    } else if (!openedValueReal(draft.openedPrecision, value)) {
      problems.push({ field: 'openedOn', label: fieldLabels.openedOn, rule: 'That is not a real date. Use a day (2026-03-01), a month (2026-03) or a year (2026), or choose "not sure".' });
    } else if (openedIntervalStart(draft.openedPrecision, value) > currentDateOnly()) {
      problems.push({ field: 'openedOn', label: fieldLabels.openedOn, rule: 'That is in the future. A product cannot be opened after today.' });
    }
  }
  const expiry = draft.expiryOn.trim();
  if (expiry !== '') {
    if (!dayShape.test(expiry)) {
      if (scope === 'submit') {
        problems.push({ field: 'expiryOn', label: fieldLabels.expiryOn, rule: 'That is not a complete date. Enter a calendar day in YYYY-MM-DD form, or leave it empty.' });
      }
    } else if (!DateOnlySchema.safeParse(expiry).success) {
      problems.push({ field: 'expiryOn', label: fieldLabels.expiryOn, rule: 'Enter a real calendar day in YYYY-MM-DD form, or leave it empty.' });
    }
  }
  return problems;
}

/**
 * The problems in the identity the owner types. The brand and the name are
 * only sent when a product is added or corrected, so an ordinary edit never
 * asks about them.
 *
 * A name can be cleared in a correction when something else identifies the
 * product: a catalogue link is such an identity, and the server takes a
 * correction that clears the name of a linked product. A manual product
 * whose name is cleared identifies nothing, so its name stays until it is
 * recorded again.
 */
function identityProblems(
  brand: string,
  name: string,
  scope: 'live' | 'submit',
  correcting: boolean,
  catalogueLinked: boolean,
): EditorProblem[] {
  const problems: EditorProblem[] = [];
  const brandBound = textBounds.manualBrand ?? 0;
  const nameBound = textBounds.manualName ?? 0;
  if (brand.trim().length > brandBound) {
    problems.push({ field: 'manualBrand', label: fieldLabels.manualBrand, rule: `Use at most ${brandBound} characters.` });
  }
  if (name.trim().length > nameBound) {
    problems.push({ field: 'manualName', label: fieldLabels.manualName, rule: `Use at most ${nameBound} characters.` });
  } else if (scope === 'submit' && name.trim() === '' && !(correcting && catalogueLinked)) {
    problems.push({ field: 'manualName', label: fieldLabels.manualName, rule: correcting
      ? 'Keep a name on this product. Put the name back, or leave it as you recorded it.'
      : 'Give this product a name so you can recognise it later.' });
  }
  return problems;
}

/**
 * The problems with the reason a correction carries. A correction without
 * a reason is refused: the reason is what the owner reads later to see why
 * the entry changed.
 */
function reasonProblems(reason: string, scope: 'live' | 'submit'): EditorProblem[] {
  if (scope !== 'submit') return [];
  const bound = textBounds.reason ?? 0;
  if (reason.trim() === '') {
    return [{ field: 'reason', label: fieldLabels.reason, rule: 'Say why you are correcting this product. The reason is kept with the correction.' }];
  }
  if (reason.trim().length > bound) {
    return [{ field: 'reason', label: fieldLabels.reason, rule: `Use at most ${bound} characters.` }];
  }
  return [];
}

/**
 * The problems with the identity a correction carries.
 *
 * A correction replaces the brand, the product name or the category. Two
 * corrections are refused before they reach the server, which refuses them
 * too: one that carries no identity at all, and one that re-answers the
 * identity with the same words - or that changes only a related fact, so it
 * corrects nothing.
 *
 * The rule is judged when the owner asks to save, not while they type: a
 * half-typed correction is never scolded.
 */
export function correctionIdentityProblems(
  mode: ShelfEditorMode,
  start: { brand: string; name: string; category: string },
  current: { brand: string; name: string; category: string },
  touched: { brand: boolean; name: boolean; category: boolean },
  record: ShelfIdentity | null | undefined,
  scope: 'live' | 'submit',
): EditorProblem[] {
  if (mode !== 'correct' || scope !== 'submit') return [];
  const changes = correctedIdentity(start, current, touched);
  const carries = changes.manualBrand !== undefined
    || changes.manualName !== undefined
    || changes.manualCategory !== undefined;
  const problem = (rule: string): EditorProblem[] => [
    { field: 'identity', label: fieldLabels.identity, rule },
  ];
  if (!carries) return problem(CORRECTION_IDENTITY_RULE);
  if (!correctionChangesIdentity(record, changes)) return problem(CORRECTION_IDENTITY_CHANGE_RULE);
  return [];
}

/**
 * Every problem the editor holds, for the screen it is showing. The
 * identity is only sent when a product is added or corrected, so an
 * ordinary edit never asks about the brand or the name.
 */
function editorProblems(
  mode: ShelfEditorMode, brand: string, name: string, facts: FactsDraft, reason: string, scope: 'live' | 'submit',
  catalogueLinked: boolean,
): EditorProblem[] {
  return [
    ...(mode === 'add' || mode === 'correct' ? identityProblems(brand, name, scope, mode === 'correct', catalogueLinked) : []),
    ...(mode === 'add' || mode === 'edit' || mode === 'correct' ? factsProblems(facts, scope) : []),
    ...(mode === 'correct' ? reasonProblems(reason, scope) : []),
  ];
}

/** The owner-facing name of every field a command can fail on. */
const commandFieldNames: Record<string, string> = {
  manualBrand: 'brand',
  manualName: 'product name',
  manualCategory: 'category',
  manualVariant: 'variant',
  manualSize: 'size',
  manualBarcode: 'barcode',
  openedOn: 'opening date',
  expiryOn: 'expiry date',
  pao: 'period after opening',
  quantityBand: 'how much is left',
  repurchaseIntent: 'whether you would buy it again',
  notes: 'notes',
  availability: 'availability',
  versionId: 'catalogue version ID',
  confirmed: 'confirmation',
  expectedRevision: 'saved entry',
  correctsId: 'the entry being corrected',
  reason: 'reason for the correction',
};

type CommandIssue = { code?: string; path?: readonly unknown[]; message?: string; maximum?: number | bigint };

/**
 * The owner-facing wording for the refusals the domain states without a
 * field of their own. Anything not named here stays a plain message, never
 * the internal wording of a schema.
 */
const domainRefusals: Record<string, string> = {
  'Manual entries require a product name': 'Give this product a name before you save it. A manual entry needs a name.',
  'A catalogue link belongs to the confirmed match command': 'This product cannot be linked to a catalogue entry from here. Link it from the product entry instead.',
  // The correction rule is already in the owner's own words, and it is the
  // same wording the editor and the intro use.
  [CORRECTION_IDENTITY_RULE]: CORRECTION_IDENTITY_RULE,
};

/**
 * The wording for a refusal the server states.
 *
 * The server refuses a correction that changes nothing about the identity,
 * and it says so with a code of its own. The owner is told the rule in the
 * same words the editor uses, instead of being told to retry a command
 * that would be refused again.
 */
export function serverRefusal(error: unknown): string | null {
  const message = String((error as { message?: string })?.message ?? '');
  if (message.includes('invalid-correction-noop')) return CORRECTION_IDENTITY_CHANGE_RULE;
  if (message.includes('invalid-correction-target')) {
    return 'That entry cannot be corrected. Open the product entry and start the correction again.';
  }
  if (message.includes('invalid-correction')) return CORRECTION_IDENTITY_RULE;
  if (message.includes('invalid-availability')) {
    return 'An availability change is an ordinary change. Use "Edit this product" to change it.';
  }
  return null;
}

/**
 * The message a refused command gets: it names the field that failed and
 * the rule it broke, and it never mentions matching, keys or internal
 * wording.
 */
export function commandFailureMessage(error: unknown): string {  const issues = (error as { issues?: readonly CommandIssue[] })?.issues;
  if (!Array.isArray(issues)) return 'This product could not be saved. Check the details you entered and try again.';
  const failures: string[] = [];
  for (const issue of issues) {
    const known = domainRefusals[issue.message ?? ''];
    if (known !== undefined) {
      failures.push(known);
      continue;
    }
    const path: readonly unknown[] = issue.path ?? [];
    const field = path.map((part: unknown) => String(part)).find(part => part in commandFieldNames);
    if (field === undefined) continue;
    const name = commandFieldNames[field];
    if (issue.code === 'too_big' && typeof issue.maximum === 'number') {
      failures.push(`The ${name} is too long. Use at most ${issue.maximum} characters.`);
      continue;
    }
    failures.push(`The ${name} could not be saved. Check it and try again.`);
  }
  if (failures.length === 0) return 'This product could not be saved. Check the details you entered and try again.';
  return [...new Set(failures)].join(' ');
}

async function sendDraft(draft: ShelfDraft) {
  if (draft.mode === 'add') return recordUserProduct(draft.command);
  if (draft.mode === 'edit') return changeUserProduct(draft.command);
  if (draft.mode === 'correct') return correctUserProduct(draft.command);
  if (draft.mode === 'match') return matchUserProduct(draft.command);
  return archiveUserProduct(draft.command);
}

export async function loadShelfConflict(
  userProductId: string,
  loader: (id: string) => Promise<ShelfDetail | null>,
): Promise<{ latest: ShelfDetail | null; message: string }> {
  try {
    const latest = await loader(userProductId);
    return latest
      ? { latest, message: '' }
      : { latest: null, message: 'This product could not be found. Your draft is retained.' };
  } catch {
    return { latest: null, message: 'The latest entry could not be loaded. Your submitted facts are still here.' };
  }
}

export function ShelfEditor({ owner, mode, userProductId, detail, resume, onSaved, onCancel }: {
  owner: string; mode: ShelfEditorMode; userProductId?: string; detail?: ShelfDetail; resume?: ShelfDraft;
  onSaved: () => void; onCancel: () => void;
}) {
  const [identity, setIdentity] = useState(() => ({
    operationId: resume?.command.operationId ?? Crypto.randomUUID(),
    userProductId: resume?.command.userProductId ?? userProductId ?? detail?.id ?? Crypto.randomUUID(),
  }));
  /**
   * The entry as it stands now. It starts as the one the screen handed
   * over and is replaced by the entry the server really holds - after a
   * conflict, or when a retained draft is reopened - so a save is always
   * made against the revision that is really there.
   */
  const [current, setCurrent] = useState<ShelfDetail | null>(detail ?? null);
  const loadStarted = useRef(false);
  /** Whether the screen handed the editor the entry it is working on. */
  const entryProvided = useRef(detail !== undefined);
  /**
   * The revision a correction replaces, and the identity the correction
   * starts from. A correction appends, so the entry it corrects stays
   * readable in the owner's own history.
   */
  const target = correctionTarget(current?.revisions);
  const starting = correctionIdentity(target, current);
  const resumed = resume?.mode === 'correct' ? resume.command : null;
  /**
   * The entry as the form found it. A correction is a difference against
   * this state, so the answer the owner did not touch is preserved and
   * never sent again.
   */
  const [startIdentity] = useState(() => ({
    brand: resumed ? resumed.manualBrand ?? ''
      : mode === 'correct' ? starting.brand
        : detail?.manualBrand ?? '',
    name: resumed ? resumed.manualName ?? ''
      : mode === 'correct' ? starting.name
        : detail?.manualName ?? '',
    // A category the owner took back is an answer of its own, so the form
    // opens on the way back rather than on an empty answer.
    category: resumed ? (resumed.manualCategory === null ? clearedSentinel : resumed.manualCategory ?? '')
      : mode === 'correct' ? (starting.cleared.category ? clearedSentinel : starting.category)
        : detail?.manualCategory ?? '',
  }));
  /**
   * The identity fields the owner took back.
   *
   * A field the owner cleared and a field the owner never answered are two
   * different answers, so the form says which one it is: a cleared field
   * reads "Cleared" everywhere, never "Not answered".
   */
  const clearedIdentity = resumed
    ? {
      brand: resumed.manualBrand === null,
      name: resumed.manualName === null,
      category: resumed.manualCategory === null,
    }
    : mode === 'correct' ? starting.cleared : { brand: false, name: false, category: false };
  const [manualBrand, setManualBrand] = useState(startIdentity.brand);
  const [manualName, setManualName] = useState(startIdentity.name);
  const [manualCategory, setManualCategory] = useState<string>(startIdentity.category);
  /**
   * The identity fields the owner answered.
   *
   * A correction carries the identity it answers, so a field the owner
   * edited is part of the correction even when the answer is the one the
   * record already holds.
   */
  const [touched, setTouched] = useState({ brand: false, name: false, category: false });
  const [reason, setReason] = useState(resumed?.reason ?? '');
  const [startFacts] = useState<FactsDraft>(() => (
    resume
      ? factsFromCommand(resume.command as unknown as Record<string, unknown>)
      : factsFrom(detail)
  ));
  const [facts, setFacts] = useState<FactsDraft>(startFacts);
  const [availability, setAvailability] = useState<string>(() => {
    const resumedCommand = resume?.command as unknown as Record<string, unknown> | undefined;
    const resumedAvailability = resumedCommand?.availability;
    if (typeof resumedAvailability === 'string') return resumedAvailability;
    return detail?.availability ?? 'available';
  });
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [versionId, setVersionId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<ShelfDraft | null>(resume ?? null);
  const [latest, setLatest] = useState<ShelfDetail | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // The owner has asked to save: from here on the full check answers them.
  const [attempted, setAttempted] = useState(false);
  /**
   * The guard against a response that belongs to a former owner. It is
   * armed for the owner the editor was created for and never re-armed for
   * another one: an owner change invalidates it for good, so a response
   * that arrives afterwards is never treated as live. The arming happens in
   * the effect body, so the mount -> cleanup -> effect sequence React
   * StrictMode runs leaves the guard armed.
   */
  const alive = useRef(true);
  const editorOwner = useRef(owner);
  const inFlight = useRef(false);
  useEffect(() => {
    if (editorOwner.current === owner) alive.current = true;
    return () => { alive.current = false; };
  }, [owner]);
  /** Whether an answer that arrives now still belongs to this owner. */
  const isLive = () => alive.current && editorOwner.current === owner;
  /**
   * A retained draft opens without the entry in front of it. The editor
   * loads it, so the identity it shows and the revision it saves against
   * are the ones the server holds.
   */
  useEffect(() => {
    // An entry that was handed over is already the one the server holds.
    if (loadStarted.current || mode === 'add' || entryProvided.current) return;
    loadStarted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const entry = await getUserProduct(identity.userProductId, true);
        if (cancelled || !alive.current || editorOwner.current !== owner) return;
        setCurrent(entry);
      } catch {
        if (!cancelled && alive.current && editorOwner.current === owner) {
          setMessage('The current entry could not be loaded. Your draft is still here.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, identity.userProductId, owner]);
  const locked = pending !== null || busy;
  const copy = shelfEditorCopy(mode);
  const expectedRevision = current?.revision ?? 1;
  /**
   * Whether a catalogue version identifies the product on its own.
   *
   * A linked product keeps its identity even without a name the owner
   * typed, so the name of such a product can be cleared in a correction:
   * the server takes it, and the owner's typo goes away for good.
   */
  const catalogueLinked = Boolean(current?.versionId);
  /** The entry a correction replaces: the newest one nothing corrects. */
  const correctsId = resumed?.correctsId ?? target?.id ?? null;
  const scope = attempted ? 'submit' : 'live';
  /**
   * The identity the record holds, as the domain reads it. The entry the
   * server holds wins over the values the form opened on, because that is
   * what a correction is compared against.
   */
  const recordIdentity = shelfIdentity(current, {
    brand: startIdentity.brand,
    name: startIdentity.name,
    category: startIdentity.category === clearedSentinel ? null : startIdentity.category,
  });
  /**
   * Every problem of the screen, for the scope being judged.
   */
  const problemsFor = (judged: 'live' | 'submit'): EditorProblem[] => [
    ...editorProblems(mode, manualBrand, manualName, facts, reason, judged, catalogueLinked),
    ...correctionIdentityProblems(
      mode,
      startIdentity,
      { brand: manualBrand, name: manualName, category: manualCategory },
      touched,
      recordIdentity,
      judged,
    ),
  ];
  const problems = problemsFor(scope);
  /**
   * Whether a field was refused, so its own input says so.
   *
   * Every refused field carries the same state: the message under the
   * field says what is wrong, and the input itself says that its answer
   * was refused.
   */
  const refused = (field: EditorField): boolean => problems.some(problem => problem.field === field);
  /** The problem of one field, rendered where the field is. */
  const fieldError = (field: EditorField) => {
    const problem = problems.find(entry => entry.field === field);
    if (!problem) return null;
    return <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{`${problem.label}: ${problem.rule}`}</Text>;
  };
  /**
   * Whether an identity field reads as cleared: the owner took the answer
   * back, either with an earlier correction or by emptying the field now.
   */
  const identityCleared = (field: 'brand' | 'name'): boolean => {
    if (mode !== 'correct') return false;
    const value = field === 'brand' ? manualBrand : manualName;
    if (value.trim() !== '') return false;
    const start = field === 'brand' ? startIdentity.brand : startIdentity.name;
    return clearedIdentity[field] || start.trim() !== '';
  };
  /** The bottom summary: it never repeats the message shown at the field. */
  const factSummary = attempted && problems.length > 0
    ? (problems.length === 1
      ? 'This product was not saved. Check the field marked above and try again.'
      : 'This product was not saved. Check the fields marked above and try again.')
    : '';
  /** The legacy state is only offered while the saved entry already holds it. */
  const availabilityChoices = availability === legacyAvailability
    ? [...availabilities, legacyAvailability]
    : [...availabilities];

  const updateFact = (key: keyof FactsDraft, value: string) => {
    setFacts(previous => ({ ...previous, [key]: value }));
  };

  const submit = async () => {
    if (inFlight.current) return;
    let draft = pending;
    try {
      if (!draft) {
        setAttempted(true);
        // The save is judged by the full check, never by the live one: a
        // missing answer only counts once the owner asked to save.
        if (problemsFor('submit').length > 0) {
          // The message at the field answers this; an older one must not linger.
          setMessage('');
          return;
        }
        if (mode === 'match' && !confirmed) {
          setMessage('Confirm that this is the same product before matching it to a catalogue version.');
          return;
        }
        if ((mode === 'add' || mode === 'edit') && availability === 'archived' && !archiveConfirmed) {
          setMessage('Confirm that you want to archive this product. Its history stays in your record.');
          return;
        }
        if (mode === 'correct' && !correctsId) {
          setMessage('There is no entry to correct yet. Open the product entry and try again.');
          return;
        }
        if (mode === 'add') {
          draft = {
            mode,
            command: CreateUserProductCommandSchema.parse({
              operationId: identity.operationId,
              userProductId: identity.userProductId,
              // The date the command takes effect. It is read once, here,
              // and it travels with the command: a retained draft that is
              // retried the next day sends the same payload.
              effectiveDate: todayEffectiveDate(),
              versionId: null,
              manualBrand: manualBrand.trim() ? manualBrand.trim() : null,
              manualName: manualName.trim() ? manualName.trim() : null,
              manualCategory: manualCategory === '' ? null : manualCategory,
              manualVariant: recordedValue(facts.manualVariant, undefined),
              manualSize: recordedValue(facts.manualSize, undefined),
              manualBarcode: recordedValue(facts.manualBarcode, undefined),
              openedOn: openedOnValue(facts),
              expiryOn: facts.expiryOn.trim() ? facts.expiryOn.trim() : undefined,
              pao: recordedValue(facts.pao, undefined),
              quantityBand: answerValue(facts.quantityBand),
              repurchaseIntent: answerValue(facts.repurchaseIntent),
              notes: recordedValue(facts.notes, undefined),
              availability,
            }),
          };
        } else if (mode === 'edit') {
          draft = {
            mode,
            command: ChangeUserProductCommandSchema.parse({
              operationId: identity.operationId,
              userProductId: identity.userProductId,
              expectedRevision,
              // The date the command takes effect, read once and carried
              // with the command.
              effectiveDate: todayEffectiveDate(),
              // The legacy state is not one the owner can record any more: an
              // unchanged legacy row keeps the state it already holds.
              ...(availability === legacyAvailability ? {} : { availability }),
              manualVariant: recordedValue(facts.manualVariant, current?.manualVariant),
              manualSize: recordedValue(facts.manualSize, current?.manualSize),
              manualBarcode: recordedValue(facts.manualBarcode, current?.manualBarcode),
              openedOn: openedOnValue(facts),
              expiryOn: facts.expiryOn.trim() ? facts.expiryOn.trim() : (current?.expiryOn ? null : undefined),
              pao: recordedValue(facts.pao, current?.pao),
              quantityBand: answerValue(facts.quantityBand),
              repurchaseIntent: answerValue(facts.repurchaseIntent),
              notes: recordedValue(facts.notes, current?.notes),
            }),
          };
        } else if (mode === 'correct') {
          // A correction carries the difference the owner made: the identity
          // it answers and the facts it sets or clears. Everything the owner
          // left alone is left out, so the answer the entry holds is
          // preserved.
          const identityChanges = correctedIdentity(startIdentity, {
            brand: manualBrand,
            name: manualName,
            category: manualCategory,
          }, touched);
          const command: Record<string, unknown> = {
            operationId: identity.operationId,
            userProductId: identity.userProductId,
            expectedRevision,
            correctsId,
            reason: reason.trim(),
            // The date the command takes effect, read once and carried with
            // the command.
            effectiveDate: todayEffectiveDate(),
          };
          for (const [key, value] of Object.entries(identityChanges)) {
            if (value !== undefined) command[key] = value;
          }
          for (const [key, value] of Object.entries(correctedFacts(startFacts, facts))) {
            command[key] = value;
          }
          draft = { mode, command: CorrectUserProductCommandSchema.parse(command) };
        } else if (mode === 'match') {
          draft = {
            mode,
            command: MatchUserProductCommandSchema.parse({
              operationId: identity.operationId,
              userProductId: identity.userProductId,
              expectedRevision,
              versionId,
              confirmed: true,
            }),
          };
        } else {
          if (!archiveConfirmed) {
            setMessage('Confirm that you want to archive this product. Its history stays in your record.');
            return;
          }
          draft = {
            mode,
            command: ArchiveUserProductCommandSchema.parse({
              operationId: identity.operationId,
              userProductId: identity.userProductId,
              expectedRevision,
            }),
          };
        }
      }
    } catch (error) { setMessage(commandFailureMessage(error)); return; }
    inFlight.current = true; setBusy(true); setMessage(''); setPending(draft);
    try {
      await submitShelfDraft(secureStorage, owner, draft, sendDraft, () => isLive());
      if (isLive()) onSaved();
    } catch (error) {
      if (!isLive()) return;
      const isConflict = String((error as { message?: string })?.message).includes('revision-conflict');
      setConflict(isConflict);
      if (isConflict) {
        setMessage('This product changed elsewhere. Your submitted facts are retained while the current entry loads.');
        const result = await loadShelfConflict(identity.userProductId, id => getUserProduct(id, true));
        if (!isLive()) return;
        setLatest(result.latest);
        // The entry the server really holds becomes the one this form
        // saves against, so the save after the conflict can succeed.
        if (result.latest) setCurrent(result.latest);
        setMessage(result.latest
          ? `The current entry, revision ${result.latest.revision}, has been loaded. Your submitted facts stay in the locked form. Discard the failed attempt to save against the current entry.`
          : (result.message || 'The current entry could not be loaded. Your submitted facts are still here.'));
      } else {
        // A refusal the server states is a rule, not a failed connection:
        // the owner is told the rule, and the command is not locked for a
        // retry that would be refused again.
        const refusal = serverRefusal(error);
        setMessage(refusal ?? 'The save was not confirmed. Your command is locked for an identical retry.');
      }
    } finally { inFlight.current = false; if (isLive()) setBusy(false); }
  };

  const discard = async () => {
    setBusy(true); setMessage('');
    try {
      await removeShelfDraft(secureStorage, owner, identity.userProductId);
      if (!isLive()) return;
      if (latest) {
        setIdentity(previous => ({ ...previous, operationId: Crypto.randomUUID() }));
        setPending(null); setConflict(false); setLatest(null);
        setMessage(`The failed attempt was discarded. Save again to record your change against revision ${current?.revision ?? expectedRevision}.`);
      } else onCancel();
    } catch { if (isLive()) setMessage('The device draft could not be removed. Please try again.'); }
    finally { if (isLive()) setBusy(false); }
  };

  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>{copy.title}</Text>
    <Text style={styles.body}>{mode === 'add'
      ? 'Add a product you own. You only need what you know: a brand, a name or a catalogue link, and whatever else you want to remember. Nothing here needs a barcode, a photograph or a research record.'
      : mode === 'edit'
        ? 'Record what changed about this product. The brand and name you entered are kept as they are; a wrong one is corrected from the product entry, and the original stays readable in your history.'
        : mode === 'correct'
          ? `Correct what you recorded about this product. The correction is added to your history, and the entry it replaces stays readable. Only what you answer here is sent: everything else stays as you recorded it. ${CORRECTION_IDENTITY_RULE} To change only the other details, use "Edit this product".`
          : mode === 'match'
            ? 'Link this entry to a catalogue version. Your original manual details are preserved and matching needs explicit confirmation.'
            : 'Archiving removes this product from the active list. Prior records that used it are preserved.'}</Text>
    {pending && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>A save is awaiting confirmation. The fields are locked so retrying sends the same command.</Text>}
    {mode === 'add' && <>
      <Field label="Brand (as printed)" value={manualBrand} editable={!locked} accessibilityState={inputState(locked, refused('manualBrand'))} maxLength={200} onChangeText={setManualBrand} />
      {fieldError('manualBrand')}
      <Field label="Product name" value={manualName} editable={!locked} accessibilityState={inputState(locked, refused('manualName'))} maxLength={200} onChangeText={setManualName} />
      {fieldError('manualName')}
      <Choice label="Category" value={manualCategory} options={[...categories]} labels={categoryOptions} disabled={locked} onChange={setManualCategory} />
      {manualCategory === '' && <Text style={styles.body}>Category: {notAnsweredLabel}</Text>}
    </>}
    {mode === 'edit' && <View style={styles.notice}>
      <Text style={styles.body}>Brand: {current?.manualBrand ?? notAnsweredLabel}</Text>
      <Text style={styles.body}>Name: {current?.manualName ?? notAnsweredLabel}</Text>
      <Text style={styles.body}>Category: {current?.manualCategory ? categoryLabel(current.manualCategory) : notAnsweredLabel}</Text>
    </View>}
    {mode === 'correct' && <>
      {target && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>{`You are correcting the entry that recorded ${recordedIdentityWording(target.patch)}.`}</Text>}
      <Text accessibilityRole="header" style={styles.heading}>The details being corrected</Text>
      <Field label="Brand (as printed)" value={manualBrand} editable={!locked} accessibilityState={inputState(locked, refused('manualBrand') || refused('identity'))} maxLength={200}
        onChangeText={value => { setManualBrand(value); setTouched(previous => ({ ...previous, brand: true })); }} />
      {fieldError('manualBrand')}
      {identityCleared('brand') && <Text style={styles.body}>{`Brand: ${clearedLabel}`}</Text>}
      {!identityCleared('brand') && manualBrand.trim() === '' && <Text style={styles.body}>{`Brand: ${notAnsweredLabel}`}</Text>}
      <Field label="Product name" value={manualName} editable={!locked} accessibilityState={inputState(locked, refused('manualName') || refused('identity'))} maxLength={200}
        onChangeText={value => { setManualName(value); setTouched(previous => ({ ...previous, name: true })); }} />
      {fieldError('manualName')}
      {identityCleared('name') && <Text style={styles.body}>{`Name: ${clearedLabel}`}</Text>}
      {!identityCleared('name') && manualName.trim() === '' && <Text style={styles.body}>{`Name: ${notAnsweredLabel}`}</Text>}
      <Choice label="Category" value={manualCategory} options={correctionCategoryChoices} labels={correctionCategoryOptions} disabled={locked}
        onChange={value => { setManualCategory(value); setTouched(previous => ({ ...previous, category: true })); }} />
      {manualCategory === clearedSentinel && <Text style={styles.body}>{`Category: ${clearedLabel}`}</Text>}
      {manualCategory === '' && <Text style={styles.body}>{`Category: ${notAnsweredLabel}`}</Text>}
      {/*
        * The rule the correction has to meet is shown where the owner can
        * act on it: next to the three fields it is about, and the fields
        * themselves say that their answer was refused.
        */}
      {fieldError('identity')}
      <Text accessibilityRole="header" style={styles.heading}>Why you are correcting it</Text>
      <Field label="Reason for this correction (required)" value={reason} editable={!locked}
        accessibilityHint="Required. Say why you are correcting this product. The reason is kept with the correction."
        accessibilityState={inputState(locked, refused('reason'))} maxLength={500} onChangeText={setReason} />
      {fieldError('reason')}
    </>}
    {(mode === 'add' || mode === 'edit' || mode === 'correct') && <>
      {mode === 'correct' && <Text accessibilityRole="header" style={styles.heading}>The other details that can change</Text>}
      <Field label="Variant (as printed, optional)" value={facts.manualVariant} editable={!locked} accessibilityState={inputState(locked, refused('manualVariant'))} maxLength={200} onChangeText={value => updateFact('manualVariant', value)} />
      {fieldError('manualVariant')}
      <Field label="Size (as printed, optional)" value={facts.manualSize} editable={!locked} accessibilityState={inputState(locked, refused('manualSize'))} maxLength={200} onChangeText={value => updateFact('manualSize', value)} />
      {fieldError('manualSize')}
      <Field label="Barcode (optional)" value={facts.manualBarcode} editable={!locked} accessibilityState={inputState(locked, refused('manualBarcode'))} maxLength={100} onChangeText={value => updateFact('manualBarcode', value)} />
      {fieldError('manualBarcode')}
      {(mode === 'add' || mode === 'edit') && <>
        <Choice label="Availability" value={availability} options={availabilityChoices} labels={availabilityLabels} disabled={locked} onChange={value => { setAvailability(value); setArchiveConfirmed(false); }} />
        {availability === legacyAvailability && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>Not currently available is a state some products still carry from an earlier version of the app. Choose the state it is in now to change it.</Text>}
        {availability === 'archived' && <>
          <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.body}>{archiveConfirmationNotice}</Text>
          <Choice label="I confirm this product is archived" value={archiveConfirmed ? 'yes' : 'no'} options={['no', 'yes']} labels={archiveConfirmationLabels} disabled={locked}
            onChange={value => { setArchiveConfirmed(value === 'yes'); setMessage(''); }} />
        </>}
      </>}
      <Choice label="When did you open it?" value={facts.openedPrecision} options={openedPrecisionChoices} labels={openedPrecisionOptions} disabled={locked}
        onChange={value => { updateFact('openedPrecision', value); updateFact('openedValue', ''); }} />
      {openedPrecisionAnswered(facts) && <>
        <Field
          label={facts.openedPrecision === 'day' ? 'Date opened (YYYY-MM-DD)' : facts.openedPrecision === 'month' ? 'Month opened (YYYY-MM)' : 'Year opened (YYYY)'}
          value={facts.openedValue} editable={!locked} accessibilityState={inputState(locked, refused('openedOn'))}
          onChangeText={value => updateFact('openedValue', value)} />
        {fieldError('openedOn')}
      </>}
      <Field label="Expiry date (YYYY-MM-DD, optional)" value={facts.expiryOn} editable={!locked} accessibilityState={inputState(locked, refused('expiryOn'))} maxLength={10} onChangeText={value => updateFact('expiryOn', value)} />
      {fieldError('expiryOn')}
      <Field label="Period after opening (your own words, optional)" value={facts.pao} editable={!locked} accessibilityState={inputState(locked, refused('pao'))} maxLength={200} onChangeText={value => updateFact('pao', value)} />
      {fieldError('pao')}
      <Choice label="How much is left?" value={facts.quantityBand} options={quantityBandChoices} labels={quantityBandOptions} disabled={locked} onChange={value => updateFact('quantityBand', value)} />
      <Choice label="Would you buy it again?" value={facts.repurchaseIntent} options={repurchaseIntentChoices} labels={repurchaseIntentOptions} disabled={locked} onChange={value => updateFact('repurchaseIntent', value)} />
      <Field label="Short notes (optional, avoid identifying details)" value={facts.notes} editable={!locked} accessibilityState={inputState(locked, refused('notes'))} multiline maxLength={2000} onChangeText={value => updateFact('notes', value)} />
      {fieldError('notes')}
    </>}
    {mode === 'match' && <>
      <Text style={styles.body}>Matching links this entry without rewriting what you originally recorded.</Text>
      <Field label="Catalogue version ID" value={versionId} editable={!locked} accessibilityState={{ disabled: locked }} onChangeText={setVersionId} />
      <Choice label="I confirm this is the same product" value={confirmed ? 'yes' : 'no'} options={['no', 'yes']} labels={matchConfirmationLabels} disabled={locked}
        onChange={value => setConfirmed(value === 'yes')} />
    </>}
    {mode === 'archive' && <>
      <Text style={styles.body}>Archived products leave the active list. Their history remains.</Text>
      <Choice label="I confirm this product is archived" value={archiveConfirmed ? 'yes' : 'no'} options={['no', 'yes']} labels={archiveConfirmationLabels} disabled={locked}
        onChange={value => setArchiveConfirmed(value === 'yes')} />
    </>}
    {factSummary !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{factSummary}</Text>}
    {latest && <View style={styles.notice}>
      <Text accessibilityRole="header" style={styles.heading}>Current saved entry</Text>
      <Text style={styles.body}>Revision {latest.revision} · {availabilityLabel(latest.availability)}. Your submitted facts remain in the locked form above.</Text>
      <Button title="Discard failed attempt and review" disabled={busy} onPress={() => void discard()} />
    </View>}
    {!!message && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text>}
    <Button title={busy ? 'Saving…' : pending ? 'Retry identical save' : copy.submit} disabled={busy || conflict} onPress={() => void submit()} />
    {pending && !latest && <Button title="Discard device draft" secondary disabled={busy} onPress={() => void discard()} />}
    <Button title={pending ? 'Back to shelf (keep draft)' : 'Cancel'} secondary disabled={busy} onPress={onCancel} />
  </View>;
}
