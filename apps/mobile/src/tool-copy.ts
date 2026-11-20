import {
  HEAT_METHOD_ORDER,
  knownSettingTemperatures,
  ToolAttachmentsSchema,
  ToolConditionSchema,
  ToolHeatMethodsSchema,
  ToolSettingsSchema,
  ToolTypeSchema,
  YesNoUnknownSchema,
  type ToolAttachments,
  type ToolCatalogueCandidate,
  type ToolComparisonRow,
  type ToolDetail,
  type ToolHeatMethod,
  type ToolHeatMethods,
  type ToolSettings,
} from '../../../packages/domain/src/index';

/** Every answer has its own words: an unanswered question, an explicit "not sure" and a taken-back answer never read alike. */
export const notAnswered = 'Not answered';
export const notSure = 'Not sure';
const notRecordedByCatalogue = 'Not recorded in the catalogue';

const toolTypeLabels: Record<string, string> = {
  'dryer': 'Hair dryer', 'heated-air-brush': 'Heated air brush', 'air-styler': 'Air styler', 'hood-dryer': 'Hood dryer',
  'flat-iron': 'Flat iron', 'hot-comb': 'Hot comb', 'curling-iron': 'Curling iron', 'steam-straightener': 'Steam straightener',
  'heated-rollers': 'Heated rollers', 'diffuser': 'Diffuser', 'other': 'Other',
};
export const toolTypeChoices = Object.keys(toolTypeLabels);
export const toolTypeOptions: Readonly<Record<string, string>> = toolTypeLabels;

export function toolTypeLabel(type: string | null | undefined): string {
  if (type === null || type === undefined) return notAnswered;
  return toolTypeLabels[type] ?? type;
}

/** The availability states the owner can record; the words never frame a tool as wasted or faulty. */
export function toolAvailabilityLabel(availability: string): string {
  switch (availability) {
    case 'available': return 'Available';
    case 'out_of_stock': return 'Not available right now';
    case 'archived': return 'Archived';
    default: return 'Availability unknown';
  }
}

const conditionLabels: Record<string, string> = {
  good: 'No problems noticed', worn: 'Some wear', damaged: 'Damaged or faulty, as you recorded it', unknown: notSure,
};
export const conditionOptions: Readonly<Record<string, string>> = conditionLabels;
export const conditionChoices = ['good', 'worn', 'damaged', 'unknown'];

export function conditionLabel(condition: string | null | undefined): string {
  if (condition === null || condition === undefined) return notAnswered;
  return conditionLabels[condition] ?? condition;
}

const heatLabels: Record<ToolHeatMethod, string> = {
  'direct-contact': 'Direct-contact heat', 'heated-air': 'Heated air', hooded: 'Hooded heat', steam: 'Steam', unheated: 'Unheated',
};
export const heatMethodOptions: Readonly<Record<string, string>> = heatLabels;
export const heatMethodChoices: readonly ToolHeatMethod[] = HEAT_METHOD_ORDER;

export const heatMethodLabel = (method: ToolHeatMethod): string => heatLabels[method];

const attachmentLabels: Record<string, string> = { diffuser: 'Diffuser', concentrator: 'Concentrator nozzle', comb: 'Comb attachment', brush: 'Brush attachment', other: 'Other' };
export const attachmentOptions: Readonly<Record<string, string>> = attachmentLabels;

export function heatMethodsLine(heat: ToolHeatMethods | null | undefined): string {
  if (heat === null || heat === undefined) return `How it heats: ${notAnswered}`;
  if (heat.state === 'unknown') return `How it heats: ${notSure}`;
  return `How it heats: ${heat.methods.map(heatMethodLabel).join('; ')}`;
}

/** Attachments clip on. They are listed as things the owner has, never as a way the tool heats. */
export function attachmentsLine(attachments: ToolAttachments | null | undefined): string {
  if (attachments === null || attachments === undefined) return `Attachments: ${notAnswered}`;
  if (attachments.state === 'unknown') return `Attachments: ${notSure}`;
  if (attachments.state === 'none') return 'Attachments: None';
  const names = attachments.items.map(item => (item.kind === 'other' ? item.other : attachmentLabels[item.kind]));
  return `Attachments: ${names.join('; ')}`;
}

const unitWords = { C: 'degrees Celsius', F: 'degrees Fahrenheit' } as const;

