import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.'
  );
}

const nativeAuthStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // Web only: let the client read confirmation tokens out of the URL so the
    // /auth/confirm callback can complete the sign-in. Native handles deep
    // links explicitly in the confirm route instead.
    detectSessionInUrl: Platform.OS === 'web',
    ...(Platform.OS === 'web' ? {} : { storage: nativeAuthStorage }),
  },
});

/**
 * Storage keys Supabase uses to persist the auth session.
 * Format is `sb-<project-ref>-auth-token` (+ a code-verifier key on native).
 */
export function getSupabaseStorageKeys(): string[] {
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];

  if (!projectRef) return [];

  return [
    `sb-${projectRef}-auth-token`,
    `sb-${projectRef}-auth-token-code-verifier`,
  ];
}

/**
 * Removes the persisted auth session so it cannot be restored after logout.
 *
 * Web: localStorage. Native: the secure storage adapter used by the client.
 */
export async function clearStoredSession(): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);

      if (key && key.startsWith('sb-')) {
        keys.push(key);
      }
    }

    keys.forEach((key) => localStorage.removeItem(key));

    return;
  }

  await Promise.all(
    getSupabaseStorageKeys().map((key) =>
      nativeAuthStorage.removeItem(key).catch(() => undefined)
    )
  );
}
