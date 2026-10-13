import { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CHECK_IN_CONCERNS, type CheckInDraft, type CheckInErrorCode, type PreflightAction } from './guidance/current-condition-state';
import {
  CHECK_IN_BOUNDARY,
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_ERROR_TEXT,
  CHECK_IN_ERRORS_HEADING,
  CHECK_IN_GOAL_LABEL,
  CHECK_IN_GOAL_LABELS,
  CHECK_IN_TITLE,
  CONCERN_LABELS,
  CONCERNS_HINT,
  CONCERNS_LABEL,
  OBSERVED_AT_LABEL,
  REFRESH_TIME_LABEL,
  SAVE_HELP,
  SAVE_LABEL,
  TIME_HELP,
  TIME_LABEL,
} from './guidance/guidance-copy';
import { colors, styles } from './ui';

export interface TodayCheckInProps {
  readonly draft: CheckInDraft;
  readonly errors: readonly CheckInErrorCode[];
  readonly nowIso: () => string;
  readonly dispatch: (action: PreflightAction) => void;
}

/**
 * Temporary current-condition check-in form (HP-06, TD-02–TD-03, SF-01,
 * UX-01–UX-04).
 *
 * Every control carries a screen-reader label, every touch target reuses the
 * shared pill/button styles (min-height 48, above the 44 minimum), and copy
 * stays in short separate text blocks so large text sizes reflow instead of
 * clipping. Validation failures render an alert summary and move focus to
 * it; the cosmetic boundary ("self-reported observations, not a diagnosis")
 * is always visible above the form.
 */
export function TodayCheckIn({ draft, errors, nowIso, dispatch }: TodayCheckInProps) {
  const errorRef = useRef<Text | null>(null);

  useEffect(() => {
    if (errors.length > 0) errorRef.current?.focus?.();
  }, [errors]);

  return <View style={styles.card}>
    <Text style={styles.heading} accessibilityRole="header" accessibilityLabel={CHECK_IN_TITLE}>
      {CHECK_IN_TITLE}
    </Text>
    <Text style={styles.body}>{CHECK_IN_BOUNDARY}</Text>

    <View>
      <Text style={styles.label} accessibilityRole="header" accessibilityLabel={CONCERNS_LABEL}>
        {CONCERNS_LABEL}
      </Text>
      <Text style={styles.subtitle}>{CONCERNS_HINT}</Text>
      <View style={styles.row}>
        {CHECK_IN_CONCERNS.map(concern => {
          const checked = draft.concerns.includes(concern);
          const label = `${CONCERNS_LABEL}: ${CONCERN_LABELS[concern]}`;
          return <Pressable
            key={concern}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked }}
            onPress={() => dispatch({ type: 'toggle_concern', concern })}
            style={[styles.pill, checked && styles.selected]}
          >
            <Text style={[styles.body, checked && { color: colors.white }]}>{CONCERN_LABELS[concern]}</Text>
          </Pressable>;
        })}
      </View>
    </View>

    <View>
      <Text style={styles.label} accessibilityRole="header" accessibilityLabel={CHECK_IN_GOAL_LABEL}>
        {CHECK_IN_GOAL_LABEL}
      </Text>
      <View style={styles.row}>
        {Object.entries(CHECK_IN_GOAL_LABELS).map(([goal, goalLabel]) => (
          <Pressable
            key={goal}
            accessibilityRole="radio"
            accessibilityLabel={`${CHECK_IN_GOAL_LABEL}: ${goalLabel}`}
            accessibilityState={{ selected: draft.goal === goal }}
            onPress={() => dispatch({ type: 'set_goal', goal: 'basic_wash' })}
            style={[styles.pill, draft.goal === goal && styles.selected]}
          >
            <Text style={[styles.body, draft.goal === goal && { color: colors.white }]}>{goalLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>

    <View>
      <Text style={styles.label}>{TIME_LABEL}</Text>
      <TextInput
        accessibilityLabel={TIME_LABEL}
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
      <Text style={styles.label}>{OBSERVED_AT_LABEL}</Text>
      <Text style={styles.body} accessibilityLabel={`${OBSERVED_AT_LABEL}: ${draft.observedAt ?? 'not set yet'}`}>
        {draft.observedAt ?? 'Not set yet.'}
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
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={SAVE_LABEL}
        accessibilityState={{ checked: draft.saveToPassport }}
        onPress={() => dispatch({ type: 'set_save_to_passport', value: !draft.saveToPassport })}
        style={[styles.pill, draft.saveToPassport && styles.selected]}
      >
        <Text style={[styles.body, draft.saveToPassport && { color: colors.white }]}>{SAVE_LABEL}</Text>
      </Pressable>
      <Text style={styles.subtitle}>{SAVE_HELP}</Text>
    </View>

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