/** One setting per line, in the owner's words; a temperature is said with its own unit, and only when the owner gave one. */
export function settingsLines(settings: ToolSettings | null | undefined): string[] {
  if (settings === null || settings === undefined) return [`Settings: ${notAnswered}`];
  if (settings.state === 'unknown') return [`Settings: ${notSure}`];
  return settings.items.map(item => (item.temperature
    ? `Setting: ${item.label}, ${item.temperature.value} ${unitWords[item.temperature.unit]}`
    : `Setting: ${item.label}`));
}

/** Temperature is only ever what the owner recorded; a wattage or a label never produces one. */
export function temperatureLine(settings: ToolSettings | null | undefined): string {
  const known = knownSettingTemperatures({ settings: settings ?? null });
  if (known.length === 0) return 'Temperature: Not recorded';
  return `Temperatures you recorded: ${known.map(entry => `${entry.label} ${entry.value} ${unitWords[entry.unit]}`).join('; ')}`;
}

export function wattageLine(watts: number | null | undefined): string {
  return watts === null || watts === undefined ? `Power: ${notAnswered}` : `Power: ${watts} watts`;
}

export function adjustableTempLine(value: string | null | undefined): string {
  if (value === null || value === undefined) return `Adjustable temperature: ${notAnswered}`;
  return `Adjustable temperature: ${value === 'yes' ? 'Yes' : value === 'no' ? 'No' : notSure}`;
}

/** The owner's own facts about the tool, one plain line each. */
export type OwnerToolFacts = {
  availability: string;
  matched: boolean;
  matchConfirmed: boolean;
  manualBrand: string | null;
  manualModel: string | null;
  toolType: string | null;
  wattageWatts: number | null;
  adjustableTemp: string | null;
  settings: ToolSettings | null;
  attachments: ToolAttachments | null;
  condition: string | null;
  heatMethods: ToolHeatMethods | null;
  notes: string | null;
};

export function ownerToolLines(tool: OwnerToolFacts): string[] {
  return [
    `Brand: ${tool.manualBrand ?? notAnswered}`,
    `Model: ${tool.manualModel ?? notAnswered}`,
    `Type: ${toolTypeLabel(tool.toolType)}`,
    `Status: ${toolAvailabilityLabel(tool.availability)}`,
    wattageLine(tool.wattageWatts),
    adjustableTempLine(tool.adjustableTemp),
    ...settingsLines(tool.settings),
    temperatureLine(tool.settings),
    heatMethodsLine(tool.heatMethods),
    attachmentsLine(tool.attachments),
    `Condition: ${conditionLabel(tool.condition)}`,
    `Your notes: ${tool.notes ?? notAnswered}`,
  ];
}

/** What a tool is called: the words the owner gave, or an honest statement that they gave none. */
export function toolDisplayName(tool: { manualBrand: string | null; manualModel: string | null }): string {
  const parts = [tool.manualBrand, tool.manualModel].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length === 0 ? 'Tool with no name recorded' : parts.join(' ');
}

/** The short card on the list. */
export function toolCardLines(item: {
  manualBrand: string | null; toolType: string | null; condition: string | null; heatMethods: ToolHeatMethods | null; matched: boolean;
  availability?: string; catalogueLifecycle?: 'active' | 'retired' | null;
}): string[] {
  const lines = [`Type: ${toolTypeLabel(item.toolType)}`];
  if (item.manualBrand) lines.unshift(`Brand: ${item.manualBrand}`);
  if (item.availability !== undefined) lines.push(`Status: ${toolAvailabilityLabel(item.availability)}`);
  if (item.condition !== null) lines.push(`Condition: ${conditionLabel(item.condition)}`);
  if (item.heatMethods !== null) lines.push(heatMethodsLine(item.heatMethods));
  if (!item.matched) lines.push('Manual entry, not linked to the catalogue.');
  else lines.push(item.catalogueLifecycle === 'retired' ? 'Linked to a retired catalogue version.' : 'Linked to a catalogue version.');
  return lines;
}

// --- History -------------------------------------------------------------------------

const auditRemoved = 'Removed saved answer';
const auditNotAnswered = 'Not answered in this entry';
const auditKept = 'Kept as it was';

