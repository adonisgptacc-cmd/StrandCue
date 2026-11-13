import { z } from 'zod';
import { EffectiveDateSchema } from './dates.ts';
import { shelfStateBefore } from './shelf.ts';

// --- Tool capabilities (PRD §17: explicit unknowns, no inference) ---
//
// Wattage and temperature are independent nullables: a known wattage never
// implies a temperature and vice versa. Adjustable-temp and contact/air
// heating are yes/no/unknown — unknown is a valid stored state, not a gap.

export const YesNoUnknownSchema = z.enum(['yes', 'no', 'unknown']);
export type YesNoUnknown = z.output<typeof YesNoUnknownSchema>;

export const ToolTypeSchema = z.enum([
  'dryer', 'heated-air-brush', 'air-styler', 'hood-dryer', 'flat-iron',
  'hot-comb', 'curling-iron', 'steam-straightener', 'heated-rollers',
  'diffuser', 'other',
]);
export type ToolType = z.output<typeof ToolTypeSchema>;

export const ToolCapabilitiesSchema = z.object({
  wattageWatts: z.number().int().nonnegative().nullable(),
  temperatureMaxCelsius: z.number().int().nonnegative().nullable(),
  adjustableTemp: YesNoUnknownSchema,
  contactHeat: YesNoUnknownSchema,
  airHeat: YesNoUnknownSchema,
}).strict();
export type ToolCapabilities = z.output<typeof ToolCapabilitiesSchema>;

export interface CapabilityDescription {
  readonly wattage: string;
  readonly temperature: string;
  readonly adjustableTemp: string;
  readonly contactHeat: string;
  readonly airHeat: string;
}

const yesNoUnknownLabel = (value: YesNoUnknown): string =>
  value === 'unknown' ? 'Unknown' : value === 'yes' ? 'Yes' : 'No';

/** Renders capability facts with explicit Unknown labels — never blank, never guessed. */
export function describeCapabilities(capabilities: ToolCapabilities): CapabilityDescription {
  const parsed = ToolCapabilitiesSchema.parse(capabilities);
  return {
    wattage: parsed.wattageWatts === null ? 'Unknown' : `${parsed.wattageWatts} W`,
    temperature: parsed.temperatureMaxCelsius === null ? 'Unknown' : `${parsed.temperatureMaxCelsius} °C`,
    adjustableTemp: yesNoUnknownLabel(parsed.adjustableTemp),
    contactHeat: yesNoUnknownLabel(parsed.contactHeat),
    airHeat: yesNoUnknownLabel(parsed.airHeat),
  };
}


// --- Owner-recorded tool facts (TL-01..TL-03) -----------------------------------
//
// Everything below is what the OWNER wrote down about the tool they hold. It is
// kept apart from the catalogue capabilities above: nothing here is derived
// from a model name, a wattage, a tool type, an attachment or a heat method,
// and no member can carry a temperature the owner did not state. An answer is
// one of three things - absent (never answered), null (taken back) or a value,
// and a value may itself be an explicit "unknown".

const ownerText = (max: number) => z.string().trim().min(1).max(max);

/** The ways a tool can heat, each on its own. A diffuser is an attachment, never a method. */
export const HEAT_METHOD_ORDER = ['direct-contact', 'heated-air', 'hooded', 'steam', 'unheated'] as const;
export const ToolHeatMethodSchema = z.enum(HEAT_METHOD_ORDER);
export type ToolHeatMethod = z.output<typeof ToolHeatMethodSchema>;

const heatRank = (method: ToolHeatMethod): number => HEAT_METHOD_ORDER.indexOf(method);

/** The canonical list: each method once, in the fixed order. */
export function normalizeHeatMethods(methods: readonly ToolHeatMethod[]): ToolHeatMethod[] {
  return [...new Set(methods)].sort((a, b) => heatRank(a) - heatRank(b));
}

/**
 * How the owner says the tool heats. Unknown is an answer of its own; more
 * than one method is allowed only when the owner records each; an unheated
 * tool cannot also record a heated method (a contradiction is refused, never
 * repaired).
 */
