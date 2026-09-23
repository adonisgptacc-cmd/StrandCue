// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView, TextInput, Switch } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

const DeletionReasonSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

type DeletionReasonInput = z.infer<typeof DeletionReasonSchema>;

export const DeletionScreen = () => {
  const { supabase, user } = useSupabase();

  const [status, setStatus] = useState<'active' | 'deleting' | 'deleted' | 'loading'>('loading');
  const [tombstone, setTombstone] = useState<{ deleted_at: string; reason: string } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadStatus = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_deletion_status');

      if (error) throw error;

      setStatus(data.account_status);
      if (data.tombstone_exists) {
        setTombstone({
          deleted_at: data.deleted_at,
          reason: data.deletion_reason,
        });
      }
    } catch (err: any) {
      console.error('Failed to load deletion status:', err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [user?.id]);

  const handleDelete = async () => {
    const validated = DeletionReasonSchema.safeParse({ reason });
    if (!validated.success) {
      Alert.alert('Error', 'Please provide a reason for deletion (max 500 characters)');
      return;
    }

    if (confirmText !== 'DELETE MY ACCOUNT') {
      Alert.alert('Confirmation Required', 'Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const { data, error } = await supabase
        .rpc('request_account_deletion', { p_reason: validated.data.reason });

      if (error) throw error;

      Alert.alert('Deletion Initiated', data.message || 'Account deletion has been initiated. Access is now blocked.');
      setStatus('deleting');
    } catch (err: any) {
      if (err.message?.includes('recent-auth-required')) {
        Alert.alert('Recent Login Required', 'Please log in again to confirm account deletion for security reasons.');
      } else {
        Alert.alert('Error', err.message || 'Failed to initiate deletion');
      }
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const { data, error } = await supabase
        .rpc('cancel_account_deletion');

      if (error) throw error;

      Alert.alert('Cancelled', data.message || 'Account deletion cancelled. Full access restored.');
      setStatus('active');
      setTombstone(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to cancel deletion');
    } finally {
      setIsCancelling(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading account status...</Text>
      </View>
    );
  }

  if (status === 'deleted') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.deletedContainer}>
          <Text style={styles.deletedTitle}>Account Deleted</Text>
          <Text style={styles.deletedText}>
            This account has been permanently deleted. All data has been purged.
          </Text>
          {tombstone && (
            <View style={styles.tombstoneInfo}>
              <Text style={styles.tombstoneLabel}>Deleted:</Text>
              <Text style={styles.tombstoneValue}>{new Date(tombstone.deleted_at).toLocaleString()}</Text>
              <Text style={styles.tombstoneLabel}>Reason:</Text>
              <Text style={styles.tombstoneValue}>{tombstone.reason}</Text>
            </View>
          )}
          <View style={styles.restoreInfo}>
            <Text style={styles.restoreTitle}>Need to restore?</Text>
            <Text style={styles.restoreText}>
              Contact support at support@strandcue.com. 
              Restore is only possible within a limited window and requires admin approval.
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (status === 'deleting') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.warningContainer}>
          <Text style={styles.warningTitle}>⚠️ Deletion In Progress</Text>
          <Text style={styles.warningText}>
            Your account deletion has been initiated. Access is blocked.
            The purge process is running asynchronously.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Purge Order</Text>
          <Text style={styles.purgeText}>
            1. Export jobs → 2. Sessions → 3. Auth events → 4. Support requests → 5. User data → 6. Auth identity
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Can I cancel?</Text>
          <Text style={styles.infoText}>
            You can cancel deletion only while the purge is in progress.
            Once the purge completes, the account is permanently deleted.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.cancelButton, isCancelling && styles.cancelButtonDisabled]}
          onPress={handleCancel}
          disabled={isCancelling}
        >
          <Text style={styles.cancelButtonText}>
            {isCancelling ? 'Cancelling...' : 'Cancel Deletion'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Active status - show deletion form
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delete Account</Text>
      </View>

      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ Permanent Action</Text>
        <Text style={styles.warningText}>
          Deleting your account will permanently remove all your data including:
          Passport, Shelf, Tools, Activities, Services, and all history.
          This action cannot be undone after the purge completes.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reason for Deletion</Text>
      </View>

      <View style={styles.formGroup}>
        <TextInput
          style={styles.textArea}
          value={reason}
          onChangeText={setReason}
          placeholder='Why are you deleting your account? (required, max 500 chars)'
          multiline={true}
          maxLength={500}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Confirmation</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.confirmLabel}>Type "DELETE MY ACCOUNT" to confirm</Text>
        <TextInput
          style={styles.textInput}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder='DELETE MY ACCOUNT'
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.submitButton, isDeleting && styles.submitButtonDisabled]}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          <Text style={styles.submitButtonText}>
            {isDeleting ? 'Deleting...' : 'Delete My Account'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>
          After confirmation, access is immediately blocked. The purge runs asynchronously.
          You can cancel while status is "deleting". After purge completes, data is permanently removed.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  deletedContainer: {
    alignItems: 'center',
    padding: 40,
  },
  deletedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 16,
  },
  deletedText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  tombstoneInfo: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  tombstoneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 4,
  },
  tombstoneValue: {
    fontSize: 14,
    color: '#991B1B',
    marginBottom: 12,
  },
  restoreInfo: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  restoreTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  restoreText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },
  warningContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
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
  purgeText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
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
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 14,
    color: '#991B1B',
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  textArea: {
    height: 120,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
  textInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 5,
  },
  actions: {
    marginTop: 20,
  },
  submitButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerNote: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
});

export default DeletionScreen;