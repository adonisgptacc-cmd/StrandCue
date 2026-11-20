import { z } from 'zod';

export const DestinationIdSchema = z.enum([
  'today',
  'my_hair',
  'my_shelf',
  'my_tools',
  'journey',
  'settings',
  'heat_coach',
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

/**
 * Where a setup gap can send the owner. Two of the routes do not leave the
 * screen at all: the check-in is a step on Today, and a retry reloads the
 * owner's own records. The rest name a destination and, for My Hair, which
 * part of it.
 */
export type GuidanceRoute =
  | 'my_hair'
  | 'my_hair_services'
  | 'my_shelf'
  | 'my_tools'
  | 'today_check_in'
  | 'retry_sources'
  | 'content_pending';

export interface GuidanceRouteTarget {
  readonly destination: DestinationId;
  /** Which part of My Hair to open; My Hair has two parts. */
  readonly hairView?: 'Passport' | 'Services';
}

/**
 * The screen a route opens, or `null` when the route stays on Today. The
 * wording never uses an arrow: a screen reader reads punctuation aloud, and
 * an arrow says nothing the label does not already say.
 */
export function guidanceRouteTarget(route: GuidanceRoute): GuidanceRouteTarget | null {
  switch (route) {
    case 'my_hair':
      return { destination: 'my_hair', hairView: 'Passport' };
    case 'my_hair_services':
      return { destination: 'my_hair', hairView: 'Services' };
    case 'my_shelf':
      return { destination: 'my_shelf' };
    case 'my_tools':
      return { destination: 'my_tools' };
    default:
      return null;
  }
}
