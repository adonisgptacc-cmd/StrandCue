import {
  CATALOGUE_SEARCH_MAX_LENGTH,
  CATALOGUE_SEARCH_MAX_TERMS,
  normalizeCatalogueSearchText,
  type CatalogueCandidate,
  type ComparisonRow,
} from '../../../packages/domain/src/index';
import { categoryLabel, notAnsweredLabel } from './shelf-history';

/** Said wherever the catalogue entry holds no answer: never a guess, never blank. */
const notInCatalogue = 'Not recorded in the catalogue';

/** The owner's own recorded words, as the Shelf holds them. */
export type ManualRecordFields = {
  manualBrand: string | null;
  manualName: string | null;
  manualCategory: string | null;
  manualVariant: string | null;
  manualSize: string | null;
  manualBarcode: string | null;
};

/** Search words taken from what the owner recorded; they only prefill the box. */
export function suggestedSearchText(record: Pick<ManualRecordFields, 'manualBrand' | 'manualName'>): string {
  const words = normalizeCatalogueSearchText(`${record.manualBrand ?? ''} ${record.manualName ?? ''}`)
    .split(' ')
    .slice(0, CATALOGUE_SEARCH_MAX_TERMS)
    .join(' ')
    .slice(0, CATALOGUE_SEARCH_MAX_LENGTH)
    .trim();
  return words.length < 2 ? '' : words;
}

export function candidateTitle(candidate: CatalogueCandidate): string {
  return `${candidate.brand}: ${candidate.productName}`;
}

/** The identity of one exact version. Unknown facts are named, never skipped. */
export function candidateLines(candidate: CatalogueCandidate): string[] {
  return [
    `Brand: ${candidate.brand}`,
    `Product: ${candidate.productName}`,
    `Variant: ${candidate.variant ?? notInCatalogue}`,
    `Category: ${categoryLabel(candidate.category)}`,
    `Market: ${candidate.market === 'ZA' ? 'South Africa' : notInCatalogue}`,
    `Barcode: ${candidate.barcode ?? notInCatalogue}`,
    // A pack size is never a catalogue field, so it is always unknown here.
    `Size: ${notInCatalogue}`,
  ];
}

/** The last characters of the version id: enough to tell two versions apart. */
export function versionReference(candidate: CatalogueCandidate): string {
  return `Catalogue code (last 8 characters): ${candidate.versionId.slice(-8)}`;
}

/** Lifecycle only. It says what state the version is in, never that it is better or worse. */
export function lifecycleLine(candidate: CatalogueCandidate): string {
  if (candidate.lifecycle === 'active') return 'Catalogue status: current version';
  return candidate.successorVersionId === null
    ? 'Catalogue status: retired version'
    : 'Catalogue status: retired version. A newer version exists in the catalogue.';
}

/** What the owner recorded, in their own words. An unanswered field says so. */
export function manualRecordLines(record: ManualRecordFields): string[] {
  const answer = (value: string | null): string => (value === null || value.trim() === '' ? notAnsweredLabel : value);
  return [
    `Brand: ${answer(record.manualBrand)}`,
    `Product: ${answer(record.manualName)}`,
    `Category: ${record.manualCategory === null ? notAnsweredLabel : categoryLabel(record.manualCategory)}`,
    `Variant: ${answer(record.manualVariant)}`,
    `Size: ${answer(record.manualSize)}`,
    `Barcode: ${answer(record.manualBarcode)}`,
  ];
}

const fieldNames: Record<ComparisonRow['field'], string> = {
  brand: 'Brand', name: 'Product', category: 'Category', variant: 'Variant', size: 'Size', barcode: 'Barcode',
};

/** One comparison row in words. An unknown is never worded as a difference. */
export function comparisonLine(row: ComparisonRow): string {
  const name = fieldNames[row.field];
  const show = (value: string | null): string => (value !== null && row.field === 'category' ? categoryLabel(value) : value ?? '');
  if (row.status === 'same') return `${name}: the same wording in both.`;
  if (row.status === 'different') {
    return `${name}: different. You recorded "${show(row.manual)}"; the catalogue lists "${show(row.catalogue)}".`;
  }
  if (row.manual === null && row.catalogue === null) return `${name}: not recorded in either place, so it is unknown.`;
  if (row.manual !== null) {
    return `${name}: you recorded "${show(row.manual)}"; the catalogue does not hold it, so it cannot be compared.`;
  }
  return `${name}: the catalogue lists "${show(row.catalogue)}"; you did not record one, so it cannot be compared.`;
}

const errorText = (error: unknown): string => String((error as { message?: unknown } | null)?.message ?? '');

/** A failed search, in plain words. Server and network text is never repeated. */
export function searchFailureMessage(error: unknown): string {
  const text = errorText(error);
  if (text.includes('authentication-required')) return 'Sign in again to search the catalogue. Nothing was changed.';
  if (text.includes('invalid-search')) {
    return 'Those search words were not accepted. Use two to eighty characters and at most six words.';
  }
  return 'The catalogue search could not be completed. Nothing was changed. Try again.';
}

export type MatchFailure = { kind: 'conflict' | 'refused' | 'retry'; message: string };

/**
 * A failed match. A stale entry is never retried blind, a refusal is final for
 * this choice, and anything else keeps the same saved command for a safe retry.
 */
export function matchFailure(error: unknown): MatchFailure {
  const text = errorText(error);
  if (text.includes('revision-conflict')) {
    return { kind: 'conflict', message: 'This product changed elsewhere, so the match was not saved. Show the latest entry and choose again if you still want to match it.' };
  }
  if (text.includes('authentication-required')) {
    return { kind: 'refused', message: 'Sign in again to match this product. Nothing was linked.' };
  }
  if (text.includes('version-not-found')) {
    return { kind: 'refused', message: 'That catalogue version is no longer available. Nothing was linked. Go back and search again.' };
  }
  if (text.includes('operation-conflict') || text.includes('confirmation-required') || text.includes('not-found') || text.includes('invalid-')) {
    return { kind: 'refused', message: 'The match was not accepted. Nothing was linked. Go back and choose again.' };
  }
  return { kind: 'retry', message: 'The match could not be saved. Nothing was linked yet. You can retry the same confirmation; it will not be recorded twice.' };
}
