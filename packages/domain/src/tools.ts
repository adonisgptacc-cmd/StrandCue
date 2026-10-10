import { z } from 'zod';

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

// --- User-tool ownership commands (no owner fields; owner derives from auth) ---

export const CreateUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  versionId: z.string().uuid().nullable(),
  manualBrand: z.string().trim().max(200).nullable(),
  manualModel: z.string().trim().max(200).nullable(),
  toolType: ToolTypeSchema.nullable(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  notes: z.string().max(2000).nullable(),
}).strict().superRefine((command, context) => {
  // Manual entries stand alone; catalogue links may omit manual fields —
  // but an entry with neither is not a tool.
  if (command.versionId === null && (command.manualModel === null || command.manualModel.trim() === '')) {
    context.addIssue({ code: 'custom', message: 'Manual entries require a tool model' });
  }
});

export const ChangeUserToolCommandSchema = z.object({
  operationId: z.string().uuid(),
  userToolId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  availability: z.enum(['available', 'out_of_stock', 'archived']).optional(),
  notes: z.string().max(2000).nullable(),
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

export type CreateUserToolCommand = z.output<typeof CreateUserToolCommandSchema>;
export type ChangeUserToolCommand = z.output<typeof ChangeUserToolCommandSchema>;
export type MatchUserToolCommand = z.output<typeof MatchUserToolCommandSchema>;
export type ArchiveUserToolCommand = z.output<typeof ArchiveUserToolCommandSchema>;
