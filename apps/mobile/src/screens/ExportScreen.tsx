import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { secureStorage } from '../client';
import {
  downloadExport,
  exportStatusMessage,
  recentAuthMessage,
  requestExport,
  statusExport,
  type ExportStatus,
} from '../export-api';
import { Button, styles } from '../ui';

const lastJobKey = (owner: string) => `strandcue-export-last-${owner}`;

export function ExportScreen({ owner }: { owner: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [operationId, setOperationId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void secureStorage.getItem(lastJobKey(owner)).then(saved => {
      if (alive.current && saved) {
        setJobId(saved);
        void refresh(saved);
      }
    }).catch(() => undefined);
    return () => { alive.current = false; };
  }, [owner]);

  const refresh = async (id: string) => {
    setBusy(true); setError('');
    try {
      const next = await statusExport(id);
      if (alive.current) setStatus(next);
    } catch (caught) {
      if (alive.current) setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Export status could not be loaded.'));
    } finally { if (alive.current) setBusy(false); }
  };

  const request = async () => {
    setBusy(true); setError('');
    try {
      // The same operation ID is reused while this screen lives so an
      // interrupted request retries identically instead of duplicating.
      const receipt = await requestExport(operationId, 'json');
      if (!alive.current) return;
      setJobId(receipt.jobId);
      await secureStorage.setItem(lastJobKey(owner), receipt.jobId);
      await refresh(receipt.jobId);
    } catch (caught) {
      if (!alive.current) return;
      setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Export could not be requested.'));
      setOperationId(Crypto.randomUUID());
    } finally { if (alive.current) setBusy(false); }
  };

  const download = async () => {
    if (!jobId) return;
    setBusy(true); setError('');
    try {
      await downloadExport(jobId);
      if (alive.current) setError('');
    } catch (caught) {
      if (alive.current) setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Download failed.'));
    } finally { if (alive.current) setBusy(false); }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text style={styles.heading}>Export your data</Text>
      <Text style={styles.body}>Download a complete copy of your record: Hair Passport and history, chemical services, activities, shelf, tools and catalogue facts. Exports are private to you.</Text>
      <Text style={styles.body}>Download access expires after 24 hours. Export files are removed within 7 days.</Text>
    </View>
    <Button title={busy ? 'Working…' : jobId ? 'Request a new export' : 'Create export'} disabled={busy} onPress={() => void request()} />
    {!!jobId && <View style={styles.card}>
      <Text style={styles.heading}>Latest export</Text>
      {status
        ? <Text style={styles.body}>{exportStatusMessage(status)}</Text>
        : <Text style={styles.body}>Status not loaded yet.</Text>}
      <Button title="Refresh status" secondary disabled={busy} onPress={() => void refresh(jobId)} />
      {status?.status === 'completed' && <Button title="Download export" disabled={busy} onPress={() => void download()} />}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

export default ExportScreen;
