import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import type { Role } from '@/lib/profiles';
import { createTeacherApplication } from '@/lib/teacherApplications';

export default function RegisterScreen() {
  const { user, signUp } = useAuth();
  const [fullName, setFullName] = useState<string>('');
  const [role, setRole] = useState<Role>('student');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teacherIdImage, setTeacherIdImage] = useState<string | null>(null);
  const [teacherIdImageError, setTeacherIdImageError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [pendingTeacherIdSubmission, setPendingTeacherIdSubmission] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const pickTeacherImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setTeacherIdImageError('Permission to access photos is required to upload your Teacher ID.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setTeacherIdImage(result.assets[0].uri);
      setTeacherIdImageError(null);
    }
  };

  const clearTeacherImage = () => {
    setTeacherIdImage(null);
    setTeacherIdImageError(null);
  };

  const passwordError =
    (password.length > 0 || hasAttemptedSubmit) && password.length < 6
      ? 'Use at least 6 characters.'
      : null;
  const confirmPasswordError =
    confirmPassword.length > 0 && confirmPassword !== password
      ? 'Passwords do not match.'
      : null;

  const handleRegister = async () => {
    setHasAttemptedSubmit(true);
    setError(null);
    setTeacherIdImageError(null);

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Complete all required fields before creating your account.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Re-enter the confirmation password.');
      return;
    }
    if (role === 'teacher' && !teacherIdImage) {
      setTeacherIdImageError('Please upload your Teacher ID before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      // Always register with student role; teacher role requires approval.
      // The pending flag routes the applicant to the application screen after
      // sign-in when email confirmation prevented an immediate submission.
      const result = await signUp(email.trim(), password, {
        full_name: fullName.trim(),
        role: 'student',
        pending_teacher_application: role === 'teacher' ? 'true' : null,
      });

      if (result.error) {
        const normalized = result.error.message.toLowerCase();

        if (normalized.includes('already registered') || normalized.includes('already been registered') || normalized.includes('user already exists')) {
          setError('That email is already registered. Sign in instead, or resend your confirmation email.');
        } else if (normalized.includes('too many requests')) {
          setError('Too many sign-up attempts. Please wait a minute and try again.');
        } else if (normalized.includes('password')) {
          setError('That password is not strong enough. Use at least 6 characters.');
        } else {
          setError(result.error.message);
        }

        return;
      }

      // Teacher applicants need an authenticated session before the ID can be
      // uploaded, so the application is only created once sign-up returns one.
      if (role === 'teacher' && result.session?.user) {
        if (!teacherIdImage) {
          setTeacherIdImageError('Please upload your Teacher ID before submitting.');
          return;
        }

        const { error: appError } = await createTeacherApplication(
          result.session.user.id,
          {
            fullName: fullName.trim(),
            email: email.trim(),
            imageUri: teacherIdImage,
          }
        );

        if (appError) {
          setError(appError);
          return;
        }

        setSuccess(true);
        setPendingTeacherIdSubmission(true);
        return;
      }

      if (result.session) {
        router.replace('/(tabs)');
        return;
      }
      // Supabase requires email confirmation: no session was issued yet.
      setNeedsConfirmation(true);
      setSuccess(true);
    } catch {
      setError('Unable to create your account right now. Please try again.');
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
                <Text accessibilityRole="header" style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>Choose the tools that match your role.</Text>
              </View>

              {success ? (
                <View style={styles.successPanel}>
                  <InlineFeedback
                    kind="success"
                    message={
                      pendingTeacherIdSubmission
                        ? 'Your teacher application has been submitted and is awaiting review. You will be notified when your application has been reviewed.'
                        : needsConfirmation
                        ? 'Registration successful! Please check your email and click the confirmation link to activate your account.'
                        : 'Account created. Welcome to QR-ATT.'
                    }
                  />
                  {role === 'teacher' && needsConfirmation ? (
                    <InlineFeedback
                      kind="info"
                      message="After confirming your email and signing in, open your Profile and use “Become a Teacher” to upload your Teacher ID for approval."
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.replace('/sign-in')}
                    style={styles.linkButton}
                  >
                    <Text style={styles.link}>Back to Sign In</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.formCard}>
                  <View style={styles.form}>
                    <View>
                      <Text style={styles.label}>Full name</Text>
                      <TextInput
                        accessibilityLabel="Full name"
                        style={styles.input}
                        value={fullName}
                        onChangeText={(value) => {
                          setFullName(value);
                          setError(null);
                        }}
                        placeholder="Your name"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="words"
                        textContentType="name"
                        editable={!submitting}
                      />
                    </View>

                    <View>
                      <Text style={styles.label}>I am a...</Text>
                      <View style={styles.roleRow}>
                        {(['student', 'teacher'] as const).map((option) => {
                          const selected = role === option;
                          const isStudent = option === 'student';
                          return (
                            <Pressable
                              key={option}
                              accessibilityRole="radio"
                              accessibilityState={{ selected, disabled: submitting }}
                              disabled={submitting}
                              style={({ pressed }) => [
                                styles.roleChip,
                                selected && styles.roleChipActive,
                                pressed && styles.roleChipPressed,
                              ]}
                              onPress={() => setRole(option)}
                            >
                              <View style={styles.roleTitleRow}>
                                <Ionicons
                                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                                  size={17}
                                  color={selected ? COLORS.primary : COLORS.textMuted}
                                />
                                <Text style={[styles.roleChipTitle, selected && styles.roleChipTitleActive]}>
                                  {isStudent ? 'Student' : 'Teacher'}
                                </Text>
                              </View>
                              <Text style={styles.roleDescription}>
                                {isStudent
                                  ? 'Check in to school events.'
                                  : 'Create QR events and view check-ins (requires approval).'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {role === 'teacher' && (
                      <View>
                        <Text style={styles.label}>Upload Teacher ID</Text>
                        <InlineFeedback
                          kind="info"
                          compact
                          message="Upload a clear photo of your valid Teacher ID or institution-issued proof of employment."
                        />
                        {!teacherIdImage ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Select Teacher ID image"
                            onPress={pickTeacherImage}
                            disabled={submitting}
                            style={styles.imagePickerButton}
                          >
                            <Ionicons name="image-outline" size={24} color={COLORS.primary} />
                            <Text style={styles.imagePickerText}>Select Teacher ID Image</Text>
                          </Pressable>
                        ) : (
                          <View style={styles.imagePreviewContainer}>
                            <Image
                              source={{ uri: teacherIdImage }}
                              style={styles.imagePreview}
                              resizeMode="cover"
                            />
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Remove Teacher ID image"
                              onPress={clearTeacherImage}
                              style={styles.removeImageButton}
                            >
                              <Ionicons name="close-circle-outline" size={22} color={COLORS.danger} />
                            </Pressable>
                            {teacherIdImageError && (
                              <Text style={styles.fieldError}>{teacherIdImageError}</Text>
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    <View>
                      <Text style={styles.label}>School email</Text>
                      <TextInput
                        accessibilityLabel="School email"
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
                      />
                    </View>

                    <View>
                      <Text style={styles.label}>Password</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          accessibilityLabel="Password"
                          style={styles.inputWithAction}
                          value={password}
                          onChangeText={(value) => {
                            setPassword(value);
                            setError(null);
                          }}
                          placeholder="At least 6 characters"
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry={!showPassword}
                          textContentType="newPassword"
                          autoComplete="new-password"
                          editable={!submitting}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                          onPress={() => setShowPassword((visible) => !visible)}
                          style={styles.visibilityButton}
                        >
                          <Ionicons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={19}
                            color={COLORS.textMuted}
                          />
                        </Pressable>
                      </View>
                      {passwordError ? (
                        <Text style={styles.fieldError}>{passwordError}</Text>
                      ) : (
                        <Text style={styles.fieldHint}>Use at least 6 characters.</Text>
                      )}
                    </View>

                    <View>
                      <Text style={styles.label}>Confirm password</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          accessibilityLabel="Confirm password"
                          style={styles.inputWithAction}
                          value={confirmPassword}
                          onChangeText={(value) => {
                            setConfirmPassword(value);
                            setError(null);
                          }}
                          placeholder="Re-enter your password"
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry={!showConfirmPassword}
                          textContentType="newPassword"
                          autoComplete="new-password"
                          editable={!submitting}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                          onPress={() => setShowConfirmPassword((visible) => !visible)}
                          style={styles.visibilityButton}
                        >
                          <Ionicons
                            name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={19}
                            color={COLORS.textMuted}
                          />
                        </Pressable>
                      </View>
                      {confirmPasswordError ? (
                        <Text style={styles.fieldError}>{confirmPasswordError}</Text>
                      ) : null}
                    </View>

                    {error ? <InlineFeedback kind="error" message={error} /> : null}

                    <AppButton
                      theme="primary"
                      title={submitting ? 'Creating account…' : 'Create account'}
                      icon="person-add-outline"
                      onPress={() => void handleRegister()}
                      disabled={
                        submitting ||
                        !fullName.trim() ||
                        !email.trim() ||
                        password.length < 6 ||
                        password !== confirmPassword
                      }
                      loading={submitting}
                    />

                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.replace('/sign-in')}
                      style={styles.linkButton}
                    >
                      <Text style={styles.link}>Already registered? <Text style={styles.linkStrong}>Sign in</Text></Text>
                    </Pressable>
                  </View>
                </View>
              )}
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
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  heading: {
    marginTop: 24,
    marginBottom: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 18,
    boxShadow: '0 8px 16px rgba(10, 32, 71, 0.05)',
    elevation: 2,
  },
  form: {
    gap: 14,
  },
  label: {
    marginBottom: 6,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  inputContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingLeft: 12,
    paddingRight: 4,
  },
  inputWithAction: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  visibilityButton: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleChip: {
    flex: 1,
    minHeight: 78,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  roleChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  roleChipPressed: {
    backgroundColor: COLORS.surface,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleChipTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  roleChipTitleActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  roleDescription: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  fieldHint: {
    marginTop: 5,
    color: COLORS.textMuted,
    fontSize: 11,
  },
  fieldError: {
    marginTop: 5,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  linkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  successPanel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 18,
  },

  imagePickerButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  imagePickerText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBackground,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 11,
    padding: 4,
    minWidth: 30,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
