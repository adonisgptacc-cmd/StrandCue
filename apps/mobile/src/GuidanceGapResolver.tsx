import { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  GAP_STATE_LEAD,
  RESOLVER_ANNOUNCEMENT_MANY,
  RESOLVER_ANNOUNCEMENT_ONE,
  RESOLVER_HEADING,
} from './guidance/guidance-copy';
import type { GuidanceResolverItem } from './guidance/guidance-gap-state';
import type { GuidanceRoute } from './navigation';
import { colors, styles } from './ui';

export interface GuidanceGapResolverProps {
  /** The gaps, failed reads and content state to show, already ordered. */
  readonly items: readonly GuidanceResolverItem[];
  /** Opens the destination that can fix a gap. */
  readonly onNavigate: (route: GuidanceRoute, focusKey: string) => void;
  /** Reads the owner's records again, through the same trusted path. */
  readonly onRetry: () => void;
  /** Returns to the check-in, at the part the gap names. */
  readonly onReviewCheckIn: (subject: string | null) => void;
  /** Whether a retry is running right now. */
  readonly retrying: boolean;
  /** The message shown when the last retry failed. */
  readonly retryError: string | null;
  /** The gap the owner was resolving, so focus can go back to it. */
  readonly focusKey: string | null;
  /** The screen heading; it changes when the resolver is showing optional setup. */
  readonly heading?: string;
}

/**
 * The guidance gap resolver (Task 3.2).
 *
 * One card per thing that is missing, unknown, contradictory, unsupported or
 * unavailable. Each card says what it is in plain words and offers one
 * action that names where it goes.
 *
 * Accessibility rules this component keeps:
 *
 * - There is one screen heading, and it is a header.
 * - There is exactly one live region. The announcement changes only when the
 *   set of items changes, so the same state is never announced twice, and
 *   the component never uses an alert role that would announce a second
 *   time.
 * - Focus moves to the heading when the resolver changes, and stays where it
 *   is when a retry fails, so a failed retry does not throw the owner back
 *   to the top of the screen.
 * - Every action names its destination, and no label contains a record id.
 */
export function GuidanceGapResolver({
  items,
  onNavigate,
  onRetry,
  onReviewCheckIn,
  retrying,
  retryError,
  focusKey,
  heading = RESOLVER_HEADING,
}: GuidanceGapResolverProps) {
  const headingRef = useRef<Text | null>(null);
  const itemRefs = useRef<Record<string, View | null>>({});
  const signature = items.map(item => item.key).join('|');
  /**
   * The announcement is derived, never stored. It changes only when the set
   * of items changes, so the same state is never announced twice: a retry
   * that fails leaves the same items on screen and says nothing again.
   */
  const announcement = items.length === 1
    ? RESOLVER_ANNOUNCEMENT_ONE
    : RESOLVER_ANNOUNCEMENT_MANY(items.length);

  // Focus follows the change: a new set of gaps moves focus to the heading,
  // and a returning owner finds the gap they were resolving.
  useEffect(() => {
    const restored = focusKey === null ? undefined : itemRefs.current[focusKey];
    if (restored !== undefined && restored !== null) {
      restored.focus?.();
      return;
    }
    headingRef.current?.focus?.();
  }, [signature, focusKey]);

  const ordered = useMemo(() => items, [items]);

  const run = (item: GuidanceResolverItem, route: GuidanceRoute) => {
    if (route === 'retry_sources') {
      onRetry();
      return;
    }
    if (route === 'today_check_in') {
      onReviewCheckIn(item.subject);
      return;
    }
    if (route === 'content_pending') return;
    onNavigate(route, item.key);
  };

  if (ordered.length === 0) return null;

  return <View style={styles.card}>
    <Text
      ref={headingRef}
      style={styles.heading}
      accessibilityRole="header"
      accessibilityLabel={heading}
    >
      {heading}
    </Text>

    {/* The one live region. It never carries an alert role, so the change is
        announced once and focus is not announced a second time. */}
    <Text style={styles.subtitle} accessibilityLiveRegion="polite">
      {retryError ?? announcement}
    </Text>

    {ordered.map(item => {
      const primary = item.primaryAction;
      const secondary = item.secondaryAction;
      return <View
        key={item.key}
        ref={node => { itemRefs.current[item.key] = node; }}
        style={styles.notice}
      >
        <Text style={styles.label}>{GAP_STATE_LEAD[item.state]}</Text>
        <Text style={styles.body}>{item.title}</Text>
        {primary !== null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primary.accessibilityLabel}
            accessibilityState={{ disabled: retrying }}
            disabled={retrying}
            onPress={() => run(item, primary.route)}
            style={[styles.pill, retrying && { opacity: 0.5 }]}
          >
            <Text style={styles.body}>{primary.label}</Text>
          </Pressable>
        )}
        {secondary !== null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary.accessibilityLabel}
            accessibilityState={{ disabled: retrying }}
            disabled={retrying}
            onPress={() => run(item, secondary.route)}
            style={[styles.pill, retrying && { opacity: 0.5 }]}
          >
            <Text style={[styles.body, { color: colors.ink }]}>{secondary.label}</Text>
          </Pressable>
        )}
      </View>;
    })}
  </View>;
}
