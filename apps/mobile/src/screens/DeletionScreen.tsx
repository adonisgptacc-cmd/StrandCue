import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  cancelDeletion,
  deletionStatusMessage,
  recentAuthMessage,
  requestDeletion,
  statusDeletion,
  type DeletionStatus,
} from '../deletion-api';
import { Button, styles } from '../ui';

const CONFIRM_TEXT = 'DELETE MY ACCOUNT';

export function DeletionScreen() {
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [operationId, setOperationId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const generation = useRef(0);
  const loadStatus = useCallback(() => {
    const request = ++generation.current;
    return statusDeletion().then(next => {
      if (alive.current && request === generation.current) setStatus(next);
    }, (caught: unknown) => {
      if (alive.current && request === generation.current) setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Account status could not be loaded.'));
    }).finally(() => { if (alive.current && request === generation.current) setBusy(false); });
  }, []);
  const refresh = () => {
    setBusy(true); setError('');
    return loadStatus();
  };
  const invalidate = useCallback(() => {
    alive.current = false;
    ++generation.current;
  }, []);
  useEffect(() => {
    alive.current = true;
    void loadStatus();
    return invalidate;
  }, [loadStatus, invalidate]);

  const request = async () => {
    if (confirmText !== CONFIRM_TEXT) {
      setError(`Type "${CONFIRM_TEXT}" to confirm.`);
      return;
    }
    setBusy(true); setError('');
    try {
      // The same operation ID is reused while this screen lives so an
      // interrupted request retries identically instead of duplicating.
      await requestDeletion(operationId, reason.trim() ? reason : null);
      if (!alive.current) return;
      setReason('');
      setConfirmText('');
      await refresh();
    } catch (caught) {
      if (!alive.current) return;
      setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Deletion could not be requested.'));
      setOperationId(Crypto.randomUUID());
    } finally { if (alive.current) setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setError('');
    try {
      await cancelDeletion();
      if (!alive.current) return;
      await refresh();
    } catch (caught) {
      if (alive.current) setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Deletion could not be cancelled.'));
    } finally { if (alive.current) setBusy(false); }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text style={styles.heading}>Delete account</Text>
      <Text style={styles.body}>Deleting removes your Hair Passport, services, activities, shelf, tools and history. Catalogue facts stay. This cannot be undone after purging runs.</Text>
      {status && <Text style={styles.body}>{deletionStatusMessage(status)}</Text>}
    </View>
    {status?.accountStatus === 'deleting' && <>
      <Button title={busy ? 'Working…' : 'Cancel deletion'} disabled={busy} onPress={() => void cancel()} />
      <Button title="Refresh status" secondary disabled={busy} onPress={() => void refresh()} />
    </>}
    {(!status || status.accountStatus === 'active') && <>
      <View style={styles.card}>
        <Text style={styles.label}>Reason (optional, at most 500 characters)</Text>
        <TextInput accessibilityLabel="Reason for deletion" value={reason} onChangeText={setReason} maxLength={500} multiline style={styles.input} />
        <Text style={styles.label}>Type &quot;{CONFIRM_TEXT}&quot; to confirm</Text>
        <TextInput accessibilityLabel="Deletion confirmation" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" style={styles.input} />
      </View>
      <Button title={busy ? 'Working…' : 'Delete my account'} disabled={busy} onPress={() => void request()} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

export default DeletionScreen;
