import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import Header from '@/components/Header';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { resendSignupConfirmation } from '@/lib/auth';

/** How long the resend button stays locked after a successful send. */
const RESEND_COOLDOWN_SECONDS = 60;

function getSignInErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email using the link we sent, then try signing in again.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'That email and password don\u2019t match. Check your details and try again.';
  }
  if (normalized.includes('too many requests')) {
    return 'There have been too many attempts. Wait a moment, then try again.';
  }
  if (normalized.includes('invalid api key') || normalized.includes('invalid jwt')) {
    return 'The sign-in service is not configured correctly. Please contact your school IT support.';
  }

  return 'We couldn\u2019t sign you in. Check your connection and try again.';
}

/** True when Supabase blocked sign-in purely because the email is unconfirmed. */
function isEmailNotConfirmed(message: string) {
  return message.toLowerCase().includes('email not confirmed');
}

export default function SignInScreen() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the cooldown down while the resend button is locked.
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  // Guard after every hook so the hook order stays stable across renders.
  if (user) {
    const pendingApplication =
      user.user_metadata?.pending_teacher_application === 'true';
    return (
      <Redirect
        href={pendingApplication ? '/teacher-application' : '/(tabs)'}
      />
    );
  }

  const handleResendConfirmation = async () => {
    if (resending || cooldown > 0) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setNeedsConfirmation(false);
      setNotice(null);
      setError('Enter the email address you registered with first.');
      return;
    }

    setResending(true);
    setError(null);
    setNotice(null);

    try {
      const { error: resendError } = await resendSignupConfirmation(trimmed);

      if (resendError) {
        // Supabase reports the built-in provider's hourly cap several ways.
        const lowered = resendError.message.toLowerCase();
        const isRateLimited =
          lowered.includes('too many requests') ||
          lowered.includes('rate limit') ||
          lowered.includes('429') ||
          lowered.includes('after');

        setError(
          isRateLimited
            ? 'Supabase limits how often confirmation emails can be sent (a few per hour on the default provider). Please wait before requesting another link.'
            : 'We couldn\u2019t send the confirmation email. Please try again shortly.'
        );
        return;
      }

      // Deliberately identical whether or not the address is registered.
      setNeedsConfirmation(false);
      setNotice(
        'If that address needs confirming, a new link is on its way. Check your inbox and spam folder.'
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('We couldn\u2019t send the confirmation email. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        const unconfirmed = isEmailNotConfirmed(result.error.message);
        setNeedsConfirmation(unconfirmed);
        setError(getSignInErrorMessage(result.error.message));
        return;
      }
      if (!result.session) {
        setNeedsConfirmation(true);
        setError('Check your email for a confirmation link, then try signing in again.');
        return;
      }
      setNeedsConfirmation(false);
      // Teacher applicants who couldn't submit during sign-up (email
      // confirmation was required) go straight to the application screen.
      const pendingApplication =
        result.session.user.user_metadata?.pending_teacher_application === 'true';
      router.replace(pendingApplication ? '/teacher-application' : '/(tabs)');
    } catch {
      setError('We couldn\u2019t sign you in. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safeArea}>
      <GradientBackground />
      <SafeAreaView style={styles.safeAreaInner}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <Header title="QR-ATT" />

              <View style={styles.heading}>
                <Text accessibilityRole="header" style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>Sign in to record your attendance.</Text>
              </View>

              <View style={styles.formCard}>
                <View style={styles.form}>
                  <View>
                    <Text style={styles.label}>Email</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons
                        name="mail-outline"
                        size={19}
                        color={COLORS.textSecondary}
                        style={styles.leadingIcon}
                      />
                      <TextInput
                        accessibilityLabel="Email"
                        style={styles.input}
                        value={email}
                        onChangeText={(value) => {
                          setEmail(value);
                          setError(null);
                        }}
                        placeholder="you@school.edu"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        editable={!submitting}
                        returnKeyType="next"
                      />
                    </View>
                  </View>

                  <View>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={19}
                        color={COLORS.textSecondary}
                        style={styles.leadingIcon}
                      />
                      <TextInput
                        accessibilityLabel="Password"
                        style={styles.input}
                        value={password}
                        onChangeText={(value) => {
                          setPassword(value);
                          setError(null);
                        }}
                        placeholder="Enter your password"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showPassword}
                        textContentType="password"
                        autoComplete="password"
                        editable={!submitting}
                        returnKeyType="done"
                        onSubmitEditing={() => void handleSignIn()}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        hitSlop={8}
                        onPress={() => setShowPassword((visible) => !visible)}
                        style={styles.visibilityButton}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={COLORS.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {error ? <InlineFeedback kind="error" message={error} /> : null}

                  {notice ? <InlineFeedback kind="success" message={notice} /> : null}

                  {needsConfirmation ? (
                    <View style={styles.resendBlock}>
                      <Text style={styles.resendHint}>
                        Didn\u2019t get the email? Check your spam folder, or send it again.
                      </Text>
                      <AppButton
                        title={
                          cooldown > 0
                            ? `Resend in ${cooldown}s`
                            : resending
                            ? 'Sending\u2026'
                            : 'Resend Confirmation Email'
                        }
                        icon="mail-outline"
                        onPress={() => void handleResendConfirmation()}
                        disabled={resending || cooldown > 0}
                        loading={resending}
                      />
                    </View>
                  ) : null}

                  <AppButton
                    theme="primary"
                    title={submitting ? 'Signing in…' : 'Sign In'}
                    icon="arrow-forward"
                    onPress={() => void handleSignIn()}
                    disabled={!email.trim() || !password}
                    loading={submitting}
                  />

                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/register')}
                    style={styles.linkButton}
                  >
                    <Text style={styles.link}>New to QR-ATT? <Text style={styles.linkStrong}>Create an account</Text></Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.footerRow}>
                <Image
                  source={require('../assets/images/icon.png')}
                  style={styles.footerLogo}
                  resizeMode="cover"
                  accessible={false}
                />
                <Text style={styles.footer}>Secure school attendance</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safeAreaInner: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  heading: {
    marginTop: 28,
    marginBottom: 18,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.65,
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  formCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 20,
    boxShadow: '0 8px 18px rgba(10, 32, 71, 0.06)',
    elevation: 3,
  },
  form: {
    gap: 16,
  },
  label: {
    marginBottom: 7,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  inputContainer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 13,
  },
  leadingIcon: {
    marginRight: 9,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  visibilityButton: {
    minWidth: 40,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  link: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  linkStrong: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  resendBlock: {
    gap: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 13,
  },
  resendHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  footerLogo: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  footer: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