export const ToolHeatMethodsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z.object({
    state: z.literal('recorded'),
    methods: z.array(ToolHeatMethodSchema).min(1).max(HEAT_METHOD_ORDER.length),
  }).strict().superRefine((value, context) => {
    const ascending = value.methods.every((method, index) => index === 0 || heatRank(value.methods[index - 1]) < heatRank(method));
    if (!ascending) context.addIssue({ code: 'custom', path: ['methods'], message: 'List each heat method once, in the fixed order' });
    if (value.methods.includes('unheated') && value.methods.length > 1) {
      context.addIssue({ code: 'custom', path: ['methods'], message: 'An unheated tool cannot also record a heated method' });
    }
  }),
]);
export type ToolHeatMethods = z.output<typeof ToolHeatMethodsSchema>;

/** The attachments the owner can name; anything else is "other" in their own words. */
export const ATTACHMENT_ORDER = ['diffuser', 'concentrator', 'comb', 'brush', 'other'] as const;
const KnownAttachmentSchema = z.object({ kind: z.enum(['diffuser', 'concentrator', 'comb', 'brush']) }).strict();
const OtherAttachmentSchema = z.object({ kind: z.literal('other'), other: ownerText(60) }).strict();
export const ToolAttachmentSchema = z.discriminatedUnion('kind', [KnownAttachmentSchema, OtherAttachmentSchema]);
export type ToolAttachment = z.output<typeof ToolAttachmentSchema>;

const attachmentKey = (item: ToolAttachment): string =>
  `${ATTACHMENT_ORDER.indexOf(item.kind)}|${item.kind === 'other' ? item.other : ''}`;
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The canonical list: trimmed, each attachment once, in the fixed order then by wording. */
export function normalizeAttachments(items: readonly ToolAttachment[]): ToolAttachment[] {
  const unique = new Map<string, ToolAttachment>();
  for (const item of items) {
    const clean: ToolAttachment = item.kind === 'other' ? { kind: 'other', other: item.other.trim() } : item;
    unique.set(attachmentKey(clean), clean);
  }
  return [...unique.entries()].sort(([a], [b]) => byCodeUnit(a, b)).map(([, item]) => item);
}

/**
 * The owner's attachments. None, unknown and a list are three answers. An
 * attachment is a thing that clips on: it carries no capability, and a
 * diffuser is not a heat source.
 */
export const ToolAttachmentsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('recorded'), items: z.array(ToolAttachmentSchema).min(1).max(10) }).strict()
    .superRefine((value, context) => {
      const keys = value.items.map(attachmentKey);
      if (!keys.every((key, index) => index === 0 || keys[index - 1] < key)) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'List each attachment once, in the fixed order' });
      }
    }),
]);
export type ToolAttachments = z.output<typeof ToolAttachmentsSchema>;

/** A temperature exactly as the owner read it, in the unit they read it in. Nothing is converted. */
export const ToolSettingTemperatureSchema = z.object({
  value: z.number().int(),
  unit: z.enum(['C', 'F']),
}).strict().superRefine((temperature, context) => {
  const [min, max] = temperature.unit === 'C' ? [30, 300] : [86, 572];
  if (temperature.value < min || temperature.value > max) {
    context.addIssue({ code: 'custom', path: ['value'], message: `A temperature in ${temperature.unit} is between ${min} and ${max}` });
  }
});

/** One setting, in the owner's words. A label such as "High" is never a temperature. */
export const ToolSettingSchema = z.object({
  label: ownerText(60),
  temperature: ToolSettingTemperatureSchema.nullable(),
}).strict();
export type ToolSetting = z.output<typeof ToolSettingSchema>;

export const ToolSettingsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unknown') }).strict(),
  z.object({ state: z.literal('recorded'), items: z.array(ToolSettingSchema).min(1).max(10) }).strict()
    .superRefine((value, context) => {
      const labels = value.items.map(item => item.label);
      if (new Set(labels).size !== labels.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Each setting is listed once' });
    }),
]);
export type ToolSettings = z.output<typeof ToolSettingsSchema>;

