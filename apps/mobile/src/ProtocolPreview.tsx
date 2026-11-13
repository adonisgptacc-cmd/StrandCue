import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ProtocolPreviewModel } from './guidance/protocol-preview-model';
import {
  ALTERNATIVES_HEADING,
  ALTERNATIVES_NONE,
  CONFIDENCE_HEADING,
  EVIDENCE_HEADING,
  EVIDENCE_SUPPORTED,
  EXECUTION_START_LABEL,
  HEAT_PROTOCOL_BOUNDARY,
  LIMITATIONS_HEADING,
  NO_PURCHASE_NEEDED,
  OWNED_ITEMS_HEADING,
  PREVIEW_CONTENT_PENDING_HEADING,
  PREVIEW_HEADING,
  PREVIEW_READY_HEADING,
  PREVIEW_UNAVAILABLE_HEADING,
  STEPS_HEADING,
  confidenceLabel,
} from './guidance/guidance-copy';
import { focusOn } from './focus';
import { Button, styles } from './ui';

/**
 * The owner-facing protocol preview (Task 3.3).
 *
 * Consumes a `ProtocolPreviewModel` only and renders a read-only description
 * of what the proposed routine will do, which owned products and tools it
 * uses, the ordered steps, plain-language reasons, confidence, evidence and
 * limitations, and eligible alternatives. The Start action appears only for a
 * validated `ready` model; every other status is explanatory and read-only.
 *
 * Accessibility:
 * - One heading per screen, marked as a header.
 * - Scalable text with no fixed line height.
 * - Text at 4.5:1 contrast or better against the card background.
 * - Controls at least 44x44.
 * - When Start is offered, focus moves once to that button.
 */

export interface ProtocolPreviewProps {
  readonly model: ProtocolPreviewModel;
  /** Offered only when the model is `ready`; starts execution of the stored decision. */
  readonly onStart?: () => void;
  /** Opens Heat Coach's new assessment form; listed alternatives never authorize a plan. */
  readonly onReassessHeat?: () => void;
}

export function ProtocolPreview({ model, onStart, onReassessHeat }: ProtocolPreviewProps) {
  const startRef = useRef<ComponentRef<typeof Pressable> | null>(null);

  // After a ready preview is generated, move focus to the Start button once so
  // a screen-reader user lands on the action rather than the top of the screen.
  useEffect(() => {
    if (model.status !== 'ready' || onStart === undefined) return;
    focusOn({ current: startRef.current });
  }, [model.status, onStart]);

  const ready = model.status === 'ready';

  return <View style={{ gap: 16 }}>
    <Text
      style={styles.heading}
      accessibilityRole="header"
      accessibilityLabel={ready ? PREVIEW_READY_HEADING : PREVIEW_HEADING}
    >
      {ready ? PREVIEW_READY_HEADING : PREVIEW_HEADING}
    </Text>

    {!ready && (
      <View style={styles.card}>
        <Text style={styles.heading}>
          {model.status === 'content_pending' ? PREVIEW_CONTENT_PENDING_HEADING : PREVIEW_UNAVAILABLE_HEADING}
        </Text>
        <Text style={styles.body}>{model.explanation ?? ''}</Text>
      </View>
    )}

    {ready && (
      <>
        <View style={styles.card}>
          <Text style={styles.label}>{PREVIEW_HEADING}</Text>
          <Text style={styles.body}>{model.route?.summary ?? ''}</Text>
          {model.noPurchaseNeeded === true && (
            <Text style={styles.body} accessibilityRole="text" accessibilityLabel={NO_PURCHASE_NEEDED}>
              {NO_PURCHASE_NEEDED}
            </Text>
          )}
        </View>

        {model.heatPrescription !== undefined && (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>Assessed heat option</Text>
            {model.heatPrescription.adjustedLower && (
              <Text style={styles.body}>Choice: adjusted lower option from your assessment.</Text>
            )}
            <Text style={styles.body}>Method: {model.heatPrescription.method}</Text>
            <Text style={styles.body}>Temperature: {model.heatPrescription.temperature}</Text>
            <Text style={styles.body}>Named setting: {model.heatPrescription.setting ?? 'Not recorded'}</Text>
            <Text style={styles.body}>Passes: {model.heatPrescription.passes}</Text>
            <Text style={styles.body}>Duration: {model.heatPrescription.durationMinutes} minutes</Text>
            <Text style={styles.body}>Areas: {model.heatPrescription.zones.join(', ')}</Text>
            <Text accessibilityRole="header" style={styles.label}>Reviewed limits</Text>
            <Text style={styles.body}>{model.heatPrescription.reviewedLimitations}</Text>
            <Text style={styles.subtitle}>{HEAT_PROTOCOL_BOUNDARY}</Text>
            {onReassessHeat !== undefined && (
              <Button title="Change heat choices" secondary onPress={onReassessHeat}/>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.heading} accessibilityLabel={OWNED_ITEMS_HEADING}>
            {OWNED_ITEMS_HEADING}
          </Text>
          {model.ownedItems.length === 0 ? (
            <Text style={styles.body}>No owned product or tool is needed for this plan.</Text>
          ) : (
            model.ownedItems.map((item, index) => (
              <View key={`${item.kind}-${index}`} style={styles.notice}>
                <Text style={styles.body}>
                  {item.name} — {item.available ? 'available' : 'not available'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading} accessibilityLabel={STEPS_HEADING}>
            {STEPS_HEADING}
          </Text>
          {model.steps.map(step => (
            <View key={step.position} style={styles.notice}>
              <Text style={styles.label}>{`Step ${step.position}`}</Text>
              <Text style={styles.body}>{step.reason}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{CONFIDENCE_HEADING}</Text>
          <Text style={styles.body}>{confidenceLabel(model.confidence.level)}</Text>
          {model.confidence.limitedBecause.map((limitation, index) => (
            <Text key={index} style={styles.subtitle}>
              {limitation}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{EVIDENCE_HEADING}</Text>
          {model.evidence.every(evidence => evidence.covered) ? (
            <Text style={styles.body}>{EVIDENCE_SUPPORTED}</Text>
          ) : (
            model.evidence.map((evidence, index) => (
              <Text key={index} style={styles.body}>{evidence.note}</Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading} accessibilityLabel={LIMITATIONS_HEADING}>
            {LIMITATIONS_HEADING}
          </Text>
          {model.limitations.map((limitation, index) => (
            <Text key={index} style={styles.body}>{limitation.text}</Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading} accessibilityLabel={ALTERNATIVES_HEADING}>
            {ALTERNATIVES_HEADING}
          </Text>
          {model.alternatives.length === 0 ? (
            <Text style={styles.body}>{ALTERNATIVES_NONE}</Text>
          ) : (
            model.alternatives.map((alternative, index) => (
              <View key={index} style={styles.notice}>
                <Text style={styles.body}>
                  {alternative.name} — {alternative.available ? 'available' : 'not available'}
                </Text>
              </View>
            ))
          )}
        </View>

        {onStart !== undefined && (
          <Pressable
            ref={startRef}
            accessibilityRole="button"
            accessibilityLabel={EXECUTION_START_LABEL}
            accessibilityState={{ disabled: false }}
            onPress={onStart}
            style={[styles.button]}
          >
            <Text style={[styles.buttonText]}>{EXECUTION_START_LABEL}</Text>
          </Pressable>
        )}
      </>
    )}

    <Text style={styles.subtitle}>
      Cosmetic hair-care guidance from your own records, not a diagnosis. Nothing here promises a result.
    </Text>
  </View>;
}
