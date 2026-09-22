import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, StyleSheet, Modal, Picker, Switch } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

// Schema for heat event form validation
const HeatEventFormSchema = z.object({
  method: z.enum(['dryer', 'heated-air-brush', 'air-styler', 'flat-iron', 'curling-iron', 'hot-comb', 'hood-dryer', 'steam-straighter', 'unheated-rollers', 'diffuser', 'other']),
  toolVersionId: z.string().uuid().nullable(),
  temperature: z.number().finite().nullable(),
  passes: z.number().finite().int().nullable(),
  durationMinutes: z.number().finite().int().nullable(),
  wetDryState: z.enum(['wet', 'dry', 'unknown']),
});

type HeatEventFormValues = z.infer<typeof HeatEventFormSchema>;

export const HeatEventForm = ({ onSubmit, activityId }: { onSubmit: (values: HeatEventFormValues) => void; activityId: string }) => {
  const { supabase } = useSupabase();

  const [form, setForm] = useState<HeatEventFormValues>({
    method: 'blow-dryer',
    toolVersionId: null,
    temperature: null,
    passes: null,
    durationMinutes: null,
    wetDryState: 'dry',
  });

  const handleSubmit = async () => {
    try {
      const validated = HeatEventFormSchema.parse(form);
      
      const { error } = await supabase
        .from('heat_events')
        .insert({
          activity_id: activityId,
          user_id: user?.id,
          method: validated.method,
          tool_version: validated.toolVersionId,
          temperature: validated.temperature,
          passes: validated.passes,
          duration_minutes: validated.durationMinutes,
          wet_dry_state: validated.wetDryState,
        });

      if (error) throw error;

      Alert.alert('Success', 'Heat event recorded successfully');
      setForm({
        method: 'blow-dryer',
        toolVersionId: null,
        temperature: null,
        passes: null,
        durationMinutes: null,
        wetDryState: 'dry',
      });
      onSubmit(validated);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record heat event');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Record Heat Event</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Method</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.method}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, method: itemValue as any }))}
        >
          <Picker.Item label='Blow dryer' value='blow-dryer' />
          <Picker.Item label='Heated air brush' value='heated-air-brush' />
          <Picker.Item label='Air styler' value='air-styler' />
          <Picker.Item label='Flat iron' value='flat-iron' />
          <Picker.Item label='Curling iron' value='curling-iron' />
          <Picker.Item label='Hot comb' value='hot-comb' />
          <Picker.Item label='Hood dryer' value='hood-dryer' />
          <Picker.Item label='Steam straightener' value='steam-straighter' />
          <Picker.Item label='Unheated rollers' value='unheated-rollers' />
          <Picker.Item label='Diffuser' value='diffuser' />
          <Picker.Item label='Other' value='other' />
        </Picker>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Tool Version</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.toolVersionId || ''}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, toolVersionId: itemValue || null }))}
        >
          <Picker.Item label='Select tool' value='' />
          {/* Tool versions would be populated from Supabase in a real app */}
        </Picker>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Temperature (°C)</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          value={form.temperature !== null ? form.temperature.toString() : ''}
          onChangeText={(text) => {
            const num = text ? parseFloat(text) : null;
            setForm(prev => ({ ...prev, temperature: num }));
          }}
          placeholder='e.g. 180'
          disabled={form.toolVersionId === null}
        />
        <Text style={styles.hint}>Disabled when no tool selected</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Passes</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          value={form.passes !== null ? form.passes.toString() : ''}
          onChangeText={(text) => {
            const num = text ? parseInt(text, 10) : null;
            setForm(prev => ({ ...prev, passes: num }));
          }}
          placeholder='e.g. 3'
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Duration (minutes)</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="numeric"
          value={form.durationMinutes !== null ? form.durationMinutes.toString() : ''}
          onChangeText={(text) => {
            const num = text ? parseInt(text, 10) : null;
            setForm(prev => ({ ...prev, durationMinutes: num }));
          }}
          placeholder='e.g. 20'
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Hair State</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.wetDryState}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, wetDryState: itemValue as any }))}
        >
          <Picker.Item label='Wet' value='wet' />
          <Picker.Item label='Dry' value='dry' />
          <Picker.Item label='Unknown' value='unknown' />
        </Picker>
      </View>

      <View style={styles.actions}>
        <Button title="Record Heat Event" onPress={handleSubmit} color="#4F46E5" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  section: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 5,
  },
  picker: {
    height: 50,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    paddingHorizontal: 10,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    padding: 10,
    backgroundColor: 'white',
    marginBottom: 5,
    keyboardType: 'default',
  },
  hint: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 3,
  },
  actions: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
});