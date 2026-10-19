export type ShelfEditorMode = 'add' | 'edit' | 'correct' | 'match' | 'archive';

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
 * The wording of the answer that takes an answer back. It is offered
 * wherever the owner can record an answer, so a wrong answer can always be
 * taken back.
 */
export const notAnsweredLabel = 'Not answered';

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

/** The opened date, in the precision the owner actually knows. */
export function openedOnLabel(openedOn: { precision: string; value: string | null } | null | undefined): string | null {
  if (!openedOn) return null;
  if (openedOn.precision === 'unknown') return 'Not sure when it was opened';
  const value = openedOn.value ?? '';
  if (openedOn.precision === 'day') return `Opened on ${value}`;
  if (openedOn.precision === 'month') return `Opened in ${value}`;
  return `Opened in ${value}`;
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
 * What one revision of the history recorded.
 *
 * A correction appends, it never rewrites, so the entry it replaces stays
 * readable: every revision says what it recorded at the time.
 */
export function revisionLines(patch: Record<string, unknown> | undefined): string[] {
  if (!patch) return [];
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const lines: string[] = [];
  const brand = text(patch.manualBrand);
  const name = text(patch.manualName);
  const category = text(patch.manualCategory);
  const availability = text(patch.availability);
  if (brand) lines.push(`Brand: ${brand}`);
  if (name) lines.push(`Name: ${name}`);
  if (category) lines.push(`Category: ${categoryLabel(category)}`);
  if (availability) lines.push(`Availability: ${availabilityLabel(availability)}`);
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
  const opened = openedOnLabel(facts.openedOn);
  if (opened) lines.push(opened);
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
