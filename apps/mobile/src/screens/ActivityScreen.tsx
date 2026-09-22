import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, StyleSheet, ScrollView, DatePickerAndroid, Platform, Button, Picker, Switch } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

// Schema for activity form validation
const ActivityFormSchema = z.object({
  kind: z.enum(['wash', 'styling', 'other']),
  occurredAt: z.string().datetime(),
  precision: z.enum(['exact_day', 'exact_month', 'exact_year', 'unknown']),
  zones: z.record(z.string()).nullable().optional(),
  notes: z.string().max(2000).nullable(),
  status: z.enum(['active', 'abandoned']),
});

type ActivityFormValues = z.infer<typeof ActivityFormSchema>;

export const ActivityScreen = () => {
  const { supabase, user } = useSupabase();

  const [form, setForm] = useState<ActivityFormValues>({
    kind: 'wash',
    occurredAt: new Date().toISOString(),
    precision: 'exact_day',
    notes: null,
    status: 'active',
  });

  const [zones, setZones] = useState<Record<string, string>>({});
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Initialize form from today
  useEffect(() => {
    setForm({
      kind: 'wash',
      occurredAt: new Date().toISOString(),
      precision: 'exact_day',
      notes: null,
      status: 'active',
    });
  }, []);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    if (date) {
      setForm(prev => ({
        ...prev,
        occurredAt: date.toISOString(),
        precision: 'exact_day',
      }));
    }
    setDatePickerVisible(false);
  };

  const handleZonesAdd = (region: string, segment: string) => {
    const newZones = { ...zones, [`${region}:${segment}`]: `${region} - ${segment}` };
    setZones(newZones);
  };

  const handleZonesRemove = (key: string) => {
    const newZones = { ...zones };
    delete newZones[key];
    setZones(newZones);
  };

  const onSubmit = async () => {
    try {
      const validated = ActivityFormSchema.parse(form);
      
      const { error } = await supabase
        .from('activities')
        .insert({
          owner: user?.id,
          kind: validated.kind,
          occurred_at: validated.occurredAt,
          precision: validated.precision,
          zones: validated.zones,
          notes: validated.notes,
          status: validated.status,
        });

      if (error) throw error;

      Alert.alert('Success', 'Activity recorded successfully');
      setForm({
        kind: 'wash',
        occurredAt: new Date().toISOString(),
        precision: 'exact_day',
        notes: null,
        status: 'active',
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record activity');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Record New Activity</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Activity Kind</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.kind}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, kind: itemValue as any }))}
        >
          <Picker.Item label='Wash' value='wash' />
          <Picker.Item label='Styling' value='styling' />
          <Picker.Item label='Other' value='other' />
        </Picker>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Occurred Date</Text>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>{form.occurredAt ? new Date(form.occurredAt).toLocaleDateString() : 'Today'}</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerVisible(true)}>
            <Text style={styles.dateButtonText}>Select Date</Text>
          </TouchableOpacity>
        </View>
        <Modal
          visible={isDatePickerVisible}
          animationType="fade"
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <DatePickerAndroid
            date={selectedDate || new Date()}
            mode="date"
            onDateChange={handleDateChange}
          />
        </Modal>
        <TouchableOpacity style={styles.todayButton} onPress={() => {
          const today = new Date();
          handleDateChange(today);
        }}>
          <Text style={styles.todayText}>Today</Text>
        </TouchableOpacity>
      </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Precision</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.precision}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, precision: itemValue as any }))}
        >
          <Picker.Item label='Exact day' value='exact_day' />
          <Picker.Item label='Exact month' value='exact_month' />
          <Picker.Item label='Exact year' value='exact_year' />
          <Picker.Item label='Unknown' value='unknown' />
        </Picker>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Zones (optional)</Text>
        <View style={styles.zonesContainer}>
          {Object.entries(zones).map(([key, value], index) => (
            <View key={index} style={styles.zoneRow}>
              <Text style={styles.zoneLabel}>{key}</Text>
              <Text style={styles.zoneValue}>{value}</Text>
              <TouchableOpacity style={styles.removeButton} onPress={() => handleZonesRemove(key)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.addRow}>
            <TouchableOpacity onPress={() => handleZonesAdd('roots', 'roots')}>
              <Text style={styles.addText}>Add roots</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleZonesAdd('ends', 'ends')}>
              <Text style={styles.addText}>Add ends</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Notes (max 2000 chars)</Text>
        <TextInput
          style={styles.textInput}
          multiline={true}
          value={form.notes || ''}
          onChangeText=(text) => setForm(prev => ({ ...prev, notes: text }))
          placeholder='Enter notes about the activity...'
          maxLength={2000}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Status</Text>
        <Picker
          style={styles.picker}
          selectedValue={form.status}
          onValueChange={(itemValue: string) => setForm(prev => ({ ...prev, status: itemValue as any }))}
        >
          <Picker.Item label='Active' value='active' />
          <Picker.Item label='Abandoned' value='abandoned' />
        </Picker>
      </View>

      <View style={styles.actions}>
        <Button title="Record Activity" onPress={onSubmit} color="#4F46E5" />
      </View>
    </ScrollView>
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
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'white',
  },
  dateText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  dateButton: {
    marginLeft: 10,
  },
  dateButtonText: {
    fontSize: 12,
    color: '#6366F1',
  },
  todayButton: {
    marginTop: 5,
    padding: 5,
  },
  todayText: {
    fontSize: 12,
    color: '#6366F1',
    textDecorationLine: 'underline',
  },
  zonesContainer: {
    marginTop: 5,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 5,
  },
  zoneLabel: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },
  zoneValue: {
    flex: 2,
    fontSize: 12,
    color: '#111827',
  },
  removeButton: {
    marginLeft: 5,
    padding: 2,
  },
  removeText: {
    fontSize: 10,
    color: '#EF4444',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
  },
  addText: {
    fontSize: 10,
    color: '#6366F1',
    marginRight: 5,
  },
  textInput: {
    height: 100,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    padding: 10,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  actions: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
});