/** The temperatures the owner actually recorded, with their own unit. Nothing is inferred. */
export function knownSettingTemperatures(facts: { settings?: ToolSettings | null }): { label: string; value: number; unit: 'C' | 'F' }[] {
  const settings = facts.settings;
  if (!settings || settings.state !== 'recorded') return [];
  return settings.items.flatMap(item => (item.temperature ? [{ label: item.label, value: item.temperature.value, unit: item.temperature.unit }] : []));
}

/** What the owner observed about the tool's condition. It is an observation, never a verdict about safety. */
export const ToolConditionSchema = z.enum(['good', 'worn', 'damaged', 'unknown']);
export type ToolCondition = z.output<typeof ToolConditionSchema>;

const toolNotesSchema = z.string().trim().min(1).max(2000).nullable().optional();
const wattageSchema = z.number().int().min(1).max(10000).nullable().optional();

export type ToolFactsConflict = 'unheated-adjustable-temperature' | 'unheated-setting-temperature';

/** The conflicts an owner record can hold: a tool recorded as unheated cannot also state a temperature. */
export function toolFactsConflicts(facts: {
  heatMethods?: ToolHeatMethods | null;
  adjustableTemp?: YesNoUnknown | null;
  settings?: ToolSettings | null;
}): ToolFactsConflict[] {
  const unheated = facts.heatMethods?.state === 'recorded' && facts.heatMethods.methods.includes('unheated');
  if (!unheated) return [];
  const conflicts: ToolFactsConflict[] = [];
  if (facts.adjustableTemp === 'yes') conflicts.push('unheated-adjustable-temperature');
  if (knownSettingTemperatures({ settings: facts.settings ?? null }).length > 0) conflicts.push('unheated-setting-temperature');
  return conflicts;
}

const OwnerFactShape = {
  wattageWatts: wattageSchema,
  adjustableTemp: YesNoUnknownSchema.nullable().optional(),
  settings: ToolSettingsSchema.nullable().optional(),
  attachments: ToolAttachmentsSchema.nullable().optional(),
  condition: ToolConditionSchema.nullable().optional(),
  heatMethods: ToolHeatMethodsSchema.nullable().optional(),
  notes: toolNotesSchema,
};

// --- User-tool ownership commands (no owner fields; owner derives from auth) -----

export const ToolAvailabilitySchema = z.enum(['available', 'out_of_stock', 'archived']);

const manualBrandSchema = z.string().trim().min(1).max(200).nullable();
const manualModelSchema = z.string().trim().min(1).max(200).nullable();

export const CreateUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  // The date the change takes effect belongs to the command, so a retried command is the same command.
  effectiveDate: EffectiveDateSchema,
  // A catalogue link is a confirmed match, never a side effect of recording a tool.
  versionId: z.literal(null, { error: 'A catalogue link belongs to the confirmed match command' }),
  manualBrand: manualBrandSchema,
  manualModel: manualModelSchema,
  toolType: ToolTypeSchema.nullable(),
  availability: ToolAvailabilitySchema,
  ...OwnerFactShape,
}).strict().superRefine((command, context) => {
  if (command.manualModel === null) context.addIssue({ code: 'custom', message: 'Manual entries require a tool model' });
  if (toolFactsConflicts(command).length > 0) {
    context.addIssue({ code: 'custom', message: 'An unheated tool cannot also record a temperature' });
  }
});

export const ChangeUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  effectiveDate: EffectiveDateSchema,
  availability: ToolAvailabilitySchema.optional(),
  ...OwnerFactShape,
  // The owner's identity is never rewritten here: a wrong brand, model or type is corrected through
  // the append-only correction path, so the original entry stays readable.
}).strict();

export const MatchUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  versionId: z.string().uuid(),
  // Matching requires explicit confirmation; it never happens silently.
  confirmed: z.literal(true),
}).strict();

export const ArchiveUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}).strict();

/** The wording of a refused identity correction, shared by the editor, the domain and the server. */
export const TOOL_CORRECTION_IDENTITY_RULE = 'A correction has to change the brand, the model or the tool type.';

