import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, StyleSheet, Modal, Picker, Switch } from 'react-native';
import { useSupabase } from '../ui';

export const ActivityCorrectScreen = ({ activityId, onCorrect, userId }: { activityId: string, onCorrect: (correctedActivity: any) => void, userId: string }) => {
  const { supabase, user } = useSupabase();

  const [form, setForm] = useState({
    occurredAt: new Date().toISOString(),
    precision: 'exact_day',
    notes: '',
    correctionReason: '',
  });

  const loadActivity = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setForm({
      occurredAt: data.occurred_at,
      precision: data.precision,
      notes: data.notes || '',
      correctionReason: '',
    });
  };

  const handleCorrect = async () => {
    try {
      const { error } = await supabase
        .from('activity_revisions')
        .insert({
          activity_id: activityId,
          user_id: userId,
          base_revision: 1, // Would get from current revision
          changed_fields: { notes: form.notes },
          new_values: { notes: form.notes },
          effective_at: form.occurredAt,
          recorded_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Update the original activity with new values
      await supabase
        .from('activities')
        .update({ notes: form.notes })
        .eq('id', activityId);

      onCorrect(form);
      Alert.alert('Success', 'Activity corrected successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to correct activity');
    }
  };

  // Load activity data on mount
  useEffect(() => {
    loadActivity();
  }, [activityId]);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Correct Activity</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Occurred Date</Text>
        <Text style={styles.value}>{form.occurredAt ? new Date(form.occurredAt).toLocaleDateString() : 'N/A'}</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Precision</Text>
        <Text style={styles.value}>{form.precision}</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.textInput}
          multiline={true}
          value={form.notes}
          onChangeText={(text) => setForm(prev => ({ ...prev, notes: text }))}
          placeholder='Updated notes'
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Correction Reason</Text>
        <TextInput
          style={styles.textInput}
          multiline={true}
          value={form.correctionReason}
          onChangeText={(text) => setForm(prev => ({ ...prev, correctionReason: text }))}
          placeholder='Why is this correction needed?'
        />
      </View>

      <View style={styles.actions}>
        <Button title="Apply Correction" onPress={handleCorrect} color="#4F46E5" />
        <Button title="Cancel" onPress={() => {}} style={styles.cancelButton} />
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
  value: {
    fontSize: 14,
    color: '#111827',
  },
  textInput: {
    height: 80,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    padding: 10,
    backgroundColor: 'white',
    marginBottom: 5,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    marginLeft: 10,
    padding: 8,
    backgroundColor: '#F3F4F6',
  },
});