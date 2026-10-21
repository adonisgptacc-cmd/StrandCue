import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { CurrentConditionZone } from '../../../packages/domain/src/index';
import {
  CHECK_IN_CONCERNS,
  ZONE_REGIONS,
  ZONE_SEGMENTS,
  zoneKey,
  type CheckInDraft,
  type CheckInErrorCode,
  type CheckInGoal,
  type PreflightAction,
} from './guidance/current-condition-state';
import {
  CHECK_IN_BOUNDARY,
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_ERROR_TEXT,
  CHECK_IN_ERRORS_HEADING,
  CHECK_IN_GOAL_LABEL,
  CHECK_IN_GOAL_LABELS,
  CHECK_IN_SUMMARY_SESSION_ONLY,
  CHECK_IN_TITLE,
  CONCERN_LABELS,
  CONCERNS_CLEARED_STATUS,
  CONCERNS_HINT,
  CONCERNS_LABEL,
  EXCLUSIVE_CONCERN_HINT,
  OBSERVED_AT_LABEL,
  OBSERVED_AT_NOT_SET,
  REFRESH_TIME_LABEL,
  TIME_HELP,
  TIME_INPUT_LABEL,
  TIME_LABEL,
  ZONE_ADDED_STATUS,
  ZONE_CONCERN_LABEL,
  ZONE_CONCERNS_LABEL,
  ZONE_HINT,
  ZONE_LABEL,
  ZONE_REMOVED_STATUS,
  ZONE_REGION_LABEL,
  ZONE_REGION_LABELS,
  ZONE_REMOVE_LABEL,
  ZONE_SEGMENT_LABEL,
  ZONE_SEGMENT_LABELS,
  ZONE_SELECTED_LABEL,
  zoneLabel,
} from './guidance/guidance-copy';
import { focusOn } from './focus';
import { colors, styles } from './ui';

export interface TodayCheckInProps {
  readonly draft: CheckInDraft;
  readonly errors: readonly CheckInErrorCode[];
  readonly nowIso: () => string;
  readonly dispatch: (action: PreflightAction) => void;
  /** The part of the check-in a gap named, so focus lands there. */
  readonly focusSection?: 'concerns' | 'goal' | 'time' | 'observed_at' | 'zones' | null;
}

