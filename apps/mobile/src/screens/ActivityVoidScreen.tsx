import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, StyleSheet, Modal, Button, Picker, Switch } from 'react-native';
import { useSupabase } from '../ui';

export const ActivityVoidScreen = ({ activityId, onVoid }: { activityId: string, onVoid: (voided: boolean) => void }) => {
  const { supabase, user } = useSupabase();

  // Shared helper: check if activity can be voided
  const checkCanVoid = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('occurred_at, status')
      .eq('id', activityId)
      .single();

    if (error) {
      setCanVoid(false);
      return;
    }

    const occurredAt = new Date(data.occurred_at);
    const now = new Date();
    const status = data.status;

    // Can void if: event is in the past AND status is not already voided
    setCanVoid(occurredAt < now && status !== 'voided');
  };

  const [canVoid, setCanVoid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkCanVoid();
  }, [activityId]);

  const handleVoid = async () => {
    setIsLoading(true);
    try {
      await supabase
        .from('activities')
        .update({ status: 'voided', notes: `Voided at ${new Date().toISOString()}` })
        .eq('id', activityId);

      onVoid(true);
      Alert.alert('Success', 'Activity voided successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to void activity');
    } finally {
      setIsLoading(false);
    }
  };

  if (!canVoid) {
    return (
      <View style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Void Activity</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.infoText}>This activity cannot be voided.</Text>
          <Text style={styles.infoText}>• Events in the future cannot be voided</Text>
          <Text style={styles.infoText}>• Already voided events cannot be changed</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Void Activity</Text>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningText}>⚠️ This will mark the activity as voided.</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Activity Details</Text>
        <Text style={styles.value}>Status: Active</Text>
        <Text style={styles.value}>Occurred: Will use original date</Text>
      </View>

      <View style={styles.actions}>
        <Button title="Void Activity" onPress={handleVoid} color="#EF4444" disabled={isLoading} />
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
  info: {
    marginVertical: 20,
    padding: 15,
    backgroundColor: '#FEF3CF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  infoText: {
    fontSize: 14,
    color: '#92400E',
    marginBottom: 5,
  },
  warning: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#FEF3CF', }