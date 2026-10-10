import { z } from 'zod';

export const DestinationIdSchema = z.enum([
  'today',
  'my_hair',
  'my_shelf',
  'my_tools',
  'journey',
  'settings',
]);

export type DestinationId = z.infer<typeof DestinationIdSchema>;

export interface DestinationDefinition {
  readonly id: DestinationId;
  readonly label: string;
  readonly accessibilityLabel: string;
}

export const DESTINATIONS: readonly DestinationDefinition[] = [
  { id: 'today', label: 'Today', accessibilityLabel: 'Today' },
  { id: 'my_hair', label: 'My Hair', accessibilityLabel: 'My Hair: passport and services' },
  { id: 'my_shelf', label: 'My Shelf', accessibilityLabel: 'My Shelf: owned products' },
  { id: 'my_tools', label: 'My Tools', accessibilityLabel: 'My Tools: owned tools' },
  { id: 'journey', label: 'Journey', accessibilityLabel: 'Journey: activities and history' },
  { id: 'settings', label: 'Settings', accessibilityLabel: 'Settings: account and privacy' },
];

export const INITIAL_DESTINATION: DestinationId = 'today';