/** The observable time in the owner's own words, not a raw timestamp. */
export function observationTimeLabel(observedAt: string | null): string {
  if (observedAt === null || observedAt.trim() === '') return OBSERVED_AT_NOT_SET;
  const parsed = Date.parse(observedAt);
  if (Number.isNaN(parsed)) return OBSERVED_AT_NOT_SET;
  const date = new Date(parsed);
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${date.getDate()} ${date.getMonth() + 1} ${date.getFullYear()}, ${hours}:${minutes}`;
}

/**
 * Temporary current-condition check-in form (HP-06, TD-02–TD-03, SF-01,
 * UX-01–UX-04).
 *
 * Every control carries a screen-reader label, every touch target reuses the
 * shared pill/button styles (min-height 48, above the 44 minimum), and copy
 * stays in short separate text blocks so large text sizes reflow instead of
 * clipping. The cosmetic boundary ("self-reported observations, not a
 * diagnosis") is always visible above the form.
 *
 * Three Task 3.2 rules apply here:
 *
 * - A control's label names the control, not the section it sits in. The
 *   section is already a header above it, and a screen reader reads the
 *   header once; repeating it on every control says the same thing again.
 * - A selected answer says so in words as well as in colour: a tick, not
 *   only a darker pill.
 * - The zone step is the smallest one that can resolve a zone gap: an area,
 *   the part of the hair, and what was noticed there. Zone detail stays
 *   optional, and no zone is ever inferred from a photo or any other fact.
 */
export function TodayCheckIn({ draft, errors, nowIso, dispatch, focusSection = null }: TodayCheckInProps) {
  const errorRef = useRef<Text | null>(null);
  const concernsRef = useRef<Text | null>(null);
  const goalRef = useRef<Text | null>(null);
  const timeRef = useRef<Text | null>(null);
  const observedAtRef = useRef<Text | null>(null);
  const zonesRef = useRef<Text | null>(null);
  const [region, setRegion] = useState<CurrentConditionZone['region'] | null>(null);
  const [status, setStatus] = useState('');

  // A validation failure is announced once, by the alert summary. Focus goes
  // to the part of the form that failed, so the owner lands on the answer
  // they have to change rather than on a summary of it.
  useEffect(() => {
    if (errors.length === 0) return;
    const section = errors.some(code => code === 'concerns_required' || code === 'concerns_exclusive')
      ? concernsRef
      : errors.some(code => code === 'time_required' || code === 'time_range')
        ? timeRef
        : errors.some(code => code.startsWith('observed_at'))
          ? observedAtRef
          : errors.some(code => code.startsWith('zone'))
            ? zonesRef
            : goalRef;
    focusOn({ current: section.current });
  }, [errors]);

  // A gap that names one part of the check-in brings the owner straight to
  // it. The answers they already gave stay exactly where they were.
  useEffect(() => {
    if (focusSection === null) return;
    const target = {
      concerns: concernsRef,
      goal: goalRef,
      time: timeRef,
      observed_at: observedAtRef,
      zones: zonesRef,
    }[focusSection];
    focusOn({ current: target.current });
  }, [focusSection]);

  const selectedZones = draft.zones;
  const concerns = draft.concerns.filter(concern => concern !== 'none' && concern !== 'unknown');

  const toggleZone = (nextRegion: CurrentConditionZone['region'], nextSegment: CurrentConditionZone['segment']) => {
    const zone: CurrentConditionZone = { region: nextRegion, segment: nextSegment };
    const key = zoneKey(zone);
    const present = selectedZones.some(entry => zoneKey(entry) === key);
    dispatch({ type: 'toggle_zone', region: nextRegion, segment: nextSegment });
    setStatus(
      present
        ? ZONE_REMOVED_STATUS(zoneLabel(zone))
        : ZONE_ADDED_STATUS(zoneLabel(zone)),
    );
  };

  return <View style={styles.card}>
    <Text style={styles.heading} accessibilityRole="header" accessibilityLabel={CHECK_IN_TITLE}>
      {CHECK_IN_TITLE}
    </Text>
    <Text style={styles.body}>{CHECK_IN_BOUNDARY}</Text>

    <View>
      <Text
        ref={concernsRef}
        style={styles.label}
        accessibilityRole="header"
        accessibilityLabel={CONCERNS_LABEL}
      >
        {CONCERNS_LABEL}
      </Text>
      <Text style={styles.subtitle}>{CONCERNS_HINT}</Text>
      <View style={styles.row}>
        {CHECK_IN_CONCERNS.map(concern => {
          const checked = draft.concerns.includes(concern);
          return <Pressable
            key={concern}
            accessibilityRole="checkbox"
            accessibilityLabel={CONCERN_LABELS[concern]}
            accessibilityHint={concern === 'none' || concern === 'unknown' ? EXCLUSIVE_CONCERN_HINT : undefined}
            accessibilityState={{ checked }}
            onPress={() => {
              dispatch({ type: 'toggle_concern', concern });
              // Choosing a stand-alone answer clears the others, and the
              // owner is told that it happened.
              if (concern === 'none' || concern === 'unknown') {
                if (draft.concerns.some(entry => entry !== 'none' && entry !== 'unknown')) {
                  setStatus(CONCERNS_CLEARED_STATUS);
                }
              }
            }}
            style={[styles.pill, checked && styles.selected]}
          >
            <Text style={[styles.body, checked && { color: colors.white }]}>
              {checked ? `✓ ${CONCERN_LABELS[concern]}` : CONCERN_LABELS[concern]}
            </Text>
          </Pressable>;
        })}
      </View>
    </View>

    <View>
      <Text
        ref={goalRef}
        style={styles.label}
        accessibilityRole="header"
        accessibilityLabel={CHECK_IN_GOAL_LABEL}
      >
        {CHECK_IN_GOAL_LABEL}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={CHECK_IN_GOAL_LABEL}>
        {(Object.keys(CHECK_IN_GOAL_LABELS) as CheckInGoal[]).map(goal => (
          <Pressable
            key={goal}
            accessibilityRole="radio"
            accessibilityLabel={CHECK_IN_GOAL_LABELS[goal]}
            accessibilityState={{ selected: draft.goal === goal }}
            onPress={() => dispatch({ type: 'set_goal', goal })}
            style={[styles.pill, draft.goal === goal && styles.selected]}
          >
            <Text style={[styles.body, draft.goal === goal && { color: colors.white }]}>
              {draft.goal === goal ? `✓ ${CHECK_IN_GOAL_LABELS[goal]}` : CHECK_IN_GOAL_LABELS[goal]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>

    <View>
      <Text ref={timeRef} style={styles.label} accessibilityRole="header" accessibilityLabel={TIME_LABEL}>
        {TIME_LABEL}
      </Text>
      <TextInput
        accessibilityLabel={TIME_INPUT_LABEL}
        keyboardType="numeric"
        inputMode="numeric"
        maxLength={4}
        value={draft.availableMinutes === null ? '' : String(draft.availableMinutes)}
        onChangeText={text => {
          if (!/^\d*$/.test(text)) return;
          dispatch({ type: 'set_available_minutes', minutes: text === '' ? null : Number(text) });
        }}
        style={styles.input}
      />
      <Text style={styles.subtitle}>{TIME_HELP}</Text>
    </View>

    <View>
      <Text
        ref={observedAtRef}
        style={styles.label}
        accessibilityRole="header"
        accessibilityLabel={OBSERVED_AT_LABEL}
      >
        {OBSERVED_AT_LABEL}
      </Text>
      <Text style={styles.body} accessibilityLabel={observationTimeLabel(draft.observedAt)}>
        {observationTimeLabel(draft.observedAt)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REFRESH_TIME_LABEL}
        onPress={() => dispatch({ type: 'refresh_observed_at', observedAt: nowIso() })}
        style={[styles.pill]}
      >
        <Text style={styles.body}>{REFRESH_TIME_LABEL}</Text>
      </Pressable>
    </View>

    <View>
      <Text
        ref={zonesRef}
        style={styles.label}
        accessibilityRole="header"
        accessibilityLabel={ZONE_LABEL}
      >
        {ZONE_LABEL}
      </Text>
      <Text style={styles.subtitle}>{ZONE_HINT}</Text>

      <Text style={styles.label} accessibilityRole="header" accessibilityLabel={ZONE_REGION_LABEL}>
        {ZONE_REGION_LABEL}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={ZONE_REGION_LABEL}>
        {ZONE_REGIONS.map(option => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={ZONE_REGION_LABELS[option] ?? option}
            accessibilityState={{ selected: region === option }}
            onPress={() => setRegion(option)}
            style={[styles.pill, region === option && styles.selected]}
          >
            <Text style={[styles.body, region === option && { color: colors.white }]}>
              {ZONE_REGION_LABELS[option] ?? option}
            </Text>
          </Pressable>
        ))}
      </View>

      {region !== null && (
        <>
          <Text style={styles.label} accessibilityRole="header" accessibilityLabel={ZONE_SEGMENT_LABEL}>
            {ZONE_SEGMENT_LABEL}
          </Text>
          <View style={styles.row} accessibilityLabel={ZONE_SEGMENT_LABEL}>
            {ZONE_SEGMENTS.map(option => {
              const zone: CurrentConditionZone = { region, segment: option };
              const checked = selectedZones.some(entry => zoneKey(entry) === zoneKey(zone));
              return <Pressable
                key={option}
                accessibilityRole="checkbox"
                accessibilityLabel={ZONE_SEGMENT_LABELS[option] ?? option}
                accessibilityState={{ checked }}
                onPress={() => toggleZone(region, option)}
                style={[styles.pill, checked && styles.selected]}
              >
                <Text style={[styles.body, checked && { color: colors.white }]}>
                  {checked ? `✓ ${ZONE_SEGMENT_LABELS[option] ?? option}` : ZONE_SEGMENT_LABELS[option] ?? option}
                </Text>
              </Pressable>;
            })}
          </View>
        </>
      )}

      {selectedZones.length > 0 && (
        <>
          <Text style={styles.label} accessibilityRole="header" accessibilityLabel={ZONE_SELECTED_LABEL}>
            {ZONE_SELECTED_LABEL}
          </Text>
          <View style={styles.row}>
            {selectedZones.map(zone => {
              const label = zoneLabel(zone);
              return <View key={zoneKey(zone)} style={[styles.pill, { flexShrink: 1, flexWrap: 'wrap' }]}>
                <Text style={styles.body}>{label}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ZONE_REMOVE_LABEL(label)}
                  onPress={() => toggleZone(zone.region, zone.segment)}
                  style={[styles.pill]}
                >
                  <Text style={styles.body}>{ZONE_REMOVE_LABEL(label)}</Text>
                </Pressable>
              </View>;
            })}
          </View>

          <Text style={styles.label} accessibilityRole="header" accessibilityLabel={ZONE_CONCERNS_LABEL}>
            {ZONE_CONCERNS_LABEL}
          </Text>
          {selectedZones.map(zone => {
            const label = zoneLabel(zone);
            const attached = draft.zoneConcerns.find(entry => zoneKey(entry.zone) === zoneKey(zone));
            return <View key={zoneKey(zone)}>
              <Text style={styles.subtitle}>{label}</Text>
              <View style={styles.row}>
                {concerns.map(concern => {
                  const checked = attached?.concerns.includes(concern) ?? false;
                  return <Pressable
                    key={concern}
                    accessibilityRole="checkbox"
                    accessibilityLabel={ZONE_CONCERN_LABEL(label, CONCERN_LABELS[concern])}
                    accessibilityState={{ checked }}
                    onPress={() => dispatch({ type: 'toggle_zone_concern', zone, concern })}
                    style={[styles.pill, checked && styles.selected]}
                  >
                    <Text style={[styles.body, checked && { color: colors.white }]}>
                      {checked ? `✓ ${CONCERN_LABELS[concern]}` : CONCERN_LABELS[concern]}
                    </Text>
                  </Pressable>;
                })}
              </View>
            </View>;
          })}
        </>
      )}

      {/* One live region for the check-in, so a change is announced once. */}
      <Text style={styles.subtitle} accessibilityLiveRegion="polite">{status}</Text>
    </View>

    <Text style={styles.subtitle}>{CHECK_IN_SUMMARY_SESSION_ONLY}</Text>

    {errors.length > 0 && (
      <View style={styles.notice}>
        <Text
          ref={errorRef}
          accessibilityRole="alert"
          accessibilityLabel={CHECK_IN_ERRORS_HEADING}
          style={styles.error}
        >
          {CHECK_IN_ERRORS_HEADING}
        </Text>
        {errors.map(code => (
          <Text key={code} style={styles.error} accessibilityLabel={CHECK_IN_ERROR_TEXT[code]}>
            {CHECK_IN_ERROR_TEXT[code]}
          </Text>
        ))}
      </View>
    )}

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={CHECK_IN_CONTINUE_LABEL}
      onPress={() => dispatch({ type: 'complete_check_in', now: nowIso() })}
      style={[styles.button]}
    >
      <Text style={styles.buttonText}>{CHECK_IN_CONTINUE_LABEL}</Text>
    </Pressable>
  </View>;
}
