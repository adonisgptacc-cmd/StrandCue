import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { HeatCoachIntent as Intent } from './heat-coach-api';
import { Button, Choice, Field, colors, styles } from './ui';

export interface OwnedHeatItem { readonly ownerItemId: string; readonly label: string }

export interface HeatCoachIntentProps {
  readonly ownerKey: string;
  readonly intent: Intent;
  readonly ownedTools: readonly OwnedHeatItem[];
  readonly ownedProducts?: readonly OwnedHeatItem[];
  readonly onChange: (patch: Partial<Intent>) => void;
  readonly onAssess: () => void;
  readonly onOpenDestination?: (destination: 'my_tools' | 'my_hair' | 'my_shelf') => void;
  readonly saving: boolean;
}

const METHODS = ['direct-contact', 'heated-air', 'hooded', 'steam', 'unheated'] as const;
const METHOD_LABELS = { 'direct-contact': 'Direct contact', 'heated-air': 'Heated air',
  hooded: 'Hooded', steam: 'Steam', unheated: 'No heat' };
const REGIONS = ['whole_head', 'front', 'crown', 'nape', 'other', 'unknown'] as const;
const SEGMENTS = ['entire_strand', 'roots', 'mid_lengths', 'ends', 'other', 'unknown'] as const;

function OwnedChoice({ label, selected, disabled, onPress }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.pill, selected && styles.selected]}>
    <Text style={[styles.body, selected && { color: colors.white }]}>{label.split(': ')[1]}</Text>
  </Pressable>;
}

/** The owner records intent. A named setting never becomes a numeric temperature. */
export function HeatCoachIntent(props: HeatCoachIntentProps) {
  return <HeatCoachIntentFields key={props.ownerKey} {...props}/>;
}

