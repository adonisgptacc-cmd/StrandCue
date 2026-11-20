import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CurrentConditionInput } from '../../../packages/domain/src/current-condition.ts';

import { HeatCoach } from './HeatCoach';
import type { OwnedHeatItem } from './HeatCoachIntent';
import { createHeatCoachAssessment, getCurrentHeatCoachPublication } from './heat-coach-api';
import { createHeatCoachController, type HeatCoachController } from './heat-coach-state';
import { listUserProducts, type ShelfList, type ShelfCursor } from './shelf-api';
import { listUserTools, type ToolList, type ToolCursor } from './tool-api';
import { toolDisplayName } from './tool-copy';
import { Button, styles } from './ui';

type Destination = 'today' | 'my_hair' | 'services' | 'my_shelf' | 'my_tools';
type Publication = { readonly publicationId: string; readonly publicationDigest: string };
type Page<T, C> = { readonly items: readonly T[]; readonly nextCursor: C | null };
interface Ready {
  readonly ownerKey: string;
  readonly phase: 'ready';
  readonly controller: HeatCoachController;
  readonly tools: readonly OwnedHeatItem[];
  readonly products: readonly OwnedHeatItem[];
}
type EntryState = Ready | { readonly ownerKey: string; readonly phase: 'loading' }
  | { readonly ownerKey: string; readonly phase: 'pending' }
  | { readonly ownerKey: string; readonly phase: 'failed' };
export interface HeatCoachEntryProps {
  readonly ownerKey: string;
  readonly selectedTool?: OwnedHeatItem | null;
  readonly currentCondition?: CurrentConditionInput | null;
  readonly onNavigate: (destination: Destination) => void;
  /** Passes only the owned assessment identity into Today; no verdict travels. */
  readonly onUseAssessment?: (assessmentId: string) => void;
  readonly loadPublication?: () => Promise<Publication | null>;
  readonly loadTools?: (options: { limit: number; cursor: ToolCursor | null }) => Promise<ToolList>;
  readonly loadProducts?: (options: { limit: number; cursor: ShelfCursor | null }) => Promise<ShelfList>;
}

async function collectPages<T extends { readonly id: string }, C>(
  load: (options: { limit: number; cursor: C | null }) => Promise<Page<T, C>>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  const seenItems = new Set<string>();
  let cursor: C | null = null;
  for (let page = 0; page < 50; page += 1) {
    const response = await load({ limit: 100, cursor });
    if (response.items.some(item => seenItems.has(item.id)
      || response.items.filter(other => other.id === item.id).length !== 1)) {
      throw new Error('Duplicate owner item');
    }
    for (const item of response.items) seenItems.add(item.id);
    items.push(...response.items);
    if (response.nextCursor === null) return items;
    const key = JSON.stringify(response.nextCursor);
    if (seen.has(key)) throw new Error('Repeated owner-item page');
    seen.add(key);
    cursor = response.nextCursor;
  }
  throw new Error('Owner-item page limit exceeded');
}

function distinguish(items: readonly OwnedHeatItem[]): OwnedHeatItem[] {
  const counts = new Map<string, number>();
  const positions = new Map<string, number>();
  for (const item of items) counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  return items.map(item => {
    const count = counts.get(item.label) ?? 1;
    if (count === 1) return item;
    const position = (positions.get(item.label) ?? 0) + 1;
    positions.set(item.label, position);
    return { ...item, label: `${item.label}, number ${position} of ${count}` };
  });
}

/** Resolves one trusted publication and owner-recorded choices before mounting the intent form. */
export function HeatCoachEntry(props: HeatCoachEntryProps) {
  const { ownerKey, selectedTool } = props;
  const [state, setState] = useState<EntryState>({ ownerKey, phase: 'loading' });
  const [notice, setNotice] = useState<{ ownerKey: string; text: string } | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const publication = await (props.loadPublication ?? getCurrentHeatCoachPublication)();
        if (!active) return;
        if (!publication) { setState({ ownerKey, phase: 'pending' }); return; }
        const [toolRows, productRows] = await Promise.all([
          collectPages(props.loadTools ?? listUserTools), collectPages(props.loadProducts ?? listUserProducts),
        ]);
        if (!active) return;
        const tools = distinguish(toolRows.filter(row => row.availability === 'available')
          .map(row => ({ ownerItemId: row.id, label: toolDisplayName(row) })));
        const products = distinguish(productRows.filter(row => row.availability === 'available')
          .map(row => ({ ownerItemId: row.id,
            label: [row.manualBrand, row.manualName].filter(Boolean).join(' ') || 'Recorded product' })));
        const controller = createHeatCoachController({ ownerKey, publication,
          api: { createHeatCoachAssessment }, newOperationId: Crypto.randomUUID });
        if (props.currentCondition) {
          const condition = props.currentCondition;
          controller.editIntent({
            availableMinutes: condition.availableMinutes,
            currentCondition: {
              observedAt: condition.observedAt,
              concerns: [...condition.concerns],
              explicitNone: condition.concerns.length === 1 && condition.concerns[0] === 'none',
              zones: [...(condition.zones ?? [])],
              zoneConcerns: [...(condition.zoneConcerns ?? [])],
            },
          });
        }
        if (selectedTool && tools.some(item => item.ownerItemId === selectedTool.ownerItemId)) {
          controller.editIntent({ toolOwnerItemId: selectedTool.ownerItemId });
        }
        setState({ ownerKey, phase: 'ready', controller, tools, products });
      } catch { if (active) setState({ ownerKey, phase: 'failed' }); }
    };
    void load();
    return () => { active = false; };
  }, [ownerKey, selectedTool, props.currentCondition, props.loadPublication, props.loadTools, props.loadProducts]);
  if (state.ownerKey !== ownerKey) return <Text style={styles.body}>Loading Heat Coach…</Text>;
  if (state.phase === 'loading') return <Text style={styles.body}>Loading Heat Coach…</Text>;
  if (state.phase === 'pending') return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Heat Coach</Text>
    <Text style={styles.body}>Heat Coach guidance is not available yet.</Text>
    <Button title="Back to Today" secondary onPress={() => props.onNavigate('today')}/>
  </View>;
  if (state.phase === 'failed') return <View style={styles.card}>
    <Text accessibilityRole="alert" style={styles.error}>Heat Coach could not load. Please try again later.</Text>
    <Button title="Back to Today" secondary onPress={() => props.onNavigate('today')}/>
  </View>;
  return <View style={{ gap: 20 }}>
    <HeatCoach ownerKey={ownerKey} controller={state.controller} ownedTools={state.tools}
      ownedProducts={state.products} onOpenDestination={props.onNavigate}
      onUsePlan={receipt => {
        props.onUseAssessment?.(receipt.assessmentId);
        setNotice({ ownerKey, text: 'Assessment saved. No routine has started. Return to Today to choose a routine.' });
      }}/>
    {notice?.ownerKey === ownerKey && <Text accessibilityRole="alert" style={styles.body}>{notice.text}</Text>}
  </View>;
}
