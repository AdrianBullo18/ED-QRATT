import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import InlineFeedback from '@/components/InlineFeedback';
import GradientBackground from '@/components/GradientBackground';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useMyTeacherApplication } from '@/hooks/useMyTeacherApplication';
import {
  getAvatarSignedUrl,
  pickAvatarImage,
  removeAvatarFromStorage,
  uploadAvatar,
} from '@/lib/avatar';
import { updateProfile } from '@/lib/profiles';

/**
 * Turns an avatar upload failure into a message that says what to actually do.
 * Supabase Storage errors are plain objects with a `message` field, so coerce
 * every shape into a string instead of rendering `[object Object]`.
 */
function getAvatarErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : error !== null && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const normalized = message.toLowerCase();

  if (normalized.includes('permission') || normalized.includes('denied') || normalized.includes('unauthorized')) {
    return 'You do not have permission to upload a photo. Check your account and try again.';
  }

  if (normalized.includes('too large') || normalized.includes('size') || normalized.includes('payload')) {
    return 'That image is too large. Choose one under 5 MB.';
  }

  if (normalized.includes('file type') || normalized.includes('mime') || normalized.includes('format')) {
    return 'That file type is not supported. Use a JPEG, PNG, or WebP image.';
  }

  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('connection')) {
    return 'We couldn’t reach the server. Check your connection and try again.';
  }

  return `We couldn’t update your profile photo. ${message}`;
}

