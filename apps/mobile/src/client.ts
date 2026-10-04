import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createClient } from '@supabase/supabase-js';
import { createChunkStorage, type SecureBackend } from './chunk-storage';
import { publicConfig } from './contracts';

let webMemory: Readonly<Record<string, string>> = {};
const backend: SecureBackend = Platform.OS === 'web' ? {
  getItem: async key => webMemory[key] ?? null,
  setItem: async (key, value) => { webMemory = {...webMemory, [key]: value}; },
  removeItem: async key => { webMemory = Object.fromEntries(Object.entries(webMemory).filter(([name]) => name !== key)); },
} : {
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
};
export const secureStorage = createChunkStorage(backend, Crypto.randomUUID);
export const config = publicConfig(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '');
export const supabase = config ? createClient(config.url, config.key, {
  auth: {
    flowType: 'pkce', storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    experimental: {appendPkceFlowIdToRedirects: true},
  },
}) : null;
export const RECOVERY_KEY = 'strandcue-recovery-pending';
export const RECOVERY_ACTIVE_KEY = 'strandcue-recovery-active-v3';
