import type { AuthError, Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
  /**
   * `'true'` when a teacher applicant signs up without an active session
   * (email confirmation enabled). Sign-in uses it to route the applicant
   * straight to /teacher-application; it is cleared once the screen opens.
   */
  pending_teacher_application?: string | null;
};

export type AuthActionResult = {
  session: Session | null;
  error: AuthError | null;
};

/**
 * Deep-link scheme declared in app.json. Confirmation links land on the
 * /auth/confirm route through this scheme on iOS and Android.
 */
export const AUTH_SCHEME = 'qr-attendance';

/**
 * Redirect target for Supabase email links.
 *
 * Must match an entry in Supabase Dashboard -> Authentication -> URL
 * Configuration -> Redirect URLs, otherwise Supabase silently drops the link.
 */
export function getAuthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/confirm`;
  }

  return `${AUTH_SCHEME}://auth/confirm`;
}

export async function signUp(
  email: string,
  password: string,
  profile: SignUpProfile
): Promise<AuthActionResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,

    options: {
      emailRedirectTo: getAuthRedirectUrl(),

      data: {
        full_name: profile.full_name,
        role: profile.role,
        pending_teacher_application: profile.pending_teacher_application ?? null,
      },
    },
  });

  return {
    session: data.session,
    error,
  };
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthActionResult> {
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

  return {
    session: data.session,
    error,
  };
}

/**
 * Re-sends the signup confirmation email.
 *
 * Deliberately returns the same neutral message whether or not the address is
 * registered, so this cannot be used to enumerate accounts.
 */
export async function resendSignupConfirmation(
  email: string
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: getAuthRedirectUrl() },
  });

  return { error };
}

export async function signOut(): Promise<{
  error: AuthError | null;
}> {
  return supabase.auth.signOut();
}