function HeatCoachIntentFields(props: HeatCoachIntentProps) {
  const { intent, onChange, ownedTools, ownedProducts = [], onAssess, saving } = props;
  const [temperatureNumber, setTemperatureNumber] = useState(
    intent.temperature.state === 'known' ? String(intent.temperature.value.value) : '',
  );
  const [region, setRegion] = useState<(typeof REGIONS)[number]>('whole_head');
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>('entire_strand');
  const numeric = (value: string, max: number, field: 'passes' | 'durationMinutes') => {
    if (value === '') { onChange({ [field]: { state: 'unknown' } }); return; }
    if (!/^\d+$/u.test(value) || Number(value) > max) return;
    onChange({ [field]: { state: 'known', value: Number(value) } });
  };
  const temperature = (value: string, unit: 'C' | 'F') => {
    const number = Number(value);
    if (!/^\d+$/u.test(value) || number < (unit === 'C' ? 30 : 86)
      || number > (unit === 'C' ? 300 : 572)) return;
    onChange({ temperature: { state: 'known', value: { value: number, unit } } });
  };
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Your heat choices</Text>
    <Text style={styles.body}>Tell us what you intend to do. “Not sure” is a valid answer.</Text>
    <Choice label="Heat method" value={intent.method.state === 'known' ? intent.method.value : 'unknown'}
      options={['unknown', ...METHODS]} labels={{ unknown: 'Not sure', ...METHOD_LABELS }}
      onChange={value => onChange({ method: value === 'unknown' ? { state: 'unknown' }
        : { state: 'known', value: value as (typeof METHODS)[number] } })} disabled={saving}/>
    <View><Text style={styles.label}>Owned tool</Text><View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Owned tool">
      <OwnedChoice label="Owned tool: Not sure" selected={intent.toolOwnerItemId === null} disabled={saving}
        onPress={() => onChange({ toolOwnerItemId: null })}/>
      {ownedTools.map(tool => <OwnedChoice key={tool.ownerItemId} label={`Owned tool: ${tool.label}`}
        selected={intent.toolOwnerItemId === tool.ownerItemId} disabled={saving}
        onPress={() => onChange({ toolOwnerItemId: tool.ownerItemId })}/>)}
    </View></View>
    {intent.toolOwnerItemId === null && props.onOpenDestination &&
      <Button title="Set up tool in My Tools" secondary disabled={saving}
        onPress={() => props.onOpenDestination?.('my_tools')}/>}
    {intent.currentCondition == null && props.onOpenDestination &&
      <Button title="Update current condition in My Hair" secondary disabled={saving}
        onPress={() => props.onOpenDestination?.('my_hair')}/>}
    {ownedProducts.length > 0 && <View><Text style={styles.label}>Owned protection product</Text><View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Owned protection product">
      <OwnedChoice label="Owned product: Not sure" selected={intent.productOwnerItemId === null} disabled={saving}
        onPress={() => onChange({ productOwnerItemId: null })}/>
      {ownedProducts.map(product => <OwnedChoice key={product.ownerItemId} label={`Owned product: ${product.label}`}
        selected={intent.productOwnerItemId === product.ownerItemId} disabled={saving}
        onPress={() => onChange({ productOwnerItemId: product.ownerItemId })}/>)}
    </View></View>}
    {intent.productOwnerItemId === null && props.onOpenDestination &&
      <Button title="Add protection product in My Shelf" secondary disabled={saving}
        onPress={() => props.onOpenDestination?.('my_shelf')}/>}
    <Field label="Named setting" value={intent.setting.state === 'known' ? intent.setting.value : ''}
      editable={!saving} maxLength={60} onChangeText={value => onChange({ setting: value.trim() === '' ? { state: 'unknown' }
        : { state: 'known', value } })}/>
    <Button title="Named setting: Not sure" secondary disabled={saving}
      onPress={() => onChange({ setting: { state: 'unknown' } })}/>
    <Field label="Temperature number" value={temperatureNumber} keyboardType="number-pad" editable={!saving}
      onChangeText={value => {
        setTemperatureNumber(value);
        if (value === '') onChange({ temperature: { state: 'unknown' } });
        else if (intent.temperature.state === 'known') {
          const unit = intent.temperature.value.unit;
          const number = Number(value);
          if (!/^\d+$/u.test(value) || number < (unit === 'C' ? 30 : 86)
            || number > (unit === 'C' ? 300 : 572)) onChange({ temperature: { state: 'unknown' } });
          else temperature(value, unit);
        }
      }}/>
    <Choice label="Temperature unit" value={intent.temperature.state === 'known' ? intent.temperature.value.unit : 'unknown'}
      options={['unknown', 'C', 'F']} labels={{ unknown: 'Not sure', C: 'Celsius', F: 'Fahrenheit' }}
      onChange={value => value === 'unknown' ? onChange({ temperature: { state: 'unknown' } })
        : temperature(temperatureNumber, value as 'C' | 'F')} disabled={saving}/>
    <Button title="Temperature: Not sure" secondary disabled={saving}
      onPress={() => { setTemperatureNumber(''); onChange({ temperature: { state: 'unknown' } }); }}/>
    <Field label="Passes" value={intent.passes.state === 'known' ? String(intent.passes.value) : ''}
      keyboardType="number-pad" editable={!saving} onChangeText={value => numeric(value, 100, 'passes')}/>
    <Button title="Passes: Not sure" secondary disabled={saving}
      onPress={() => onChange({ passes: { state: 'unknown' } })}/>
    <Field label="Duration in minutes" value={intent.durationMinutes.state === 'known' ? String(intent.durationMinutes.value) : ''}
      keyboardType="number-pad" editable={!saving} onChangeText={value => numeric(value, 1440, 'durationMinutes')}/>
    <Button title="Duration: Not sure" secondary disabled={saving}
      onPress={() => onChange({ durationMinutes: { state: 'unknown' } })}/>
    <Choice label="Hair region" value={region} options={REGIONS} onChange={value => setRegion(value as typeof region)} disabled={saving}/>
    <Choice label="Strand section" value={segment} options={SEGMENTS} onChange={value => setSegment(value as typeof segment)} disabled={saving}/>
    <Button title="Add area" secondary disabled={saving || intent.zones.length >= 36} onPress={() => {
      if (!intent.zones.some(zone => zone.region === region && zone.segment === segment))
        onChange({ zones: [...intent.zones, { region, segment }] });
    }}/>
    <Text style={styles.body}>{intent.zones.length === 0 ? 'Areas not recorded yet.' : `${intent.zones.length} area(s) recorded.`}</Text>
    {intent.zones.map(zone => <Button key={`${zone.region}:${zone.segment}`}
      title={`Remove ${zone.region.replaceAll('_', ' ')} ${zone.segment.replaceAll('_', ' ')}`}
      accessibilityLabel={`Remove area: ${zone.region.replaceAll('_', ' ')} ${zone.segment.replaceAll('_', ' ')}`}
      secondary disabled={saving}
      onPress={() => onChange({ zones: intent.zones.filter(item => item.region !== zone.region || item.segment !== zone.segment) })}/>)}
    <Button title={saving ? 'Checking choices…' : 'Check heat choices'} disabled={saving} onPress={onAssess}/>
  </View>;
}
