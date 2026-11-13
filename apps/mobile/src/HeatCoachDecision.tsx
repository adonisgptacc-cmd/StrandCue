import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Text, View, type TextInstance } from 'react-native';

import type { HeatCoachReceipt, HeatCoachReviewedCopy } from './heat-coach-api';
import { Button, styles } from './ui';

const TITLES = {
  content_pending: 'Guidance pending', needs_input: 'More details needed',
  restricted: 'Heat use restricted', lower_heat: 'Lower heat option',
  no_heat: 'No heat option', appropriate: 'Recorded option', unavailable: 'Guidance unavailable',
} as const;
const DESTINATIONS = {
  today: 'Today', my_hair: 'My Hair', services: 'Services',
  my_shelf: 'My Shelf', my_tools: 'My Tools',
} as const;
const METHODS = { 'direct-contact': 'Direct contact', 'heated-air': 'Heated air',
  hooded: 'Hooded', steam: 'Steam', unheated: 'No heat' } as const;
const NECESSITY = { not_needed: 'Not needed', optional: 'Optional',
  supports_goal: 'Supports the recorded goal', unknown: 'Not established' } as const;
type Destination = keyof typeof DESTINATIONS;

export interface HeatCoachDecisionProps {
  readonly receipt: HeatCoachReceipt;
  readonly reviewedCopy: HeatCoachReviewedCopy | null;
  readonly onUsePlan: () => void;
  readonly onOpenDestination?: (destination: Destination) => void;
}

/** Renders only exact publication copy and neutral local status labels. */
export function HeatCoachDecision({ receipt, reviewedCopy, onUsePlan, onOpenDestination }: HeatCoachDecisionProps) {
  const heading = useRef<TextInstance>(null);
  const valid = !receipt.stale && reviewedCopy !== null
    && reviewedCopy.assessmentId === receipt.assessmentId
    && reviewedCopy.publicationId === receipt.publicationId
    && reviewedCopy.publicationDigest === receipt.publicationDigest;
  const copy = valid ? new Map(reviewedCopy.copy.map(row => [row.copyKey, row.text])) : new Map<string, string>();
  const keys = [...receipt.result.reasons.map(row => row.copyKey),
    ...receipt.result.missing.map(row => row.copyKey),
    ...receipt.result.alternatives.map(row => row.copyKey), 'heat.limitations'];
  const complete = valid && keys.every(key => copy.has(key));
  const state = receipt.result.state;
  const prepared = receipt.input.preparedInput;
  const hasCheckIn = prepared.currentCondition !== null && prepared.availableMinutes !== null;
  const selected = receipt.result.selected;
  const completeHeatSelection = selected.method !== null && selected.method !== 'unheated'
    && selected.temperature !== null && selected.passes !== null && selected.durationMinutes !== null
    && selected.zones.length > 0 && typeof receipt.input.request.toolOwnerItemId === 'string'
    && receipt.input.request.toolOwnerItemId.length > 0;
  const canUse = complete && hasCheckIn && (state === 'no_heat'
    || ((state === 'appropriate' || state === 'lower_heat') && completeHeatSelection));
  const useLabel = state === 'lower_heat' ? 'Use adjusted lower option'
    : state === 'appropriate' ? 'Use this heat option' : 'Use this plan';
  const title = receipt.stale ? 'Assessment needs refreshing' : TITLES[state];
  useEffect(() => {
    const target = findNodeHandle(heading.current);
    if (target != null) AccessibilityInfo.setAccessibilityFocus(target);
    AccessibilityInfo.announceForAccessibility(title);
  }, [title, receipt.assessmentId]);
  return <View style={styles.card}>
    <Text ref={heading} accessibilityRole="header" style={styles.heading}>{title}</Text>
    {!complete ? <Text style={styles.body}>Reviewed guidance is not available for this assessment. Please check again later.</Text>
      : <>
        <Text style={styles.body}>Heat need: {NECESSITY[receipt.result.necessity]}</Text>
        <Text accessibilityRole="header" style={styles.label}>Recorded plan</Text>
        <Text style={styles.body}>Method: {receipt.result.selected.method
          ? METHODS[receipt.result.selected.method] : 'Not recorded'}</Text>
        <Text style={styles.body}>Temperature: {receipt.result.selected.temperature
          ? `${receipt.result.selected.temperature.value}°${receipt.result.selected.temperature.unit}` : 'Not recorded'}</Text>
        <Text style={styles.body}>Named setting: {receipt.result.selected.setting ?? 'Not recorded'}</Text>
        <Text style={styles.body}>Passes: {receipt.result.selected.passes ?? 'Not recorded'}</Text>
        <Text style={styles.body}>Duration: {receipt.result.selected.durationMinutes === null
          ? 'Not recorded' : `${receipt.result.selected.durationMinutes} minutes`}</Text>
        <Text style={styles.body}>Areas: {receipt.result.selected.zones.length === 0 ? 'Not recorded'
          : receipt.result.selected.zones.map(zone => `${zone.region.replaceAll('-', ' ')} ${zone.segment.replaceAll('-', ' ')}`).join(', ')}</Text>
        <Text accessibilityRole="header" style={styles.label}>Why</Text>
        {receipt.result.reasons.map(row => <Text key={row.copyKey} style={styles.body}>{copy.get(row.copyKey)}</Text>)}
        {receipt.result.missing.length > 0 && <Text accessibilityRole="header" style={styles.label}>Details to add</Text>}
        {receipt.result.missing.map((row, index) => <View key={`${row.copyKey}:${index}`}>
          <Text style={styles.body}>{copy.get(row.copyKey)}</Text>
          {onOpenDestination && <Button title={`Open ${DESTINATIONS[row.destination]}`} secondary
            onPress={() => onOpenDestination(row.destination)}/>}
        </View>)}
        {receipt.result.alternatives.length > 0 && <Text accessibilityRole="header" style={styles.label}>Other reviewed options</Text>}
        {receipt.result.alternatives.map((row, index) =>
          <Text key={`${row.copyKey}:${index}`} style={styles.body}>{copy.get(row.copyKey)}</Text>)}
        <Text accessibilityRole="header" style={styles.label}>Limits</Text>
        <Text style={styles.body}>{copy.get('heat.limitations')}</Text>
      </>}
    {complete && (state === 'lower_heat' || state === 'appropriate') && !completeHeatSelection
      && <Text style={styles.body}>Exact heat limits and an owned tool are required before this option can be used in a plan.</Text>}
    {complete && (state === 'no_heat' || state === 'lower_heat' || state === 'appropriate') && !hasCheckIn
      && <Text style={styles.body}>Complete a Today check-in before using this plan.</Text>}
    {canUse && <Button title={useLabel} onPress={onUsePlan}/>}
  </View>;
}
