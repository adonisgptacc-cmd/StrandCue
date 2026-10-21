import {
  ATTACHMENT_ORDER,
  normalizeAttachments,
  normalizeHeatMethods,
  toolFactsConflicts,
  type ToolAttachment,
  type ToolHeatMethod,
} from '../../../packages/domain/src/index';
import type { ToolDetail } from './tool-api';

/**
 * The editor's working copy of a tool. Every field starts as "not answered": nothing is filled in from a
 * model name, a wattage, a tool type or a heat method, and a temperature exists only when the owner types one.
 */
export type SettingRow = { label: string; value: string; unit: 'C' | 'F' };

export type ToolForm = {
  brand: string;
  model: string;
  toolType: string;
  availability: 'available' | 'out_of_stock';
  wattage: string;
  adjustable: '' | 'yes' | 'no' | 'unknown';
  settingsState: '' | 'unknown' | 'recorded';
  settings: SettingRow[];
  attachmentsState: '' | 'unknown' | 'none' | 'recorded';
  attachmentKinds: string[];
  /** Owner names for "other" attachments, one per line. */
  attachmentOther: string;
  condition: '' | 'good' | 'worn' | 'damaged' | 'unknown';
  heatState: '' | 'unknown' | 'recorded';
  heatMethods: ToolHeatMethod[];
  notes: string;
  reason: string;
};

export const emptyToolForm = (): ToolForm => ({
  brand: '', model: '', toolType: '', availability: 'available', wattage: '', adjustable: '',
  settingsState: '', settings: [], attachmentsState: '', attachmentKinds: [], attachmentOther: '',
  condition: '', heatState: '', heatMethods: [], notes: '', reason: '',
});

/** The form as the stored record holds it, so an edit starts from what is really there. */
export function formFromDetail(detail: ToolDetail | null | undefined): ToolForm {
  const form = emptyToolForm();
  if (!detail) return form;
  form.brand = detail.manualBrand ?? '';
  form.model = detail.manualModel ?? '';
  form.toolType = detail.toolType ?? '';
  form.availability = detail.availability === 'out_of_stock' ? 'out_of_stock' : 'available';
  form.wattage = detail.wattageWatts === null ? '' : String(detail.wattageWatts);
  form.adjustable = detail.adjustableTemp ?? '';
  form.condition = detail.condition ?? '';
  form.notes = detail.notes ?? '';
  if (detail.settings) {
    form.settingsState = detail.settings.state;
    if (detail.settings.state === 'recorded') {
      form.settings = detail.settings.items.map(item => ({
        label: item.label, value: item.temperature ? String(item.temperature.value) : '', unit: item.temperature?.unit ?? 'C',
      }));
    }
  }
  if (detail.attachments) {
    form.attachmentsState = detail.attachments.state;
    if (detail.attachments.state === 'recorded') {
      form.attachmentKinds = [...new Set(detail.attachments.items.map(item => item.kind))];
      form.attachmentOther = detail.attachments.items.flatMap(item => (item.kind === 'other' ? [item.other] : [])).join('\n');
    }
  }
  if (detail.heatMethods) {
    form.heatState = detail.heatMethods.state;
    if (detail.heatMethods.state === 'recorded') form.heatMethods = [...detail.heatMethods.methods];
  }
  return form;
}

const WHOLE = /^\d+$/;
const otherNames = (form: ToolForm): string[] => form.attachmentOther.split('\n').map(line => line.trim()).filter(line => line !== '');

/** The answers the form holds, in the domain's own shape. A key that is not answered is absent. */
export function factsFromForm(form: ToolForm): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const wattage = form.wattage.trim();
  if (WHOLE.test(wattage)) facts.wattageWatts = Number(wattage);
  if (form.adjustable !== '') facts.adjustableTemp = form.adjustable;
  if (form.settingsState === 'unknown') facts.settings = { state: 'unknown' };
  if (form.settingsState === 'recorded') {
    const items = form.settings
      .filter(row => row.label.trim() !== '')
      .map(row => {
        const value = row.value.trim();
        return { label: row.label.trim(), temperature: WHOLE.test(value) ? { value: Number(value), unit: row.unit } : null };
      });
    if (items.length > 0) facts.settings = { state: 'recorded', items };
  }
  if (form.attachmentsState === 'unknown' || form.attachmentsState === 'none') facts.attachments = { state: form.attachmentsState };
  if (form.attachmentsState === 'recorded') {
    const items: ToolAttachment[] = [];
    for (const kind of form.attachmentKinds) {
      if (kind === 'other') for (const other of otherNames(form)) items.push({ kind: 'other', other });
      else items.push({ kind } as ToolAttachment);
    }
    if (items.length > 0) facts.attachments = { state: 'recorded', items: normalizeAttachments(items) };
  }
  if (form.condition !== '') facts.condition = form.condition;
  if (form.heatState === 'unknown') facts.heatMethods = { state: 'unknown' };
  if (form.heatState === 'recorded' && form.heatMethods.length > 0) facts.heatMethods = { state: 'recorded', methods: normalizeHeatMethods(form.heatMethods) };
  if (form.notes.trim() !== '') facts.notes = form.notes.trim();
  return facts;
}

