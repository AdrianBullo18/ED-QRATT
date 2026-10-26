import { Stack } from 'expo-router';

import { AuthProvider } from '@/contexts/AuthContext';

/**
 * Root stack layout.
 *
 * Every route here is file-based and auto-detected by Expo Router from the
 * `app/` tree. Manual <Stack.Screen> entries are deliberately omitted: when a
 * manual declaration does not match an auto-detected route, Expo Router emits
 * "No route named ... exists in nested children" warnings.
 *
 * Auto-detected routes:
 *   app/index.tsx                      -> /
 *   app/sign-in.tsx                    -> /sign-in
 *   app/register.tsx                   -> /register
 *   app/teacher-application.tsx        -> /teacher-application
 *   app/auth/confirm.tsx               -> /auth/confirm
 *   app/(tabs)/...                     -> /(tabs)
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
