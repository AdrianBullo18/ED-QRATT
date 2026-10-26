import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type Status = 'loading' | 'success' | 'error';

type Verdict = {
  status: Exclude<Status, 'loading'>;
  message: string;
};

function decode(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Maps Supabase error codes onto instructions the user can act on. */
function describeError(errorCode: string, description: string): string {
  const code = errorCode.toLowerCase();
  const text = decode(description);

  if (code.includes('otp_already_used') || text.toLowerCase().includes('already')) {
    return 'This confirmation link has already been used. Your email is verified — sign in with your email and password.';
  }

  if (code.includes('otp_expired') || text.toLowerCase().includes('expired')) {
    return 'This confirmation link has expired. Request a new one on the sign-in screen.';
  }

  if (code === 'access_denied') {
    return 'This confirmation link is not valid. Request a new one on the sign-in screen.';
  }

  return text || 'We couldn’t confirm your email. Please try again.';
}

/**
 * Completes Supabase email confirmation.
 *
 * Supabase sends the user back here with tokens in one of a few shapes, all of
 * which are handled:
 *   - ?token_hash=...&type=signup  (default link format)
 *   - #access_token=...&refresh_token=...  (implicit flow)
 *   - ?code=...  (PKCE flow)
 *   - #error=...&error_code=...  (expired / invalid / already used)
 */
export default function ConfirmScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const handled = useRef(false);

  const finish = useCallback((verdict: Verdict) => {
    if (handled.current) return;
    handled.current = true;

    setStatus(verdict.status);
    setMessage(verdict.message);

    if (verdict.status === 'success') {
      // Give the user a beat to read the confirmation, then send them to sign in.
      setTimeout(() => {
        router.replace('/sign-in');
      }, 1600);
    }
  }, []);

  const run = useCallback(
    async (url: string) => {
      if (!url || handled.current) return;

      try {
        const hashIndex = url.indexOf('#');
        const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
        const baseAndQuery = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

        const hash = new URLSearchParams(hashPart);
        const query = new URLSearchParams(
          baseAndQuery.includes('?')
            ? baseAndQuery.slice(baseAndQuery.indexOf('?') + 1)
            : ''
        );

        // 1. Supabase reports link failures in the fragment.
        const urlError = hash.get('error') ?? query.get('error');
        if (urlError) {
          finish({
            status: 'error',
            message: describeError(
              hash.get('error_code') ?? query.get('error_code') ?? urlError,
              hash.get('error_description') ?? query.get('error_description') ?? ''
            ),
          });
          return;
        }

        // 2. token_hash links (Supabase's default for email confirmations).
        const tokenHash = query.get('token_hash');
        if (tokenHash) {
          const type = query.get('type') ?? 'signup';
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;

          finish({ status: 'success', message: 'Email verified successfully. You can now sign in.' });
          return;
        }

        // 3. Implicit-flow tokens in the fragment.
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          finish({ status: 'success', message: 'Email verified successfully. You can now sign in.' });
          return;
        }

        // 4. PKCE code exchange.
        const code = query.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          finish({ status: 'success', message: 'Email verified successfully. You can now sign in.' });
          return;
        }

        finish({
          status: 'error',
          message: 'This link is missing confirmation details. Please request a new one.',
        });
      } catch (error) {
        const raw =
          error instanceof Error ? error.message : 'Confirmation failed';
        finish({
          status: 'error',
          message: describeError(raw, raw),
        });
      }
    },
    [finish]
  );

  useEffect(() => {
    // Read the URL that opened this route.
    void Linking.getInitialURL().then((url) => {
      const fallback =
        typeof window !== 'undefined' ? window.location.href : null;
      void run(url ?? fallback ?? '');
    });

    // Native: the app may already be open when the link is tapped.
    const sub = Linking.addEventListener('url', ({ url }) => {
      void run(url);
    });

    return () => {
      sub.remove();
    };
  }, [run]);

  return (
    <View style={styles.container}>
      <GradientBackground />
      <SafeAreaView style={styles.inner}>
        <View style={styles.panel}>
          {status === 'loading' ? (
            <>
              <View style={[styles.iconRing, styles.iconRingLoading]}>
                <Ionicons name="hourglass-outline" size={30} color={COLORS.primary} />
              </View>
              <Text style={styles.title}>Confirming your email…</Text>
              <Text style={styles.body}>This only takes a moment.</Text>
            </>
          ) : status === 'success' ? (
            <>
              <View style={[styles.iconRing, styles.iconRingSuccess]}>
                <Ionicons name="checkmark-circle-outline" size={30} color={COLORS.success} />
              </View>
              <Text style={styles.title}>Email confirmed</Text>
              <InlineFeedback kind="success" message={message} />
              <AppButton
                theme="primary"
                title="Go to Sign In"
                icon="log-in-outline"
                onPress={() => router.replace('/sign-in')}
              />
            </>
          ) : (
            <>
              <View style={[styles.iconRing, styles.iconRingError]}>
                <Ionicons name="alert-circle-outline" size={30} color={COLORS.danger} />
              </View>
              <Text style={styles.title}>Confirmation failed</Text>
              <InlineFeedback kind="error" message={message} />
              <AppButton
                theme="primary"
                title="Back to Sign In"
                icon="log-in-outline"
                onPress={() => router.replace('/sign-in')}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => router.replace('/register')}
                style={styles.linkButton}
              >
                <Text style={styles.link}>Register again</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 22,
    gap: 14,
    boxShadow: '0 8px 16px rgba(10, 32, 71, 0.05)',
    elevation: 2,
  },
  iconRing: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    alignSelf: 'center',
  },
  iconRingLoading: { backgroundColor: COLORS.surface },
  iconRingSuccess: { backgroundColor: COLORS.successSurface },
  iconRingError: { backgroundColor: COLORS.errorSurface },
  title: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