/** Selecting unheated stands alone; selecting a heated method displaces it. Nothing else is chosen for the owner. */
export function toggleHeatMethod(methods: readonly ToolHeatMethod[], method: ToolHeatMethod): ToolHeatMethod[] {
  if (methods.includes(method)) return methods.filter(entry => entry !== method);
  if (method === 'unheated') return ['unheated'];
  return normalizeHeatMethods([...methods.filter(entry => entry !== 'unheated'), method]);
}

/** An attachment is only an attachment: choosing a diffuser selects no heat method. */
export function toggleAttachmentKind(kinds: readonly string[], kind: string): string[] {
  const next = kinds.includes(kind) ? kinds.filter(entry => entry !== kind) : [...kinds, kind];
  return next.sort((a, b) => ATTACHMENT_ORDER.indexOf(a as never) - ATTACHMENT_ORDER.indexOf(b as never));
}

export type ToolFormProblems = Partial<Record<'brand' | 'model' | 'wattage' | 'settings' | 'attachments' | 'heat' | 'notes', string>>;

const range = { C: [30, 300, 'Celsius'], F: [86, 572, 'Fahrenheit'] } as const;

/** What is wrong with the form, in plain words, field by field. Nothing is repaired. */
export function formProblems(form: ToolForm, scope: 'add' | 'edit' = 'edit'): ToolFormProblems {
  const problems: ToolFormProblems = {};
  if (scope === 'add' && form.model.trim() === '') problems.model = 'A tool you add by hand needs a model.';
  if (form.model.trim().length > 200) problems.model = 'The model is at most 200 characters.';
  if (form.brand.trim().length > 200) problems.brand = 'The brand is at most 200 characters.';
  if (form.notes.trim().length > 2000) problems.notes = 'Notes are at most 2000 characters.';
  const wattage = form.wattage.trim();
  if (wattage !== '' && (!WHOLE.test(wattage) || Number(wattage) < 1 || Number(wattage) > 10000)) {
    problems.wattage = 'Power is a whole number of watts, from 1 to 10000.';
  }
  if (form.settingsState === 'recorded') {
    if (form.settings.length === 0) problems.settings = 'Add at least one setting, or choose Not sure or Not answered.';
    else if (form.settings.length > 10) problems.settings = 'Use at most 10 settings.';
    else {
      const labels = form.settings.map(row => row.label.trim());
      for (const row of form.settings) {
        const label = row.label.trim();
        const value = row.value.trim();
        const [min, max, name] = range[row.unit];
        if (label === '') { problems.settings = 'Give each setting a name.'; break; }
        if (label.length > 60) { problems.settings = 'A setting name is at most 60 characters.'; break; }
        if (value !== '' && (!WHOLE.test(value) || Number(value) < min || Number(value) > max)) {
          problems.settings = `The temperature for "${label}" must be a whole number between ${min} and ${max} degrees ${name}.`;
          break;
        }
      }
      if (!problems.settings && new Set(labels).size !== labels.length) problems.settings = 'Each setting is listed once.';
    }
  }
  if (form.attachmentsState === 'recorded' && form.attachmentKinds.length === 0) problems.attachments = 'Choose at least one attachment, or choose None, Not sure or Not answered.';
  if (form.attachmentsState === 'recorded' && form.attachmentKinds.includes('other')) {
    const names = otherNames(form);
    if (names.length === 0) problems.attachments = 'Name the other attachment.';
    else if (names.some(name => name.length > 60)) problems.attachments = 'An attachment name is at most 60 characters.';
  }
  if (form.heatState === 'recorded' && form.heatMethods.length === 0) problems.heat = 'Choose at least one heat method, or choose Not sure or Not answered.';
  const facts = factsFromForm(form) as Parameters<typeof toolFactsConflicts>[0];
  if (toolFactsConflicts(facts).length > 0) problems.heat = 'A tool cannot be both unheated and have a temperature. Change one of those answers.';
  return problems;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The owner facts an edit sends. An untouched answer is left out, an answer the owner took back is an explicit
 * null, a new or changed answer is the value - which may itself be "unknown". A question that was never answered
 * and is still unanswered sends nothing, so the history never claims it was cleared.
 */
export function factsPatch(start: ToolForm, now: ToolForm): Record<string, unknown> {
  const before = factsFromForm(start);
  const after = factsFromForm(now);
  const patch: Record<string, unknown> = {};
  for (const key of ['wattageWatts', 'adjustableTemp', 'settings', 'attachments', 'condition', 'heatMethods', 'notes']) {
    if (same(before[key], after[key])) continue;
    patch[key] = after[key] === undefined ? null : after[key];
  }
  return patch;
}

/** The identity a correction sends: only the part that changed, and null for a part the owner cleared. */
export function identityPatch(start: ToolForm, now: ToolForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const pairs: [string, string, string][] = [['manualBrand', start.brand, now.brand], ['manualModel', start.model, now.model], ['toolType', start.toolType, now.toolType]];
  for (const [key, before, after] of pairs) {
    if (before.trim() === after.trim()) continue;
    patch[key] = after.trim() === '' ? null : after.trim();
  }
  return patch;
}
