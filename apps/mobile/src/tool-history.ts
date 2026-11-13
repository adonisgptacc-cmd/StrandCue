export type ToolEditorMode = 'add' | 'edit' | 'correct' | 'match' | 'archive';

/** The modes the form editor handles. A match has its own search-and-compare screen. */
export type ToolFormMode = Exclude<ToolEditorMode, 'match'>;

export function toolEditorCopy(mode: ToolEditorMode) {
  return {
    add: { title: 'Add a tool', submit: 'Save tool' },
    edit: { title: 'Edit this tool', submit: 'Save changes' },
    correct: { title: 'Correct this tool', submit: 'Save correction' },
    match: { title: 'Match to catalogue', submit: 'Confirm match' },
    archive: { title: 'Archive this tool', submit: 'Archive tool' },
  }[mode];
}

export function toolView(loading: boolean, items: readonly unknown[], detail: unknown) {
  return detail ? 'detail' : items.length ? 'list' : loading ? 'loading' : 'empty';
}

export function appendToolPage<T extends { id: string }>(previous: readonly T[], page: readonly T[]): T[] {
  return [...previous, ...page.filter(item => !previous.some(existing => existing.id === item.id))];
}