export default function ProfileScreen() {
  const {
    user,
    signOut,
    signingOut,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth();
  const { application, loading: applicationLoading } = useMyTeacherApplication(user);
  const [draftName, setDraftName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'error' | 'success' | 'info' | null>(null);
  const [showAccountId, setShowAccountId] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarWorking, setAvatarWorking] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('avatar.jpg');
  const [previewMimeType, setPreviewMimeType] = useState('image/jpeg');

  const mountedRef = useRef(true);

  const loadAvatarUrl = useCallback(async (path: string | null | undefined) => {
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    setAvatarLoading(true);
    try {
      const url = await getAvatarSignedUrl(path);
      if (mountedRef.current) setAvatarUrl(url);
    } catch {
      if (mountedRef.current) setAvatarUrl(null);
    } finally {
      if (mountedRef.current) setAvatarLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      setAvatarUrl(null);
      return;
    }
    void loadAvatarUrl(profile.avatar_path);
  }, [profile?.avatar_path, loadAvatarUrl]);

  // Keep the draft in sync with the authoritative profile value, but never
  // clobber what the user is typing (only re-sync when the value changes).
  useEffect(() => {
    setDraftName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  // Refresh the shared profile on focus so approvals/edits made elsewhere
  // show up without an app restart.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  // True until the context has actually resolved the profile (or failed).
  const loading = profileLoading || (!profile && !profileError && Boolean(user));
  const loadError = profileError && !profile;

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    setMessageKind(null);
    const name = draftName.trim();

    try {
      const result = await updateProfile(user.id, { full_name: name || null });
      if (result.error) {
        setMessage(result.error);
        setMessageKind('error');
        return;
      }
      await refreshProfile();
      setEditing(false);
      setMessage('Your name has been updated.');
      setMessageKind('success');
    } catch {
      setMessage('We couldn’t save your name. Please try again.');
      setMessageKind('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    try {
      // Destroys the Supabase session and clears every stored token.
      await signOut();
    } catch (error) {
      // The local session and tokens are cleared regardless, so the user is
      // logged out either way; the server-side revoke failure is reported.
      console.error('[Profile] Log out failed:', error);
    } finally {
      router.replace('/sign-in');
    }
  };

  const handlePickAvatar = async () => {
    if (!user || avatarWorking) return;

    setAvatarWorking(true);
    setMessage(null);
    setMessageKind(null);

    try {
      const picked = await pickAvatarImage();
      if (!picked) return; // User cancelled.
      setPreviewUri(picked.uri);
      setPreviewName(picked.name);
      setPreviewMimeType(picked.mimeType);
      setMessage('Photo selected. Tap Save Photo to upload it.');
      setMessageKind('info');
    } catch (error) {
      setMessage(getAvatarErrorMessage(error));
      setMessageKind('error');
    } finally {
      setAvatarWorking(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!user || !previewUri) return;

    setAvatarWorking(true);
    setMessage(null);
    setMessageKind(null);

    try {
      const picked: Awaited<ReturnType<typeof pickAvatarImage>> = {
        uri: previewUri,
        name: previewName,
        mimeType: previewMimeType,
        size: 0,
      };

      const { path, error: uploadError } = await uploadAvatar(user.id, picked);
      if (uploadError) throw new Error(uploadError);

      const { error: profileError } = await updateProfile(user.id, { avatar_path: path });
      if (profileError) throw new Error(profileError);

      setPreviewUri(null);
      await refreshProfile();
      await loadAvatarUrl(path);
      setMessage('Your profile photo has been updated.');
      setMessageKind('success');
    } catch (error) {
      setMessage(getAvatarErrorMessage(error));
      setMessageKind('error');
    } finally {
      setAvatarWorking(false);
    }
  };

  const handleCancelAvatar = () => {
    if (avatarWorking) return;
    setPreviewUri(null);
    setMessage(null);
    setMessageKind(null);
  };

  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_path || avatarWorking) return;

    setAvatarWorking(true);
    setMessage(null);
    setMessageKind(null);

    try {
      const { error: storageError } = await removeAvatarFromStorage(user.id, profile.avatar_path);
      if (storageError) throw new Error(storageError);

      const { error: profileError } = await updateProfile(user.id, { avatar_path: null });
      if (profileError) throw new Error(profileError);

      setAvatarUrl(null);
      await refreshProfile();
      setMessage('Your profile photo has been removed.');
      setMessageKind('success');
    } catch (error) {
      setMessage(getAvatarErrorMessage(error));
      setMessageKind('error');
    } finally {
      setAvatarWorking(false);
    }
  };

  const displayRole = profile?.role ?? null;
  const metadataName = user?.user_metadata?.full_name;
  const fullName =
    profile?.full_name?.trim() ||
    (typeof metadataName === 'string' ? metadataName.trim() : '') ||
    'Name not added yet';

  return (
    <View style={styles.container}>
      <GradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
          <Text accessibilityRole="header" style={styles.title}>My profile</Text>
          <Text style={styles.subtitle}>Your details and attendance role.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.profileCard}>
            <InlineFeedback kind="error" message={message ?? 'Could not load your profile.'} />
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshProfile()}
              style={styles.retryButton}
            >
              <Text style={styles.actionText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatarBlock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  onPress={() => void handlePickAvatar()}
                  disabled={avatarWorking}
                  style={({ pressed }) => [styles.avatarPressable, pressed && styles.avatarPressablePressed]}
                >
                  {previewUri ? (
                    <RNImage
                      source={{ uri: previewUri }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : avatarUrl ? (
                    <RNImage
                      source={{ uri: avatarUrl }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : avatarLoading ? (
                    <View style={styles.avatarLoading}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    </View>
                  ) : (
                    <View style={styles.avatarIconWrap}>
                      <Ionicons name="person-outline" size={23} color={COLORS.primary} />
                    </View>
                  )}
                  {avatarWorking ? (
                    <View style={styles.avatarWorkingOverlay}>
                      <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
                    </View>
                  ) : null}
                </Pressable>

                <View style={styles.avatarActions}>
                  {previewUri ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Save profile photo"
                        onPress={() => void handleSaveAvatar()}
                        disabled={avatarWorking}
                        style={({ pressed }) => [
                          styles.avatarButton,
                          styles.avatarButtonPrimary,
                          pressed && styles.avatarButtonPrimaryPressed,
                        ]}
                      >
                        <Ionicons name="cloud-upload-outline" size={16} color={COLORS.textOnPrimary} />
                        <Text style={styles.avatarButtonPrimaryText}>
                          {avatarWorking ? 'Uploading…' : 'Save Photo'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel photo selection"
                        onPress={() => handleCancelAvatar()}
                        disabled={avatarWorking}
                        style={({ pressed }) => [
                          styles.avatarButton,
                          pressed && styles.avatarButtonPressed,
                        ]}
                      >
                        <Text style={styles.avatarButtonText}>Cancel</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Change profile photo"
                        onPress={() => void handlePickAvatar()}
                        disabled={avatarWorking}
                        style={({ pressed }) => [
                          styles.avatarButton,
                          pressed && styles.avatarButtonPressed,
                        ]}
                      >
                        <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
                        <Text style={styles.avatarButtonText}>Change Profile Photo</Text>
                      </Pressable>
                      {profile?.avatar_path ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Remove profile photo"
                          onPress={() => void handleRemoveAvatar()}
                          disabled={avatarWorking}
                          style={({ pressed }) => [
                            styles.avatarButton,
                            pressed && styles.avatarButtonPressed,
                          ]}
                        >
                          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                          <Text style={styles.avatarButtonDangerText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </View>
              </View>

              <View style={styles.divider} />
              <View style={styles.nameSection}>
                <View style={styles.nameHeading}>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  {!editing ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setEditing(true)}
                      style={styles.editButton}
                    >
                      <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.actionText}>{profile?.full_name ? 'Edit name' : 'Add name'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {editing ? (
                  <View style={styles.editRow}>
                    <TextInput
                      accessibilityLabel="Full name"
                      style={styles.nameInput}
                      value={draftName}
                      onChangeText={setDraftName}
                      placeholder="Add your name"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="words"
                      textContentType="name"
                      editable={!saving}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleSaveName()}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: saving }}
                      onPress={() => void handleSaveName()}
                      disabled={saving}
                      style={[styles.saveButton, saving && styles.disabled]}
                    >
                      <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.nameValue} numberOfLines={2}>{fullName}</Text>
                )}
              </View>

              {displayRole ? (
                <View style={styles.roleInfo}>
                  <Text style={styles.fieldLabel}>Your role</Text>
                  <Text style={styles.roleDescription}>
                    {displayRole === 'teacher'
                      ? 'Create event QR codes and review student check-ins.'
                      : displayRole === 'admin'
                      ? 'Review teacher applications and manage user roles.'
                      : 'Scan event QR codes and review your attendance history.'}
                  </Text>
                </View>
              ) : (
                <InlineFeedback kind="info" compact message="Your role details are not available yet." />
              )}

              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>Account ID</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showAccountId }}
                onPress={() => setShowAccountId((show) => !show)}
                style={styles.accountIdToggle}
              >
                <Text style={styles.accountIdToggleText}>
                  {showAccountId ? 'Hide account ID' : 'Show account ID'}
                </Text>
                <Ionicons
                  name={showAccountId ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.primary}
                />
              </Pressable>
              {showAccountId ? (
                <Text style={styles.idValue} selectable>{user?.id ?? '—'}</Text>
              ) : null}

              <View style={styles.divider} />

              <View style={styles.applicationSection}>
                <Text style={styles.fieldLabel}>Teacher application</Text>
                {applicationLoading ? (
                  <Text style={styles.applicationHint}>Checking status…</Text>
                ) : application ? (
                  <View style={styles.applicationStatusBlock}>
                    <View
                      style={[
                        styles.applicationBadge,
                        application.status === 'pending' && styles.applicationBadge_pending,
                        application.status === 'approved' && styles.applicationBadge_approved,
                        application.status === 'rejected' && styles.applicationBadge_rejected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.applicationBadgeText,
                          application.status === 'pending' && styles.applicationBadgeText_pending,
                          application.status === 'approved' && styles.applicationBadgeText_approved,
                          application.status === 'rejected' && styles.applicationBadgeText_rejected,
                        ]}
                      >
                        {application.status}
                      </Text>
                    </View>
                    <Text style={styles.applicationHint}>
                      {application.status === 'pending'
                        ? 'Your teacher application is awaiting review by an administrator. Check back here for the decision.'
                        : application.status === 'approved'
                        ? 'Your teacher application has been approved. Teacher tools are unlocked.'
                        : 'Your teacher application was not approved. You can submit a new application.'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.applicationHint}>
                      You have not submitted a teacher application.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Apply to become a teacher"
                      onPress={() => router.push('/teacher-application')}
                      style={({ pressed }) => [
                        styles.teacherApplyLink,
                        pressed && styles.teacherApplyLinkPressed,
                      ]}
                    >
                      <Ionicons name="school-outline" size={19} color={COLORS.primary} />
                      <Text style={styles.teacherApplyLinkText}>Become a Teacher</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {application?.status === 'rejected' ? (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reapply to become a teacher"
                    onPress={() => router.push('/teacher-application')}
                    style={({ pressed }) => [
                      styles.teacherApplyLink,
                      pressed && styles.teacherApplyLinkPressed,
                    ]}
                  >
                    <Ionicons name="refresh-outline" size={19} color={COLORS.primary} />
                    <Text style={styles.teacherApplyLinkText}>Reapply as Teacher</Text>
                  </Pressable>
                </>
              ) : null}

              <View style={styles.divider} />
            </View>

            {message && !loadError ? (
              <InlineFeedback kind={messageKind ?? 'info'} compact message={message} />
            ) : null}
          </>
        )}

        {/* Log Out stays available in every state so a failed profile load can
            never trap the user inside the app. */}
        <View style={styles.logOutBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            accessibilityState={{ disabled: signingOut, busy: signingOut }}
            disabled={signingOut}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && !signingOut && styles.signOutButtonPressed,
              signingOut && styles.signOutButtonDisabled,
            ]}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color={COLORS.danger} style={styles.signOutIcon} />
            ) : (
              <Ionicons name="log-out-outline" size={19} color={COLORS.danger} style={styles.signOutIcon} />
            )}
            <Text style={[styles.signOutLabel, signingOut && styles.signOutLabelDisabled]}>
              {signingOut ? 'Logging out…' : 'Log Out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 30,
  },
  heading: {
    marginBottom: 19,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    marginTop: 5,
    color: COLORS.navy,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  subtitle: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  profileCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    padding: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  nameSection: {
    marginBottom: 15,
  },
  nameHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  editButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  actionText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  nameValue: {
    marginTop: 5,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  saveButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
  },
  saveText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    backgroundColor: '#E8EDF4',
  },
  roleInfo: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingLeft: 11,
  },
  roleDescription: {
    marginTop: 4,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  accountIdToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountIdToggleText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  idValue: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  loadingPanel: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.card,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  /* TEACHER APPLICATION */

  applicationSection: {
    gap: 8,
  },
  applicationStatusBlock: {
    gap: 8,
  },
  applicationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  applicationBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  applicationBadge_pending: { backgroundColor: COLORS.surface },
  applicationBadgeText_pending: { color: COLORS.warning },
  applicationBadge_approved: { backgroundColor: COLORS.successSurface },
  applicationBadgeText_approved: { color: COLORS.success },
  applicationBadge_rejected: { backgroundColor: COLORS.errorSurface },
  applicationBadgeText_rejected: { color: COLORS.danger },
  applicationHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },

  /* TEACHER APPLICATION LINKS */

  teacherApplyLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  teacherApplyLinkPressed: {
    opacity: 0.6,
  },
  teacherApplyLinkText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  /* AVATAR */

  avatarBlock: {
    alignItems: 'center',
    gap: 14,
  },
  avatarPressable: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: COLORS.surface,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressablePressed: {
    opacity: 0.92,
    borderColor: COLORS.primary,
  },
  avatarImage: {
    width: 104,
    height: 104,
  },
  avatarIconWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLoading: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWorkingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 32, 71, 0.55)',
    borderRadius: 52,
  },
  avatarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  avatarButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.card,
  },
  avatarButtonPressed: {
    backgroundColor: COLORS.surface,
  },
  avatarButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  avatarButtonPrimaryPressed: {
    backgroundColor: COLORS.primary,
    opacity: 0.92,
  },
  avatarButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  avatarButtonPrimaryText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  avatarButtonDangerText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  /* LOG OUT */

  logOutBlock: {
    marginTop: 18,
  },

  signOutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  signOutButtonPressed: {
    backgroundColor: COLORS.errorSurface,
    borderColor: COLORS.error,
  },
  signOutButtonDisabled: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  signOutIcon: {
    marginRight: 2,
  },
  signOutLabel: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  signOutLabelDisabled: {
    color: COLORS.textMuted,
  },
});
