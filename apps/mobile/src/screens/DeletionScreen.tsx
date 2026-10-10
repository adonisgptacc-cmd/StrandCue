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
  const pendingRequest = useRef<Readonly<{ operationId: string; reason: string | null }> | null>(null);
  const [retryPending, setRetryPending] = useState(false);
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
      // Freeze both the operation and its payload until a receipt is known.
      // A lost response must retry the exact request already sent.
      const payload = pendingRequest.current ?? { operationId, reason: reason.trim() ? reason : null };
      pendingRequest.current = payload;
      setRetryPending(true);
      await requestDeletion(payload.operationId, payload.reason);
      if (!alive.current) return;
      pendingRequest.current = null;
      setRetryPending(false);
      setOperationId(Crypto.randomUUID());
      setReason('');
      setConfirmText('');
      await refresh();
    } catch (caught) {
      if (!alive.current) return;
      setError(recentAuthMessage((caught as { message?: string })?.message ?? 'Deletion could not be requested.'));
    } finally { if (alive.current) setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setError('');
    try {
      await cancelDeletion();
      if (!alive.current) return;
      pendingRequest.current = null;
      setRetryPending(false);
      setOperationId(Crypto.randomUUID());
      setReason('');
      setConfirmText('');
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
    </>}
    {(!status || status.accountStatus === 'active') && <>
      <View style={styles.card}>
        <Text style={styles.label}>Reason (optional, at most 500 characters)</Text>
        <TextInput accessibilityLabel="Reason for deletion" value={reason} onChangeText={setReason} editable={!retryPending} maxLength={500} multiline style={styles.input} />
        <Text style={styles.label}>Type &quot;{CONFIRM_TEXT}&quot; to confirm</Text>
        <TextInput accessibilityLabel="Deletion confirmation" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" style={styles.input} />
      </View>
      {retryPending && <Text style={styles.body}>Your previous request may still be processing. Retry it or refresh the account status.</Text>}
      <Button title={busy ? 'Working…' : retryPending ? 'Retry deletion' : 'Delete my account'} disabled={busy} onPress={() => void request()} />
    </>}
    <Button title="Refresh status" secondary disabled={busy} onPress={() => void refresh()} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

export default DeletionScreen;