const factNames: [string, string][] = [
  ['manualBrand', 'Brand'], ['manualModel', 'Model'], ['toolType', 'Type'], ['availability', 'Status'], ['wattageWatts', 'Power'],
  ['adjustableTemp', 'Adjustable temperature'], ['settings', 'Settings'], ['attachments', 'Attachments'], ['condition', 'Condition'],
  ['heatMethods', 'How it heats'], ['notes', 'Your notes'],
];

function auditValue(key: string, value: unknown): string {
  switch (key) {
    case 'toolType': return toolTypeLabel(String(value));
    case 'availability': return toolAvailabilityLabel(String(value));
    case 'wattageWatts': return `${value} watts`;
    case 'adjustableTemp': return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : notSure;
    case 'condition': return conditionLabel(String(value));
    case 'settings': return settingsLines(value as ToolSettings).map(line => line.replace(/^Settings?: /, '')).join('; ');
    case 'attachments': return attachmentsLine(value as ToolAttachments).replace('Attachments: ', '');
    case 'heatMethods': return heatMethodsLine(value as ToolHeatMethods).replace('How it heats: ', '');
    default: return String(value);
  }
}

/**
 * What one history entry recorded, answer by answer. A key the entry never carried is not listed; a value is
 * read as recorded; an explicit null reads "Removed saved answer" when an earlier answer existed and "Not
 * answered in this entry" when none did, so the two opposite meanings are never announced with the same words.
 */
export function toolRevisionLines(patch: Record<string, unknown> | undefined, before: Record<string, unknown> | null | undefined, kind?: string): string[] {
  if (!patch) return [];
  const lines: string[] = [];
  const held = (key: string): boolean => !!before && before[key] !== undefined && before[key] !== null;
  for (const [key, label] of factNames) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      // A correction says what it left alone: the answer the record held, or the question never answered. It never answers the status.
      if (kind === 'correction' && key !== 'availability') lines.push(`${label}: ${held(key) ? auditKept : notAnswered}`);
      continue;
    }
    const value = patch[key];
    if (value === null) lines.push(`${label}: ${held(key) ? auditRemoved : auditNotAnswered}`);
    else lines.push(`${label}: ${auditValue(key, value)}`);
  }
  return lines;
}

const readableValues: Record<string, (value: unknown) => boolean> = {
  manualBrand: value => value === null || typeof value === 'string',
  manualModel: value => value === null || typeof value === 'string',
  notes: value => value === null || typeof value === 'string',
  toolType: value => value === null || ToolTypeSchema.safeParse(value).success,
  availability: value => value === null || typeof value === 'string',
  wattageWatts: value => value === null || (Number.isInteger(value) && (value as number) > 0),
  adjustableTemp: value => value === null || YesNoUnknownSchema.safeParse(value).success,
  settings: value => value === null || ToolSettingsSchema.safeParse(value).success,
  attachments: value => value === null || ToolAttachmentsSchema.safeParse(value).success,
  condition: value => value === null || ToolConditionSchema.safeParse(value).success,
  heatMethods: value => value === null || ToolHeatMethodsSchema.safeParse(value).success,
};

/** Whether every answer a history entry carries is in the shape the record can hold. An entry that is not is never shown. */
export function toolPatchReadable(patch: Record<string, unknown> | undefined): boolean {
  if (!patch) return true;
  return Object.entries(patch).every(([key, value]) => (readableValues[key] ? readableValues[key](value) : true));
}

export const toolUnreadableHistoryLabel = 'The earlier entry could not be read, so what it recorded is not shown.';

export function toolRevisionKindLabel(kind: string): string {
  if (kind === 'baseline') return 'Original entry';
  if (kind === 'match') return 'Catalogue match';
  if (kind === 'archive') return 'Archive';
  if (kind === 'correction') return 'Correction';
  return 'Change';
}

/** The identity the original entry recorded, in words, so a correction can say what it replaces. */
export function recordedToolIdentityWording(patch: Record<string, unknown> | undefined): string {
  const parts = [patch?.manualBrand, patch?.manualModel, typeof patch?.toolType === 'string' ? toolTypeLabel(patch.toolType) : null]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length === 0 ? 'no identity' : parts.join(', ');
}

// --- Catalogue: candidates, comparison, capabilities --------------------------------------

export function toolCandidateLines(candidate: Pick<ToolCatalogueCandidate, 'brand' | 'toolName' | 'versionLabel' | 'toolType' | 'market' | 'versionId'>): string[] {
  return [
    `Brand: ${candidate.brand}`,
    `Tool: ${candidate.toolName}`,
    `Version: ${candidate.versionLabel}`,
    `Type: ${toolTypeLabel(candidate.toolType)}`,
    `Market: ${candidate.market === 'ZA' ? 'South Africa' : notRecordedByCatalogue}`,
  ];
}

