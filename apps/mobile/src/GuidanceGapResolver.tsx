import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';

import {
  GAP_STATE_LEAD,
  RESOLVER_HEADING,
  RETRY_DATA_BUSY_LABEL,
} from './guidance/guidance-copy';
import {
  resolverAnnouncement,
  type GuidanceResolverItem,
} from './guidance/guidance-gap-state';
import { focusOn } from './focus';
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
  /** The screen heading; it changes with what the resolver is showing. */
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
 * - There is one heading, and it is a header.
 * - The new state is announced once. The announcement names the items, so a
 *   changed set is never silent, and it is sent through the platform's
 *   announcement API as well as the live region, so iOS hears it too. The
 *   component never uses an alert role, which would announce it a second
 *   time.
 * - Focus moves to the first thing the owner can act on, and to the gap the
 *   owner was resolving when they come back from a destination. A retry that
 *   fails leaves the focus where it was.
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
  const actionRefs = useRef<Record<string, unknown>>({});
  const signature = items.map(item => item.key).join('|');
  const announcement = resolverAnnouncement(items);

  // The state is announced once, and only when it changes: the announcement
  // names the items, so a set that changed without changing its size is
  // still announced.
  useEffect(() => {
    const spoken = retryError ?? announcement;
    if (spoken === '') return;
    try {
      AccessibilityInfo.announceForAccessibility(spoken);
    } catch {
      // The platform has no announcement API: the live region still carries
      // the change.
    }
  }, [signature, retryError, announcement]);

  // Focus follows the change: a new set of gaps moves focus to the first
  // thing the owner can act on, and a returning owner finds the gap they
  // were resolving.
  useEffect(() => {
    const restored = focusKey === null ? undefined : actionRefs.current[focusKey];
    if (restored !== undefined && restored !== null) {
      focusOn({ current: restored });
      return;
    }
    const firstAction = items.find(item => item.primaryAction !== null);
    if (firstAction !== undefined) {
      const target = actionRefs.current[firstAction.key];
      if (target !== undefined && target !== null) {
        focusOn({ current: target });
        return;
      }
    }
    focusOn({ current: headingRef.current });
  }, [signature, focusKey, items]);

  const run = (item: GuidanceResolverItem, route: GuidanceRoute) => {
    if (route === 'retry_sources') {
      onRetry();
      return;
    }
    if (route === 'today_check_in') {
      onReviewCheckIn(item.internalSubject);
      return;
    }
    if (route === 'content_pending') return;
    onNavigate(route, item.key);
  };

  if (items.length === 0) return null;

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

    {items.map(item => {
      const primary = item.primaryAction;
      const secondary = item.secondaryAction;
      return <View key={item.key} style={styles.notice}>
        <Text style={styles.label}>{GAP_STATE_LEAD[item.state]}</Text>
        <Text style={styles.body}>{item.title}</Text>
        {primary !== null && (
          <Pressable
            ref={node => { actionRefs.current[item.key] = node; }}
            accessibilityRole="button"
            accessibilityLabel={primary.accessibilityLabel}
            accessibilityState={{ disabled: retrying }}
            disabled={retrying}
            onPress={() => run(item, primary.route)}
            style={[styles.pill, retrying && { opacity: 0.5 }]}
          >
            <Text style={styles.body}>
              {primary.route === 'retry_sources' && retrying ? RETRY_DATA_BUSY_LABEL : primary.label}
            </Text>
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
