// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, Switch } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

const CosmeticModeSchema = z.object({
  cosmeticMode: z.boolean(),
});

type CosmeticModeInput = z.infer<typeof CosmeticModeSchema>;

export const CosmeticModeScreen = () => {
  const { supabase, user } = useSupabase();

  const [cosmeticMode, setCosmeticMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadCosmeticMode = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('cosmetic_mode')
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      if (data) setCosmeticMode(data.cosmetic_mode ?? false);
    } catch (err: any) {
      console.error('Failed to load cosmetic mode:', err);
    }
  };

  useEffect(() => {
    loadCosmeticMode();
  }, [user?.id]);

  const handleToggle = async () => {
    const newValue = !cosmeticMode;
    setIsLoading(true);
    try {
      const validated = CosmeticModeSchema.parse({ cosmeticMode: newValue });

      const { error } = await supabase
        .from('profiles')
        .update({ cosmetic_mode: validated.cosmeticMode })
        .eq('user_id', user?.id);

      if (error) throw error;

      setCosmeticMode(newValue);
      Alert.alert('Updated', `Cosmetic mode ${newValue ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update cosmetic mode');
      setCosmeticMode(cosmeticMode); // Revert on error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cosmetic Record Boundary</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>What is Cosmetic Mode?</Text>
        <Text style={styles.infoText}>
          When enabled, your records are marked as cosmetic/visual only.
          No medical or functional claims will be inferred from these records.
          This helps maintain clear boundaries between cosmetic observations
          and medical/functional assessments.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Setting</Text>
      </View>

      <View style={styles.toggleContainer}>
        <View style={styles.toggleLabel}>
          <Text style={styles.toggleTitle}>Cosmetic Mode</Text>
          <Text style={styles.toggleDescription}>
            {cosmeticMode ? 'Enabled - Records marked as cosmetic only' : 'Disabled - Standard functional records'}
          </Text>
        </View>
        <Switch
          value={cosmeticMode}
          onValueChange={handleToggle}
          disabled={isLoading}
          trackColor={{ false: '#D1D5DB', true: '#4F46E5' }}
          thumbColor={cosmeticMode ? '#4F46E5' : '#FFFFFF'}
        />
      </View>

      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ Important</Text>
        <Text style={styles.warningText}>
          Cosmetic mode does not affect core app functionality.
          All features remain available regardless of this setting.
          This flag is for your reference and data classification only.
        </Text>
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
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleLabel: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
});

export default CosmeticModeScreen;