export function toolLifecycleLine(candidate: Pick<ToolCatalogueCandidate, 'lifecycle'>): string {
  return candidate.lifecycle === 'active' ? 'Catalogue status: current version' : 'Catalogue status: retired version';
}

const comparisonNames: Record<ToolComparisonRow['field'], string> = { brand: 'Brand', model: 'Model', toolType: 'Type' };

/** One comparison row in words. An unknown is never worded as a difference. */
export function toolComparisonLine(row: ToolComparisonRow): string {
  const name = comparisonNames[row.field];
  const show = (value: string | null): string => (row.field === 'toolType' && value !== null ? toolTypeLabel(value) : value ?? '');
  if (row.status === 'same') return `${name}: the same wording in both.`;
  if (row.status === 'different') return `${name}: different. You recorded "${show(row.manual)}"; the catalogue lists "${show(row.catalogue)}".`;
  return `${name}: you did not record one; the catalogue lists "${show(row.catalogue)}", so it cannot be compared.`;
}

const yesNo = (value: string): string => (value === 'yes' ? 'Yes' : value === 'no' ? 'No' : notRecordedByCatalogue);

/** What a published catalogue record states. A fact it does not state says so, and a wattage is never a temperature. */
export function catalogueCapabilityLines(content: {
  wattageWatts: number | null; temperatureMaxCelsius: number | null; adjustableTemp: string; contactHeat: string; airHeat: string;
}): string[] {
  return [
    `Power: ${content.wattageWatts === null ? notRecordedByCatalogue : `${content.wattageWatts} watts`}`,
    `Highest temperature: ${content.temperatureMaxCelsius === null ? notRecordedByCatalogue : `${content.temperatureMaxCelsius} degrees Celsius`}`,
    `Adjustable temperature: ${yesNo(content.adjustableTemp)}`,
    `Direct-contact heat: ${yesNo(content.contactHeat)}`,
    `Heated air: ${yesNo(content.airHeat)}`,
  ];
}

/** The version's state. A successor is a pointer only: it never replaces the version the owner linked. */
export function toolVersionLifecycleLines(lifecycle: ToolDetail['lifecycle']): string[] {
  if (lifecycle.state === 'active') return ['Version status: current catalogue version.'];
  const status = 'Version status: retired version. This is an older version, not the current one.';
  const { successor } = lifecycle;
  switch (successor.state) {
    case 'none': return [status, 'No newer version is recorded.'];
    case 'not_published': return [status, 'A newer version is recorded, but the link has not been published, so it is not shown.'];
    case 'under_review': return [status, 'A newer version is recorded, and the link is under review, so it is not shown yet.'];
    case 'published': {
      const { brand, toolName, versionLabel } = successor.version;
      return [status, `A reviewed newer version is listed: ${brand}: ${toolName} (${versionLabel}). Your tool stays linked to this version.`];
    }
  }
}

export type ToolUnpublishedState = 'not_published' | 'under_review' | 'withdrawn';

const capabilityNotices: Record<ToolUnpublishedState, string> = {
  not_published: 'No capabilities are published for this exact version. Nothing is assumed.',
  under_review: 'Capabilities for this version are under review and are not shown yet.',
  withdrawn: 'Capabilities were published and later withdrawn. They are not shown.',
};

/** What an unpublished capability section says: a fact the catalogue does not state is never filled in. */
export const toolCapabilityNotice = (state: ToolUnpublishedState): string => capabilityNotices[state];

/** The owner's history as plain entries, oldest first. */
export const toolOwnerHistoryLines = (revisions: readonly { kind: string }[]): string[] =>
  revisions.map((revision, index) => `Entry ${index + 1}: ${toolRevisionKindLabel(revision.kind)}`);

// --- Failures --------------------------------------------------------------------------

const errorText = (error: unknown): string => String((error as { message?: unknown } | null)?.message ?? '');

