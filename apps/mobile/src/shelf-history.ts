export type ShelfEditorMode = 'add' | 'edit' | 'correct' | 'match' | 'archive';

/** The modes the form editor handles. A match has its own search-and-compare screen. */
export type ShelfFormMode = Exclude<ShelfEditorMode, 'match'>;

export function shelfEditorCopy(mode: ShelfEditorMode) {
  return {
    add: { title: 'Add a product', submit: 'Save product' },
    edit: { title: 'Edit this product', submit: 'Save changes' },
    correct: { title: 'Correct this product', submit: 'Save correction' },
    match: { title: 'Match to catalogue entry', submit: 'Confirm match' },
    archive: { title: 'Archive this product', submit: 'Archive product' },
  }[mode];
}

/**
 * The categories the owner can file a product under. The list is shared, so
 * the editor and the label never drift apart.
 */
export const shelfCategories = [
  'shampoo', 'clarifier', 'conditioner', 'mask', 'bond/protein treatment',
  'leave-in', 'heat protectant', 'anti-humidity', 'styling cream', 'mousse',
  'gel', 'serum', 'oil', 'scalp', 'colour', 'other',
] as const;

/** A category in the words the owner reads it in. */
export function categoryLabel(value: string): string {
  const text = value.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The wording of an answer the owner never gave.
 *
 * It says the question was left alone, never that the answer was taken
 * back: that is a different answer, and it has its own words.
 */
export const notAnsweredLabel = 'Not answered';

/**
 * The wording of an answer the owner took back.
 *
 * The three answers a fact can hold never collapse into one: a fact the
 * owner never answered reads as "Not answered", a fact the owner took back
 * reads as "Cleared", and an explicit unknown answer keeps its own words
 * ("Not sure", "I do not know").
 */
export const clearedLabel = 'Cleared';

/** Audit wording is deliberately different from the editor action. */
const auditNotAnsweredLabel = 'Not answered in this entry';
const auditClearedLabel = 'Removed saved answer';

/**
 * The wording of an answer a correction left alone.
 *
 * A correction that did not touch a fact kept the answer the record holds,
 * so the history says "Kept" rather than "Not answered": the owner did
 * answer, and the correction did not take it back.
 */
export const keptLabel = 'Kept';

export function shelfView(loading: boolean, items: readonly unknown[], detail: unknown) {
  return detail ? 'detail' : items.length ? 'list' : loading ? 'loading' : 'empty';
}

export function appendShelfPage<T extends { id: string }>(previous: readonly T[], page: readonly T[]): T[] {
  return [...previous, ...page.filter(item => !previous.some(existing => existing.id === item.id))];
}

// Verification status is always rendered as text alongside any badge.
// There is no whole-record truth: each claim carries its own status.
export function verificationBadge(status: string): string {
  switch (status) {
    case 'verified': return 'Verified claim';
    case 'partially_verified': return 'Partially verified claim';
    case 'pending_verification': return 'Verification pending';
    case 'conflicting_information': return 'Conflicting information — see sources';
    default: return 'Unverified claim';
  }
}

/**
 * The availability the owner recorded. The wording stays plain: `low` and
 * `empty` are states of a product the owner owns, never a judgement about
 * the owner, and nothing here says waste, wastefulness or fear.
 *
 * One vocabulary serves the whole journey: the list, the detail screen and
 * the editor radio group all read the same words, so a state never changes
 * its name between screens.
 */
export function availabilityLabel(availability: string): string {
  switch (availability) {
    case 'available': return 'Available';
    case 'low': return 'Running low';
    // A bare "Empty" says nothing about what is empty; this names the state
    // of the product itself.
    case 'empty': return 'Nothing left';
    case 'out_of_stock': return 'Not currently available';
    case 'archived': return 'Archived';
    default: return 'Availability unknown';
  }
}

const quantityBandLabels: Record<string, string> = {
  full: 'Full',
  'about-three-quarters': 'About three quarters left',
  'about-half': 'About half left',
  'about-quarter': 'About a quarter left',
  'nearly-empty': 'Nearly empty',
  unknown: 'Not sure',
};

const repurchaseIntentLabels: Record<string, string> = {
  'would-rebuy': 'Would buy again',
  'would-not-rebuy': 'Would not buy again',
  // The two unknown answers must not sound alike: one is an undecided owner,
  // the other is an owner who does not know.
  unsure: 'Not sure yet',
  unknown: 'I do not know',
};

export function quantityBandLabel(value: string): string {
  return quantityBandLabels[value] ?? value;
}

export function repurchaseIntentLabel(value: string): string {
  return repurchaseIntentLabels[value] ?? value;
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The label the opened date carries, like every other fact it is read
 * with: the line reads like its siblings on every screen.
 */
export const openedDateLabel = 'Opened date';

/**
 * The opened date, in the precision the owner actually knows.
 *
 * The precision is in words, not in raw digits: a day, a month and a year
 * have to be tellable apart by sound, because a screen reader reads
 * "2026-03" as two numbers. The day is said as a day, the month is named
 * and the year is named, so "1 March 2026", "March 2026" and "2026" are
 * three different answers - and a date the owner is not sure of says so
 * in words as well.
 */
export function openedOnWords(openedOn: { precision: string; value: string | null }): string {
  if (openedOn.precision === 'unknown') return 'Not sure when it was opened';
  const value = openedOn.value ?? '';
  if (value.trim() === '') return 'Not sure when it was opened';
  if (openedOn.precision === 'day') {
    const [year, month, day] = value.split('-');
    const name = monthNames[Number(month) - 1];
    if (!name || !day) return value;
    return `${Number(day)} ${name} ${year}`;
  }
  if (openedOn.precision === 'month') {
    const [year, month] = value.split('-');
    const name = monthNames[Number(month) - 1];
    if (!name) return value;
    return `${name} ${year}`;
  }
  return value;
}

/** The opened date, in the precision the owner actually knows. */
export function openedOnLabel(openedOn: { precision: string; value: string | null } | null | undefined): string | null {
  if (!openedOn) return null;
  return openedOnWords(openedOn);
}

export type ShelfRecordedFacts = {
  manualBrand?: string | null;
  manualCategory?: string | null;
  manualVariant?: string | null;
  manualSize?: string | null;
  manualBarcode?: string | null;
  openedOn?: { precision: string; value: string | null } | null;
  expiryOn?: string | null;
  pao?: string | null;
  quantityBand?: string | null;
  repurchaseIntent?: string | null;
};

/**
 * The facts one revision of the history can record, and the words each one
 * is read in.
 */
type RevisionFact = {
  key: string;
  label: string;
  format?: (value: string) => string;
};

const revisionFacts: RevisionFact[] = [
  { key: 'manualBrand', label: 'Brand' },
  { key: 'manualName', label: 'Name' },
  { key: 'manualCategory', label: 'Category', format: categoryLabel },
  { key: 'manualVariant', label: 'Variant' },
  { key: 'manualSize', label: 'Size' },
  { key: 'manualBarcode', label: 'Barcode' },
  { key: 'availability', label: 'Availability', format: availabilityLabel },
  { key: 'expiryOn', label: 'Expiry date' },
  { key: 'pao', label: 'Period after opening' },
  { key: 'quantityBand', label: 'How much is left', format: quantityBandLabel },
  { key: 'repurchaseIntent', label: 'Buying again', format: repurchaseIntentLabel },
  { key: 'notes', label: 'Notes' },
];

/**
 * The period after opening, read in the owner's own words. The owner's
 * wording already says what the period is, so the label is only added when
 * the wording does not say it itself.
 */
function periodAfterOpeningLine(value: string): string {
  return /after opening/i.test(value) ? value : `Period after opening: ${value}`;
}

/**
 * The facts a correction can carry.
 *
 * The availability is not one of them: an availability change is an
 * ordinary change, so a correction that records no availability has not
 * cleared it - it kept it.
 */
export const correctionFacts = new Set([
  'manualBrand', 'manualName', 'manualCategory',
  'manualVariant', 'manualSize', 'manualBarcode',
  'openedOn', 'expiryOn', 'pao', 'quantityBand', 'repurchaseIntent', 'notes',
]);

/**
 * The wording of a correction whose earlier entries cannot be read.
 *
 * A history that cannot be walked is not guessed at: the owner is told the
 * earlier entries could not be read, so no field is described as answered
 * when it may never have been answered at all.
 */
export const unreadableHistoryLabel = 'The earlier entries of this product could not be read.';

/**
 * Whether the record held an answer for a fact before a correction.
 *
 * A key the state does not hold was never answered, and a key it holds as
 * null was answered and then taken back: neither is an answer the record
 * carries now. A blank answer is no answer at all, so it never counts.
 */
function answeredState(key: string, before: Record<string, unknown> | null | undefined): boolean {
  if (!before || !Object.prototype.hasOwnProperty.call(before, key)) return false;
  const value = before[key];
  if (value === null || value === undefined) return false;
  return typeof value === 'string' ? value.trim() !== '' : true;
}

/**
 * The state of a fact the correction did not touch.
 *
 * A correction that left a fact alone kept the answer the record holds, so
 * it reads "Kept". A fact the owner never answered at all reads "Not
 * answered". The state of the record before the correction says which of
 * the two it is: it holds the key when the fact was answered before.
 *
 * The state is the whole lineage of the record up to the entry the
 * correction replaces, not that entry alone: an entry can leave out a fact
 * an earlier entry recorded.
 */
function untouchedState(key: string, before: Record<string, unknown> | null | undefined): string {
  return answeredState(key, before) ? keptLabel : auditNotAnsweredLabel;
}

/**
 * The state of a fact the correction took back.
 *
 * An explicit null is the owner taking an answer back. The audit describes
 * that result as "Removed saved answer", distinct from the editor action.
 * It uses that wording only when the state of the record before the
 * correction is known and held an answer to take back: a null over a value
 * that was never recorded answers nothing at all. When the state is not
 * known at all, the entry says what it did and reads "Removed saved answer".
 */
function removedState(key: string, before: Record<string, unknown> | null | undefined): string {
  if (before === undefined || before === null) return auditClearedLabel;
  return answeredState(key, before) ? auditClearedLabel : auditNotAnsweredLabel;
}

/**
 * The wording the entry a correction replaces recorded.
 *
 * A correction says which entry it replaces, so the owner can read the
 * history without guessing: the replaced entry is named by the wording it
 * recorded.
 */
export function recordedIdentityWording(patch: Record<string, unknown> | null | undefined): string {
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const name = text(patch?.manualName);
  if (name !== '') return `the name ${name}`;
  const brand = text(patch?.manualBrand);
  if (brand !== '') return `the brand ${brand}`;
  const category = text(patch?.manualCategory);
  if (category !== '') return `the category ${categoryLabel(category)}`;
  return 'no name';
}

/**
 * What one revision of the history recorded.
 *
 * A correction appends, it never rewrites, so the entry it replaces stays
 * readable: every revision says what it recorded at the time.
 *
 * A correction shows every fact, and the four answers stay apart: a fact
 * the owner never answered reads as "Not answered", a fact the owner
 * cleared reads as "Cleared", a fact the correction left alone reads as
 * "Kept", and an explicit unknown answer keeps its own words. The other
 * revisions show what they recorded.
 *
 * `before` is the patch of the revision this one replaces: it is what says
 * whether a fact the correction left alone was answered at all.
 */
export function revisionLines(
  patch: Record<string, unknown> | undefined,
  kind?: string,
  before?: Record<string, unknown> | null,
): string[] {
  if (!patch) return [];
  const lines: string[] = [];
  const correcting = kind === 'correction';
  const recorded = (label: string, value: string): void => { lines.push(`${label}: ${value}`); };
  for (const fact of revisionFacts) {
    const present = Object.prototype.hasOwnProperty.call(patch, fact.key);
    const raw = patch[fact.key];
    if (!present) {
      // The correction left the fact alone: it kept the answer the record
      // holds, or the owner never gave one.
      if (correcting) recorded(fact.label, untouchedState(fact.key, before));
      continue;
    }
    if (raw === null || raw === undefined) {
      // An explicit null takes the answer back: the owner cleared it.
      if (correcting) recorded(fact.label, removedState(fact.key, before));
      continue;
    }
    if (correcting && !correctionFacts.has(fact.key)) {
      // A correction never answers the availability: it kept it, whatever
      // the patch happens to carry.
      recorded(fact.label, keptLabel);
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') {
      // A blank answer is no answer at all: it was never recorded.
      if (correcting) recorded(fact.label, auditNotAnsweredLabel);
      continue;
    }
    if (fact.key === 'pao') {
      lines.push(periodAfterOpeningLine(text));
      continue;
    }
    recorded(fact.label, fact.format ? fact.format(text) : text);
  }
  // The opened date reads in its own words, because the precision the owner
  // knows is part of the answer, and the line carries its label like its
  // siblings do.
  const openedPresent = Object.prototype.hasOwnProperty.call(patch, 'openedOn');
  if (!openedPresent) {
    if (correcting) recorded(openedDateLabel, untouchedState('openedOn', before));
  } else if (patch.openedOn === null || patch.openedOn === undefined) {
    if (correcting) recorded(openedDateLabel, removedState('openedOn', before));
  } else {
    recorded(openedDateLabel, openedOnWords(patch.openedOn as { precision: string; value: string | null }));
  }
  return lines;
}

/**
 * The recorded facts, one readable line each. A fact the owner never
 * answered has no line at all; it is never shown as a blank or a zero.
 */
export function shelfFactLines(facts: ShelfRecordedFacts): string[] {
  const lines: string[] = [];
  // The identity the owner recorded travels with the product, so it is
  // shown next to the facts it belongs to.
  if (facts.manualBrand) lines.push(`Brand: ${facts.manualBrand}`);
  if (facts.manualCategory) lines.push(`Category: ${categoryLabel(facts.manualCategory)}`);
  if (facts.manualVariant) lines.push(`Variant: ${facts.manualVariant}`);
  if (facts.manualSize) lines.push(`Size: ${facts.manualSize}`);
  if (facts.manualBarcode) lines.push(`Barcode: ${facts.manualBarcode}`);
  // The opened date reads like its siblings: the label comes first and the
  // date is said in words, so the precision is still audible.
  const opened = openedOnLabel(facts.openedOn);
  if (opened !== null) lines.push(`${openedDateLabel}: ${opened}`);
  // A neutral label: the date may still be ahead, and nothing here frames
  // the product as wasted or faulty because of it.
  if (facts.expiryOn) lines.push(`Expiry date: ${facts.expiryOn}`);
  // The owner's own wording already says what the period is; repeating the
  // label in front of it only repeats the words.
  if (facts.pao) {
    lines.push(/after opening/i.test(facts.pao) ? facts.pao : `Period after opening: ${facts.pao}`);
  }
  if (facts.quantityBand) lines.push(`How much is left: ${quantityBandLabel(facts.quantityBand)}`);
  // The prefix and the answer are both full sentences, so the prefix is a
  // short phrase: "Buying again: Would not buy again" reads as an answer,
  // "Would buy again: Would not buy again" reads as a contradiction.
  if (facts.repurchaseIntent) lines.push(`Buying again: ${repurchaseIntentLabel(facts.repurchaseIntent)}`);
  return lines;
}
