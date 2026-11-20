import { z } from 'zod';

export const ReleaseStageSchema = z.enum([
  'technical_alpha',
  'guided_founder_alpha',
  'closed_beta',
  'public_release',
]);

export type ReleaseStage = z.infer<typeof ReleaseStageSchema>;

export interface ReleaseStageDescriptor {
  readonly id: ReleaseStage;
  readonly label: string;
  readonly description: string;
}

export const CURRENT_RELEASE_STAGE: ReleaseStage = 'technical_alpha';

const DESCRIPTORS: Record<ReleaseStage, ReleaseStageDescriptor> = {
  technical_alpha: {
    id: 'technical_alpha',
    label: 'TECHNICAL ALPHA',
    description:
      'Records and privacy controls are being tested. Personalized guidance is not available yet.',
  },
  guided_founder_alpha: {
    id: 'guided_founder_alpha',
    label: 'GUIDED FOUNDER ALPHA',
    description:
      'A first reviewed guidance slice is being tested. Coverage is narrow and every plan shows its evidence.',
  },
  closed_beta: {
    id: 'closed_beta',
    label: 'CLOSED BETA',
    description:
      'Guidance, execution and learning are being tested with invited users before any public release.',
  },
  public_release: {
    id: 'public_release',
    label: 'STRANDCUE',
    description:
      'Personalized cosmetic hair-care guidance with reviewed rules and evidence.',
  },
};

export function describeReleaseStage(stage: ReleaseStage): ReleaseStageDescriptor {
  return DESCRIPTORS[ReleaseStageSchema.parse(stage)];
}
