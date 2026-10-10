import { describeCapabilities, type ToolCapabilities } from '../../../packages/domain/src/index';

export type ToolEditorMode = 'add' | 'match' | 'archive';

export function toolEditorCopy(mode: ToolEditorMode) {
  return {
    add: { title: 'Add a tool', submit: 'Save tool' },
    match: { title: 'Match to catalogue entry', submit: 'Confirm match' },
    archive: { title: 'Archive this tool', submit: 'Archive tool' },
  }[mode];
}

export function toolView(loading: boolean, items: readonly unknown[], detail: unknown) {
  return detail ? 'detail' : items.length ? 'list' : loading ? 'loading' : 'empty';
}

export function appendToolPage<T extends { id: string }>(previous: readonly T[], page: readonly T[]): T[] {
  return [...previous, ...page.filter(item => !previous.some(existing => existing.id === item.id))];
}

// Capability facts render through the domain describer so wattage and
// temperature unknowns stay explicit and are never inferred or left blank.
export function capabilitySummary(capabilities: ToolCapabilities) {
  return describeCapabilities(capabilities);
}

export function availabilityLabel(availability: string): string {
  switch (availability) {
    case 'available': return 'Available';
    case 'out_of_stock': return 'Out of stock';
    case 'archived': return 'Archived';
    default: return 'Availability unknown';
  }
}
