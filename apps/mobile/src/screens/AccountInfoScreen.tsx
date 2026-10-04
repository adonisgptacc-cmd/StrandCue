// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ScrollView, Switch } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

const AccountInfoSchema = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  eligible: z.boolean(),
  country: z.string(),
  currency: z.string(),
  temperatureUnit: z.string(),
  accountStatus: z.enum(['active', 'deleting']),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable().optional(),
  lastSessionId: z.string().uuid().nullable().optional(),
  analyticsConsent: z.boolean(),
  cosmeticMode: z.boolean(),
});

type AccountInfo = z.infer<typeof AccountInfoSchema>;

const SessionInfoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().optional(),
});

type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const AccountInfoScreen = () => {
  const { supabase, user } = useSupabase();

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAccountInfo = async () => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (profileError) throw profileError;

      // Get email from auth (requires admin or specific setup)
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const email = authData?.user?.email ?? '';

      const validated = AccountInfoSchema.parse({
        ...profile,
        email,
      });

      setAccountInfo(validated);
    } catch (err: any) {
      console.error('Failed to load account info:', err);
    }
  };

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const validated = z.array(SessionInfoSchema).parse(data ?? []);
      setSessions(validated);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([loadAccountInfo(), loadSessions()]);
      setIsLoading(false);
    };
    loadAll();
  }, [user?.id]);

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('session_id', sessionId);

      if (error) throw error;
      Alert.alert('Success', 'Session revoked');
      // Reload sessions
      const { data, error: reloadError } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!reloadError && data) {
        setSessions(z.array(SessionInfoSchema).parse(data));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to revoke session');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading account info...</Text>
      </View>
    );
  }

  if (!accountInfo) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load account information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>User ID</Text>
          <Text style={styles.infoValue}>{accountInfo.userId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Username</Text>
          <Text style={styles.infoValue}>{accountInfo.username}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{accountInfo.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>{accountInfo.accountStatus}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Account Revision</Text>
          <Text style={styles.infoValue}>{accountInfo.revision}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created</Text>
          <Text style={styles.infoValue}>{formatDate(accountInfo.createdAt)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Last Login</Text>
          <Text style={styles.infoValue}>{formatDate(accountInfo.lastLoginAt)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Country / Currency</Text>
          <Text style={styles.infoValue}>{accountInfo.country} / {accountInfo.currency}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Temperature Unit</Text>
          <Text style={styles.infoValue}>{accountInfo.temperatureUnit}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
      </View>

      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Text style={styles.settingTitle}>Analytics Consent</Text>
            <Text style={styles.settingDesc}>Allow anonymous usage analytics</Text>
          </View>
          <Switch
            value={accountInfo.analyticsConsent}
            onValueChange={async (value) => {
              try {
                await supabase.from('profiles').update({ analytics_consent: value }).eq('user_id', user?.id);
                setAccountInfo({ ...accountInfo, analyticsConsent: value });
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to update analytics consent');
              }
            }}
            trackColor={{ false: '#D1D5DB', true: '#4F46E5' }}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Text style={styles.settingTitle}>Cosmetic Mode</Text>
            <Text style={styles.settingDesc}>Mark records as cosmetic/visual only</Text>
          </View>
          <Switch
            value={accountInfo.cosmeticMode}
            onValueChange={async (value) => {
              try {
                await supabase.from('profiles').update({ cosmetic_mode: value }).eq('user_id', user?.id);
                setAccountInfo({ ...accountInfo, cosmeticMode: value });
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to update cosmetic mode');
              }
            }}
            trackColor={{ false: '#D1D5DB', true: '#4F46E5' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Sessions</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active sessions found</Text>
        </View>
      ) : (
        <View style={styles.sessionsList}>
          {sessions.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionId}>{session.sessionId.slice(0, 8)}...</Text>
                <View style={styles.sessionStatus}>
                  <Text style={[
                    styles.sessionStatusText,
                    session.revoked_at ? styles.revoked : styles.active
                  ]}>
                    {session.revoked_at ? 'Revoked' : 'Active'}
                  </Text>
                </View>
              </View>
              <View style={styles.sessionDetails}>
                <Text style={styles.sessionDetail}>Created: {formatDate(session.createdAt)}</Text>
                <Text style={styles.sessionDetail}>Last active: {formatDate(session.lastActiveAt)}</Text>
                <Text style={styles.sessionDetail}>Expires: {formatDate(session.expiresAt)}</Text>
                {session.ipAddress && <Text style={styles.sessionDetail}>IP: {session.ipAddress}</Text>}
              </View>
              {!session.revoked_at && (
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => revokeSession(session.sessionId)}
                >
                  <Text style={styles.revokeButtonText}>Revoke Session</Text>
                </TouchableOpacity>
              )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 12,
    color: '#6B7280',
  },
  sessionsList: {
    gap: 12,
  },
  sessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionId: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#6B7280',
  },
  sessionStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  active: {
    backgroundColor: '#DCFCE7',
  },
  revoked: {
    backgroundColor: '#FEE2E2',
  },
  sessionStatusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#166534',
  },
  revoked: {
    color: '#991B1B',
  },
  sessionDetails: {
    gap: 4,
    marginBottom: 12,
  },
  sessionDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  revokeButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  revokeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EF4444',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});

export default AccountInfoScreen;