/**
 * The append-only correction: the only way a wrong owner-entered identity is replaced. It points at the
 * entry it replaces, so the earlier wording stays readable. A key that is absent is preserved, an
 * explicit null clears it and a value replaces it.
 */
export const CorrectUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  correctsId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  effectiveDate: EffectiveDateSchema,
  manualBrand: manualBrandSchema.optional(),
  manualModel: manualModelSchema.optional(),
  toolType: ToolTypeSchema.nullable().optional(),
  ...OwnerFactShape,
}).strict().superRefine((command, context) => {
  if (command.manualBrand === undefined && command.manualModel === undefined && command.toolType === undefined) {
    context.addIssue({ code: 'custom', message: TOOL_CORRECTION_IDENTITY_RULE });
  }
});

// --- Identity and history (the same lineage rules the Shelf follows) ---------------

export const ToolIdentityFields = ['manualBrand', 'manualModel', 'toolType'] as const;
export type ToolIdentityField = (typeof ToolIdentityFields)[number];
export type ToolIdentity = Partial<Record<ToolIdentityField, string | null>>;

const words = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Whether a correction materially changes the identity of a record: re-typing the same words, or
 * changing only a related fact, corrects nothing. Words are trimmed, the case is never folded, and an
 * explicit null over a value that was never recorded changes nothing.
 */
export function toolCorrectionChangesIdentity(
  current: ToolIdentity | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): boolean {
  const before = current ?? {};
  const facts = patch ?? {};
  return ToolIdentityFields.some(field => {
    const lands = Object.prototype.hasOwnProperty.call(facts, field) ? words(facts[field]) : words(before[field]);
    return lands !== words(before[field]);
  });
}

export type ToolRevisionKind = 'baseline' | 'change' | 'correction' | 'match' | 'archive';
export type ToolRevision = {
  id: string;
  kind: ToolRevisionKind;
  correctsId: string | null;
  patch?: Record<string, unknown> | null;
};

/** Whether a revision carries the tool's identity: a match, an archive and an ordinary change never do. */
export function toolRevisionCarriesIdentity(revision: ToolRevision): boolean {
  if (revision.kind === 'match' || revision.kind === 'archive' || revision.kind === 'change') return false;
  const patch = revision.patch;
  if (!patch) return false;
  if (!ToolIdentityFields.some(field => Object.prototype.hasOwnProperty.call(patch, field))) return false;
  if (revision.kind === 'correction') return true;
  return ToolIdentityFields.some(field => words(patch[field]) !== '');
}

/** The revision a correction may replace: the last link of the chain that carries the identity. */
export function toolCorrectionTargetRevision<T extends ToolRevision>(revisions: readonly T[] | null | undefined): T | null {
  if (!revisions || revisions.length === 0) return null;
  const corrected = new Set(revisions.map(revision => revision.correctsId).filter((value): value is string => typeof value === 'string' && value !== ''));
  const candidates = revisions.filter(revision => !corrected.has(revision.id) && toolRevisionCarriesIdentity(revision));
  return candidates.length === 0 ? null : candidates[candidates.length - 1];
}

/**
 * The state of a record immediately before a correction, replayed from the whole ordered history.
 * It fails closed: an unknown entry, a duplicate, a cycle or a forward reference answers null.
 */
export function toolStateBefore(
  revisions: readonly ToolRevision[] | null | undefined,
  targetId: string | null | undefined,
): Record<string, unknown> | null {
  return shelfStateBefore(revisions, targetId);
}

export type CreateUserToolCommand = z.output<typeof CreateUserToolCommandSchema>;
export type ChangeUserToolCommand = z.output<typeof ChangeUserToolCommandSchema>;
export type CorrectUserToolCommand = z.output<typeof CorrectUserToolCommandSchema>;
export type MatchUserToolCommand = z.output<typeof MatchUserToolCommandSchema>;
export type ArchiveUserToolCommand = z.output<typeof ArchiveUserToolCommandSchema>;
