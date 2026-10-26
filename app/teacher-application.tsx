import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import Header from '@/components/Header';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useMyTeacherApplication } from '@/hooks/useMyTeacherApplication';
import { createTeacherApplication } from '@/lib/teacherApplications';
import { supabase } from '@/lib/supabase';

export default function TeacherApplicationScreen() {
  const { user, profile } = useAuth();
  const { application, refresh } = useMyTeacherApplication(user);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const email = user?.email ?? '';

  // The sign-up pending flag only exists to route applicants here. Once an
  // application record is visible, stop auto-routing on future sign-ins.
  useEffect(() => {
    if (!user || !application) return;
    if (user.user_metadata?.pending_teacher_application !== 'true') return;
    void supabase.auth.updateUser({
      data: { pending_teacher_application: null },
    });
  }, [user, application]);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setImageError('Permission to access photos is required to upload your Teacher ID.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageError(null);
    }
  }, []);

  const handleSubmit = async () => {
    if (!user) return;

    setError(null);
    setImageError(null);

    if (!imageUri) {
      setImageError('Select an image of your Teacher ID first.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: submitError } = await createTeacherApplication(user.id, {
        fullName:
          profile?.full_name?.trim() ||
          (typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : '') ||
          'Teacher applicant',
        email,
        imageUri,
      });

      if (submitError) {
        setError(submitError);
        return;
      }

      // Submission made: stop routing this account back here at sign-in.
      if (user.user_metadata?.pending_teacher_application === 'true') {
        void supabase.auth.updateUser({
          data: { pending_teacher_application: null },
        });
      }

      setSuccess(true);
      refresh();
    } catch {
      setError('We couldn\u2019t submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Signed-out deep links must not render a form that cannot be submitted.
  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View style={styles.container}>
      <GradientBackground />
      <SafeAreaView style={styles.inner}>
        <Header title="Teacher Application" />
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>
                Become a Teacher
              </Text>
              <Text style={styles.subtitle}>
                Submit your valid Teacher ID for review.
              </Text>
            </View>

            {application?.status === 'approved' ? (
              <InlineFeedback
                kind="success"
                message="Your teacher application has been approved. Teacher tools are now unlocked."
              />
            ) : null}

            {application?.status === 'pending' ? (
              <InlineFeedback
                kind="info"
                message="Your teacher application is awaiting review by an administrator. Check this screen or your Profile for the decision."
              />
            ) : null}

            {application?.status === 'rejected' ? (
              <InlineFeedback
                kind="error"
                message="Your previous application was not approved. You can submit a new one below."
              />
            ) : null}

            {application?.status === 'approved' ? (
              <AppButton
                theme="primary"
                title="Go to Teacher Tools"
                icon="school-outline"
                onPress={() => router.replace('/(tabs)/teacher')}
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.label}>Upload Teacher ID</Text>
                <InlineFeedback
                  kind="info"
                  compact
                  message="Upload a clear photo of your valid Teacher ID or institution-issued proof of employment."
                />

                {!imageUri ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select Teacher ID image"
                    onPress={pickImage}
                    disabled={submitting}
                    style={styles.picker}
                  >
                    <Ionicons name="image-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.pickerText}>Select Teacher ID Image</Text>
                  </Pressable>
                ) : (
                  <View style={styles.previewBox}>
                    <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove Teacher ID image"
                      onPress={() => setImageUri(null)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle-outline" size={22} color={COLORS.danger} />
                    </Pressable>
                  </View>
                )}

                {imageError ? <Text style={styles.fieldError}>{imageError}</Text> : null}
                {error ? <InlineFeedback kind="error" message={error} /> : null}
                {success ? (
                  <InlineFeedback
                    kind="success"
                    message="Your teacher application has been submitted and is awaiting review."
                  />
                ) : null}

                <AppButton
                  theme="primary"
                  title={submitting ? 'Submitting…' : 'Submit for Approval'}
                  icon="cloud-upload-outline"
                  onPress={() => void handleSubmit()}
                  disabled={submitting || !imageUri}
                  loading={submitting}
                />

                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.replace('/(tabs)/profile')}
                  style={styles.linkButton}
                >
                  <Text style={styles.link}>Back to Profile</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 14,
  },
  heading: {
    marginTop: 18,
    marginBottom: 4,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 18,
    gap: 12,
    boxShadow: '0 8px 16px rgba(10, 32, 71, 0.05)',
    elevation: 2,
  },
  label: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  picker: {
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
  pickerText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  previewBox: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBackground,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
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
  fieldError: {
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
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
