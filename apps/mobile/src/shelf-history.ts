export type ShelfEditorMode = 'add' | 'match' | 'archive';

export function shelfEditorCopy(mode: ShelfEditorMode) {
  return {
    add: { title: 'Add a product', submit: 'Save product' },
    match: { title: 'Match to catalogue entry', submit: 'Confirm match' },
    archive: { title: 'Archive this product', submit: 'Archive product' },
  }[mode];
}

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

export function availabilityLabel(availability: string): string {
  switch (availability) {
    case 'available': return 'Available';
    case 'out_of_stock': return 'Out of stock';
    case 'archived': return 'Archived';
    default: return 'Availability unknown';
  }
}
