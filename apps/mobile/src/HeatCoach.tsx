import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';

import { HeatCoachDecision } from './HeatCoachDecision';
import { HeatCoachIntent, type OwnedHeatItem } from './HeatCoachIntent';
import { getHeatCoachAssessment, getHeatCoachReviewedCopy, type HeatCoachReceipt, type HeatCoachReviewedCopy } from './heat-coach-api';
import { HEAT_COACH_ERROR_COPY } from './heat-coach-errors';
import type { HeatCoachController } from './heat-coach-state';
import { Button, styles } from './ui';

type Destination = 'today' | 'my_hair' | 'services' | 'my_shelf' | 'my_tools';
export interface HeatCoachProps {
  readonly ownerKey: string;
  readonly controller: HeatCoachController;
  readonly ownedTools: readonly OwnedHeatItem[];
  readonly ownedProducts?: readonly OwnedHeatItem[];
  readonly getReviewedCopy?: (receipt: HeatCoachReceipt) => Promise<HeatCoachReviewedCopy>;
  readonly getAssessment?: (id: string) => Promise<HeatCoachReceipt>;
  readonly onOpenDestination?: (destination: Destination) => void;
  readonly onUsePlan: (receipt: HeatCoachReceipt) => void;
}

/** Owner-keyed journey; a late copy response cannot paint a different owner or assessment. */
export function HeatCoach(props: HeatCoachProps) {
  const { controller, ownerKey } = props;
  const currentState = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const [copyResult, setCopy] = useState<{ controller: HeatCoachController; ownerKey: string; assessmentId: string;
    copy: HeatCoachReviewedCopy } | null>(null);
  const startsInFlight = useRef(new Set<string>());
  useEffect(() => { controller.setOwner(ownerKey); }, [controller, ownerKey]);
  const receipt = currentState.ownerKey === ownerKey ? currentState.receipt : null;
  const copy = copyResult?.controller === controller && copyResult.ownerKey === ownerKey
    && copyResult.assessmentId === receipt?.assessmentId
    ? copyResult.copy : null;
  const startPlan = async (selected: HeatCoachReceipt) => {
    const initial = controller.getState();
    if (initial.ownerKey !== ownerKey || initial.receipt !== selected) return;
    const attempt = `${initial.ownerEpoch}:${selected.assessmentId}`;
    if (startsInFlight.current.has(attempt)) return;
    startsInFlight.current.add(attempt);
    try {
      const fresh = await (props.getAssessment ?? getHeatCoachAssessment)(selected.assessmentId);
      const latest = controller.getState();
      if (latest.ownerKey !== ownerKey || latest.ownerEpoch !== initial.ownerEpoch
        || latest.receipt !== selected) return;
      if (fresh.stale
        || fresh.assessmentId !== selected.assessmentId
        || fresh.publicationId !== selected.publicationId
        || fresh.publicationDigest !== selected.publicationDigest
        || fresh.sourceFingerprint !== selected.sourceFingerprint) {
        setCopy(null);
        return;
      }
      props.onUsePlan(fresh);
    } catch {
      const latest = controller.getState();
      if (latest.ownerKey === ownerKey && latest.ownerEpoch === initial.ownerEpoch
        && latest.receipt === selected) setCopy(null);
    } finally { startsInFlight.current.delete(attempt); }
  };
  useEffect(() => {
    if (!receipt || receipt.stale) return;
    let active = true;
    (props.getReviewedCopy ?? getHeatCoachReviewedCopy)(receipt)
      .then(value => { if (active) setCopy({ controller, ownerKey, assessmentId: receipt.assessmentId, copy: value }); })
      .catch(() => { if (active) setCopy(null); });
    return () => { active = false; };
  }, [controller, receipt, ownerKey, props.getReviewedCopy]);
  if (currentState.ownerKey !== ownerKey) return <View><Text style={styles.body}>Loading your Heat Coach choices…</Text></View>;
  return <View style={{ gap: 20 }}>
    <Text accessibilityRole="header" style={styles.title}>Heat Coach</Text>
    {receipt ? <HeatCoachDecision receipt={receipt} reviewedCopy={copy}
      onUsePlan={() => { void startPlan(receipt); }} onOpenDestination={props.onOpenDestination}/>
      : <HeatCoachIntent ownerKey={ownerKey} intent={currentState.intent} ownedTools={props.ownedTools}
        ownedProducts={props.ownedProducts} onChange={controller.editIntent}
        onAssess={() => { void controller.save(); }} saving={currentState.phase === 'saving'}
        onOpenDestination={props.onOpenDestination}/>}
    {currentState.phase === 'failed' && currentState.failure && <View style={styles.notice}>
      <Text style={styles.error}>{HEAT_COACH_ERROR_COPY[currentState.failure]}</Text>
      <Button title="Try again" onPress={() => { void controller.retry(); }}/>
    </View>}
    {receipt && <Button title="Change heat choices" secondary onPress={controller.newAssessment}/>}
  </View>;
}
