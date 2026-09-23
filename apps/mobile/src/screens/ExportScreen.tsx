// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView, ActivityIndicator, Picker, Platform } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

const ExportFormatSchema = z.enum(['json', 'csv']);

type ExportFormat = z.infer<typeof ExportFormatSchema>;

const ExportJobSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  format: z.enum(['json', 'csv']),
  file_url: z.string().url().nullable().optional(),
  file_size_bytes: z.number().int().nonnegative().nullable().optional(),
  record_count: z.number().int().nonnegative().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime(),
});

type ExportJob = z.infer<typeof ExportJobSchema>;

const ExportJobListResponseSchema = z.object({
  jobs: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    format: z.enum(['json', 'csv']),
    file_url: z.string().url().nullable().optional(),
    file_size_bytes: z.number().int().nonnegative().nullable().optional(),
    record_count: z.number().int().nonnegative().nullable().optional(),
    error_message: z.string().nullable().optional(),
    created_at: z.string().datetime(),
    started_at: z.string().datetime().nullable().optional(),
    completed_at: z.string().datetime().nullable().optional(),
    expires_at: z.string().datetime(),
  })),
});

type ExportJobListResponse = z.infer<typeof ExportJobListResponseSchema>;

export const ExportScreen = () => {
  const { supabase, user } = useSupabase();

  const [format, setFormat] = useState<ExportFormat>('json');
  const [isCreating, setIsCreating] = useState(false);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase
        .rpc('list_export_jobs', { p_limit: 20, p_offset: 0 });

      if (error) throw error;

      const validated = ExportJobListResponseSchema.parse(data);
      setJobs(validated.jobs);
    } catch (err: any) {
      console.error('Failed to load export jobs:', err);
      Alert.alert('Error', 'Failed to load export history');
    } finally {
      setIsLoadingJobs(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [user?.id]);

  const handleCreateExport = async () => {
    setIsCreating(true);
    try {
      const validated = ExportFormatSchema.parse(format);

      const { data, error } = await supabase
        .rpc('create_export_job', { p_format: validated });

      if (error) throw error;

      Alert.alert('Export Started', 'Your export is being prepared. Check back shortly for the download link.');
      loadJobs(); // Refresh list
    } catch (err: any) {
      if (err.message?.includes('recent-auth-required')) {
        Alert.alert('Recent Login Required', 'Please log in again to request an export for security reasons.');
      } else {
        Alert.alert('Error', err.message || 'Failed to create export');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadJobs();
  };

  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed': return styles.statusCompleted;
      case 'processing': return styles.statusProcessing;
      case 'pending': return styles.statusPending;
      case 'failed': return styles.statusFailed;
      default: return styles.statusDefault;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Ready';
      case 'processing': return 'Processing...';
      case 'pending': return 'Queued';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_export_download_info', { p_job_id: jobId });

      if (error) throw error;

      // In a real app, this would open the download URL in a browser
      // For React Native, you might use Linking.openURL(data.download_url)
      Alert.alert('Download Ready', `Your ${data.format.toUpperCase()} export is ready to download.`, [
        { text: 'OK', onPress: () => {} },
        { text: 'Copy Link', onPress: () => {} },
      ]);
    } catch (err: any) {
      if (err.message?.includes('download-link-expired')) {
        Alert.alert('Link Expired', 'This download link has expired. Please request a new export.');
      } else {
        Alert.alert('Error', err.message || 'Failed to get download link');
      }
    }
  };

  const handleRetry = async (jobId: string) => {
    // For failed jobs, we create a new export with the same format
    try {
      const job = jobs.find(j => j.id === jobId);
      if (!job) return;

      const { data, error } = await supabase
        .rpc('create_export_job', { p_format: job.format });

      if (error) throw error;

      Alert.alert('Export Restarted', 'A new export has been queued with the same format.');
      loadJobs();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to retry export');
    }
  };

  if (isLoadingJobs && jobs.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading export history...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} refreshControl={
      <ScrollView.RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        colors={['#4F46E5']}
      />
    } contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export Your Data</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Export Your StrandCue Data</Text>
        <Text style={styles.infoText}>
          Download a complete copy of your data including Passport, Shelf, Tools, Activities, Services, and catalogue provenance. 
          Exports are private, expire after 24 hours, and are automatically deleted after 7 days.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create New Export</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Export Format</Text>
        <Picker
          style={styles.picker}
          selectedValue={format}
          onValueChange={(itemValue: string) => setFormat(itemValue as ExportFormat)}
        >
          <Picker.Item label='JSON (complete data with structure)' value='json' />
          <Picker.Item label='CSV (spreadsheet-friendly, separate files)' value='csv' />
        </Picker>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.submitButton, isCreating && styles.submitButtonDisabled]}
          onPress={handleCreateExport}
          disabled={isCreating}
        >
          <Text style={styles.submitButtonText}>
            {isCreating ? 'Creating Export...' : 'Create Export'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sectionTitle}>Export History</Text>
          <TouchableOpacity onPress={handleRefresh} disabled={refreshing}>
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Exports Yet</Text>
          <Text style={styles.emptyText}>Create your first export to get started</Text>
        </View>
      ) : (
        <View style={styles.jobsList}>
          {jobs.map((job) => (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <View style={styles.jobMeta}>
                  <Text style={styles.jobFormat}>{job.format.toUpperCase()}</Text>
                  <Text style={styles.jobCreated}>{formatDate(job.created_at)}</Text>
                </View>
                <View style={[styles.jobStatus, getStatusStyle(job.status)]}>
                  <Text style={styles.jobStatusText}>{getStatusText(job.status)}</Text>
                </View>
              </View>

              <View style={styles.jobDetails}>
                <Text style={styles.jobDetail}>Status: {job.status}</Text>
                {job.record_count !== null && (
                  <Text style={styles.jobDetail}>Records: {job.record_count}</Text>
                )}
                {job.file_size_bytes !== null && (
                  <Text style={styles.jobDetail}>Size: {formatFileSize(job.file_size_bytes)}</Text>
                )}
                {job.started_at && (
                  <Text style={styles.jobDetail}>Started: {formatDate(job.started_at)}</Text>
                )}
                {job.completed_at && (
                  <Text style={styles.jobDetail}>Completed: {formatDate(job.completed_at)}</Text>
                )}
                {job.expires_at && (
                  <Text style={styles.jobDetail}>Expires: {formatDate(job.expires_at)}</Text>
                )}
                {job.error_message && (
                  <Text style={styles.jobError}>Error: {job.error_message}</Text>
                )}
              </View>

              <View style={styles.jobActions}>
                {job.status === 'completed' && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDownload(job.id)}
                  >
                    <Text style={styles.actionButtonText}>Download</Text>
                  </TouchableOpacity>
                )}
                {job.status === 'failed' && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.retryButton]}
                    onPress={() => handleRetry(job.id)}
                  >
                    <Text style={styles.actionButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
                {job.status === 'pending' || job.status === 'processing' ? (
                  <Text style={styles.waitingText}>Processing...</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
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
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
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
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
  },
  actions: {
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  jobsList: {
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  jobMeta: {
    flex: 1,
  },
  jobFormat: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  jobCreated: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  jobStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  statusCompleted: {
    backgroundColor: '#DCFCE7',
  },
  statusProcessing: {
    backgroundColor: '#FEF3C7',
  },
  statusPending: {
    backgroundColor: '#E0E7FF',
  },
  statusFailed: {
    backgroundColor: '#FEE2E2',
  },
  jobStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  statusProcessingText: {
    color: '#92400E',
  },
  statusPendingText: {
    color: '#3730A3',
  },
  statusFailedText: {
    color: '#991B1B',
  },
  jobDetails: {
    gap: 4,
    marginBottom: 12,
  },
  jobDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  jobError: {
    fontSize: 12,
    color: '#EF4444',
  },
  jobActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#FEF3C7',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  retryButtonText: {
    color: '#92400E',
  },
  waitingText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 10,
  },
});

export default ExportScreen;