const saveRefusals: [string, string][] = [
  ['invalid-heat-combination', 'A tool cannot be both unheated and have a temperature. Change one of those answers.'],
  ['invalid-correction-noop', 'The correction has to change the brand, the model or the tool type. These words are the same as before.'],
  ['invalid-correction-target', 'That entry cannot be corrected. Open the tool and try again.'],
  ['already-corrected', 'That entry was already corrected. Open the tool to see the latest wording.'],
  ['invalid-correction', 'A correction has to change the brand, the model or the tool type, and say why.'],
  ['invalid-identity', 'The brand, model and type are changed with a correction, not with an edit.'],
  ['invalid-tool', 'A tool you add by hand needs a model.'],
  ['invalid-wattage', 'Power is a whole number of watts, from 1 to 10000.'],
  ['invalid-settings', 'Check the settings: each needs its own name, and a temperature needs a number and a unit.'],
  ['invalid-attachments', 'Check the attachments: each is listed once and other needs a name.'],
  ['invalid-heat-methods', 'Check how the tool heats: each method is listed once, and unheated stands alone.'],
  ['invalid-condition', 'Choose one of the condition answers.'],
  ['invalid-notes', 'Notes are too long. Use at most 2000 characters.'],
];

export type ToolSaveFailure = { kind: 'conflict' | 'refused' | 'retry'; message: string };

/**
 * A failed save, in plain words. A stale entry is never retried blind, a refusal names the rule it broke, and
 * anything else keeps the same saved command for a safe retry. Server and network text is never repeated.
 */
export function toolSaveFailure(error: unknown): ToolSaveFailure {
  const text = errorText(error);
  if (text.includes('revision-conflict')) {
    return { kind: 'conflict', message: 'This tool changed elsewhere, so nothing was saved. Show the latest entry and make your change again.' };
  }
  // A signed-out save is not wrong, only unsent: the command stays on the device for the same save after signing in.
  if (text.includes('authentication-required')) return { kind: 'retry', message: 'Sign in again to save this tool. Nothing was saved yet, and your change is kept on this device.' };
  if (text.includes('Draft limit reached')) return { kind: 'refused', message: 'Too many unsent saves are kept on this device. Review or delete one of them, then try again. Nothing was saved.' };
  if (text.includes('account-not-active')) return { kind: 'refused', message: 'This account cannot save changes right now. Nothing was saved.' };
  for (const [code, message] of saveRefusals) if (text.includes(code)) return { kind: 'refused', message };
  if (text.includes('operation-conflict') || text.includes('not-found') || text.includes('invalid-')) {
    return { kind: 'refused', message: 'The change was not accepted. Nothing was saved. Check the details and try again.' };
  }
  return { kind: 'retry', message: 'The tool could not be saved. Nothing was saved yet. You can retry the same save; it will not be recorded twice.' };
}

/** A failed match about a tool. A stale tool is never retried blind, a refusal is final for this choice, anything else keeps the command. */
export function toolMatchFailure(error: unknown): ToolSaveFailure {
  const text = errorText(error);
  if (text.includes('revision-conflict')) {
    return { kind: 'conflict', message: 'This tool changed elsewhere, so the match was not saved. Show the latest entry and choose again if you still want to match it.' };
  }
  if (text.includes('authentication-required')) return { kind: 'retry', message: 'Sign in again to match this tool. Nothing was linked yet, and your confirmed match is kept on this device.' };
  if (text.includes('version-not-found')) return { kind: 'refused', message: 'That catalogue version is no longer available. Nothing was linked. Go back and search again.' };
  if (text.includes('Draft limit reached')) return { kind: 'refused', message: 'Too many unsent saves are kept on this device. Review or delete one of them, then try again. Nothing was linked.' };
  if (text.includes('operation-conflict') || text.includes('confirmation-required') || text.includes('not-found') || text.includes('invalid-') || text.includes('account-not-active')) {
    return { kind: 'refused', message: 'The match was not accepted. Nothing was linked. Go back and choose again.' };
  }
  return { kind: 'retry', message: 'The match could not be saved. Nothing was linked yet. You can retry the same confirmation; it will not be recorded twice.' };
}

export function toolDetailFailure(error: unknown): { kind: 'not_found' | 'auth' | 'retry'; message: string } {
  const text = errorText(error);
  if (text.includes('not-found')) return { kind: 'not_found', message: 'These tool details are no longer available. Go back and choose again.' };
  if (text.includes('authentication-required')) return { kind: 'auth', message: 'Sign in again to see tool details. Nothing was changed.' };
  return { kind: 'retry', message: 'The tool details could not be loaded. Nothing was changed. Try again.' };
}
