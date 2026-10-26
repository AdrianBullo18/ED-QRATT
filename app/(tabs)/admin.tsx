import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountRole } from '@/hooks/useAccountRole';
import {
  approveTeacherApplication,
  getAdminOverview,
  listTeacherApplications,
  listUsers,
  rejectTeacherApplication,
  setUserRole,
  type AdminOverview,
  type AdminUser,
} from '@/lib/admin';
import type { Role } from '@/lib/profiles';
import {
  getTeacherIdSignedUrl,
  type TeacherApplication,
} from '@/lib/teacherApplications';

type Section = 'applications' | 'users';
type StatusFilter = 'pending' | 'approved' | 'rejected';

const STATUS_FILTERS: StatusFilter[] = ['pending', 'approved', 'rejected'];
const ROLE_OPTIONS: Role[] = ['student', 'teacher', 'admin'];

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function displayName(user: { full_name: string | null; email: string }) {
  return user.full_name?.trim() || user.email;
}

export default function AdminScreen() {
  const { user, refreshProfile } = useAuth();
  const {
    role,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useAccountRole(user);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [applications, setApplications] = useState<TeacherApplication[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [section, setSection] = useState<Section>('applications');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');

  const [workingId, setWorkingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [imagePreview, setImagePreview] = useState<{
    applicationId: string;
    url: string;
  } | null>(null);
  const [imageLoadingId, setImageLoadingId] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [nextOverview, nextApplications, nextUsers] = await Promise.all([
        getAdminOverview(),
        listTeacherApplications(),
        listUsers(),
      ]);
      setOverview(nextOverview);
      setApplications(nextApplications);
      setUsers(nextUsers);
    } catch (error) {
      console.error('[Admin] Failed to load:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh the shared role on focus (so an unexpected demotion locks the
  // screen) and reload the admin data.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      if (role !== 'admin') return;
      void loadAdminData();
    }, [refreshProfile, role, loadAdminData, retryKey])
  );

  const handleApprove = (application: TeacherApplication) => {
    Alert.alert(
      'Approve application',
      `Approve ${displayName(application)} as a teacher? Their role changes immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            void (async () => {
              setWorkingId(application.id);
              setFeedback(null);
              const { error } = await approveTeacherApplication(application.id);
              setWorkingId(null);
              if (error) {
                setFeedback({ kind: 'error', text: error });
                return;
              }
              setFeedback({
                kind: 'success',
                text: `${displayName(application)} is now a teacher.`,
              });
              await loadAdminData();
            })();
          },
        },
      ]
    );
  };

  const handleStartReject = (application: TeacherApplication) => {
    setRejectingId(application.id);
    setRejectReason('');
    setFeedback(null);
  };

  const handleSubmitReject = async (application: TeacherApplication) => {
    const reason = rejectReason.trim();
    if (!reason) {
      setFeedback({ kind: 'error', text: 'Add a reason before rejecting.' });
      return;
    }
    setWorkingId(application.id);
    const { error } = await rejectTeacherApplication(application.id, reason);
    setWorkingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error });
      return;
    }
    setRejectingId(null);
    setRejectReason('');
    setFeedback({
      kind: 'success',
      text: `Application from ${displayName(application)} rejected.`,
    });
    await loadAdminData();
  };

  const handleToggleIdImage = async (application: TeacherApplication) => {
    if (imagePreview?.applicationId === application.id) {
      setImagePreview(null);
      return;
    }
    setImageLoadingId(application.id);
    const { signedUrl, error } = await getTeacherIdSignedUrl(
      application.id_image_path
    );
    setImageLoadingId(null);
    if (error || !signedUrl) {
      setFeedback({ kind: 'error', text: 'Could not load the ID image.' });
      return;
    }
    setImagePreview({ applicationId: application.id, url: signedUrl });
  };

  const handleRoleChange = (target: AdminUser, nextRole: Role) => {
    if (target.role === nextRole) return;
    Alert.alert(
      'Change role',
      `Set ${displayName(target)} to "${nextRole}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change role',
          onPress: () => {
            void (async () => {
              setWorkingId(target.id);
              setFeedback(null);
              const { error } = await setUserRole(target.id, nextRole);
              setWorkingId(null);
              if (error) {
                setFeedback({ kind: 'error', text: error });
                return;
              }
              setFeedback({
                kind: 'success',
                text: `${displayName(target)} is now ${nextRole}.`,
              });
              await loadAdminData();
            })();
          },
        },
      ]
    );
  };

  /* ------------------------------- guards ------------------------------- */

  if (roleLoading) {
    return (
      <View style={styles.guardContainer}>
        <GradientBackground />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.guardTitle}>Checking your account…</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.guardContainer}>
        <GradientBackground />
        <Ionicons name="lock-closed-outline" size={30} color={COLORS.textSecondary} />
        <Text style={styles.guardTitle}>Sign in required</Text>
        <Text style={styles.guardText}>Sign in to access the admin console.</Text>
        <Pressable onPress={() => router.replace('/sign-in')} style={styles.guardAction}>
          <Text style={styles.guardActionText}>Go to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (roleError) {
    return (
      <View style={styles.guardContainer}>
        <GradientBackground />
        <View style={styles.lockIcon}>
          <Ionicons name="alert-circle-outline" size={24} color={COLORS.danger} />
        </View>
        <Text style={styles.guardTitle}>Couldn’t verify admin access</Text>
        <Text style={styles.guardText}>Check your connection, then try again.</Text>
        <Pressable accessibilityRole="button" onPress={refreshRole} style={styles.guardAction}>
          <Text style={styles.guardActionText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.guardContainer}>
        <GradientBackground />
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={24} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.guardTitle}>Admins Only</Text>
        <Text style={styles.guardText}>This console is limited to administrator accounts.</Text>
      </View>
    );
  }

  /* ------------------------------ content ------------------------------- */

  const filteredApplications = applications.filter(
    (application) => application.status === statusFilter
  );

  const filteredUsers = users.filter((candidate) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      candidate.email.toLowerCase().includes(query) ||
      (candidate.full_name ?? '').toLowerCase().includes(query)
    );
  });

  const statusCount = (status: StatusFilter) =>
    applications.filter((application) => application.status === status).length;

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
          <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
          <Text accessibilityRole="header" style={styles.title}>Administration</Text>
          <Text style={styles.subtitle}>
            Review teacher applications and manage account roles.
          </Text>
        </View>

        {feedback ? (
          <InlineFeedback
            kind={feedback.kind}
            compact
            message={feedback.text}
          />
        ) : null}

        {/* OVERVIEW */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview?.userCount ?? '—'}</Text>
            <Text style={styles.statLabel}>USERS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {overview?.pendingApplications ?? '—'}
            </Text>
            <Text style={styles.statLabel}>PENDING</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{overview?.eventCount ?? '—'}</Text>
            <Text style={styles.statLabel}>EVENTS</Text>
          </View>
        </View>

        {/* SECTION SWITCH */}
        <View style={styles.segmentRow}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'applications' }}
            onPress={() => setSection('applications')}
            style={[styles.segment, section === 'applications' && styles.segmentActive]}
          >
            <Ionicons
              name="document-text-outline"
              size={15}
              color={section === 'applications' ? COLORS.textOnPrimary : COLORS.primary}
            />
            <Text
              style={[
                styles.segmentText,
                section === 'applications' && styles.segmentTextActive,
              ]}
            >
              Applications
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'users' }}
            onPress={() => setSection('users')}
            style={[styles.segment, section === 'users' && styles.segmentActive]}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={section === 'users' ? COLORS.textOnPrimary : COLORS.primary}
            />
            <Text
              style={[styles.segmentText, section === 'users' && styles.segmentTextActive]}
            >
              Users
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.statePanel}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.stateText}>Loading admin data…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.statePanel}>
            <InlineFeedback
              kind="error"
              message="We couldn’t load admin data. Check your connection and try again."
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetryKey((key) => key + 1)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : section === 'applications' ? (
          <>
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((status) => (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: statusFilter === status }}
                  onPress={() => {
                    setStatusFilter(status);
                    setRejectingId(null);
                  }}
                  style={[
                    styles.filterChip,
                    statusFilter === status && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      statusFilter === status && styles.filterChipTextActive,
                    ]}
                  >
                    {capitalize(status)} ({statusCount(status)})
                  </Text>
                </Pressable>
              ))}
            </View>

            {filteredApplications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="file-tray-outline" size={24} color={COLORS.primary} />
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyText}>
                  {statusFilter === 'pending'
                    ? 'No teacher applications are waiting for review.'
                    : `No ${statusFilter} applications.`}
                </Text>
              </View>
            ) : (
              filteredApplications.map((application) => (
                <View key={application.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="school-outline" size={18} color={COLORS.primary} />
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {displayName(application)}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {application.email}
                      </Text>
                      <Text style={styles.cardMeta}>
                        Submitted {formatDate(application.submitted_at)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        application.status === 'pending' && styles.statusBadgePending,
                        application.status === 'approved' && styles.statusBadgeApproved,
                        application.status === 'rejected' && styles.statusBadgeRejected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          application.status === 'pending' && styles.statusTextPending,
                          application.status === 'approved' && styles.statusTextApproved,
                          application.status === 'rejected' && styles.statusTextRejected,
                        ]}
                      >
                        {application.status}
                      </Text>
                    </View>
                  </View>

                  {application.status === 'rejected' && application.rejection_reason ? (
                    <Text style={styles.reasonText}>
                      Reason: {application.rejection_reason}
                    </Text>
                  ) : null}

                  <View style={styles.cardActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleToggleIdImage(application)}
                      disabled={imageLoadingId === application.id}
                      style={styles.secondaryButton}
                    >
                      {imageLoadingId === application.id ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Ionicons name="image-outline" size={15} color={COLORS.primary} />
                      )}
                      <Text style={styles.secondaryButtonText}>
                        {imagePreview?.applicationId === application.id
                          ? 'Hide ID'
                          : 'View ID'}
                      </Text>
                    </Pressable>

                    {application.status === 'pending' ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleApprove(application)}
                          disabled={workingId === application.id}
                          style={styles.approveButton}
                        >
                          {workingId === application.id ? (
                            <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
                          ) : (
                            <Ionicons name="checkmark" size={16} color={COLORS.textOnPrimary} />
                          )}
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleStartReject(application)}
                          disabled={workingId === application.id}
                          style={styles.rejectButton}
                        >
                          <Ionicons name="close" size={16} color={COLORS.danger} />
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>

                  {imagePreview?.applicationId === application.id ? (
                    <Image
                      source={{ uri: imagePreview.url }}
                      style={styles.idImage}
                      resizeMode="contain"
                    />
                  ) : null}

                  {rejectingId === application.id ? (
                    <View style={styles.rejectForm}>
                      <TextInput
                        accessibilityLabel="Rejection reason"
                        style={styles.reasonInput}
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        placeholder="Reason for rejection"
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        editable={workingId !== application.id}
                      />
                      <View style={styles.rejectFormActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                          style={styles.secondaryButton}
                        >
                          <Text style={styles.secondaryButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void handleSubmitReject(application)}
                          disabled={workingId === application.id || !rejectReason.trim()}
                          style={[
                            styles.rejectButton,
                            !rejectReason.trim() && styles.buttonDisabled,
                          ]}
                        >
                          <Text style={styles.rejectButtonText}>Submit rejection</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Search users"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or email"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {filteredUsers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="search-outline" size={24} color={COLORS.primary} />
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptyText}>Try a different search.</Text>
              </View>
            ) : (
              filteredUsers.map((candidate) => {
                const isSelf = candidate.id === user.id;
                return (
                  <View key={candidate.id} style={styles.userRow}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="person-outline" size={17} color={COLORS.primary} />
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {displayName(candidate)}
                        {isSelf ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {candidate.email}
                      </Text>
                    </View>

                    {isSelf ? (
                      <View style={[styles.statusBadge, styles.statusBadgeApproved]}>
                        <Text style={[styles.statusBadgeText, styles.statusTextApproved]}>
                          {candidate.role}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.roleButtons}>
                        {ROLE_OPTIONS.map((roleOption) => (
                          <Pressable
                            key={roleOption}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected: candidate.role === roleOption,
                              disabled: workingId === candidate.id,
                            }}
                            onPress={() => handleRoleChange(candidate, roleOption)}
                            disabled={workingId === candidate.id}
                            style={[
                              styles.roleButton,
                              candidate.role === roleOption && styles.roleButtonActive,
                              workingId === candidate.id && styles.buttonDisabled,
                            ]}
                          >
                            {workingId === candidate.id &&
                            candidate.role === roleOption ? (
                              <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                              <Text
                                style={[
                                  styles.roleButtonText,
                                  candidate.role === roleOption &&
                                    styles.roleButtonTextActive,
                                ]}
                              >
                                {capitalize(roleOption)}
                              </Text>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 30,
    gap: 12,
  },
  heading: {
    marginBottom: 2,
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
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  /* GUARDS */

  guardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
    backgroundColor: 'transparent',
  },
  lockIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  guardTitle: {
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  guardText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  guardAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  guardActionText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  /* STATS */

  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statValue: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  /* SEGMENT + FILTERS */

  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.card,
  },
  segmentActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  segmentText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: COLORS.textOnPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    paddingHorizontal: 13,
  },
  filterChipActive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: COLORS.primary,
  },

  /* CARDS */

  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  cardMeta: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: COLORS.surface,
  },
  statusBadgePending: {
    backgroundColor: COLORS.surface,
  },
  statusBadgeApproved: {
    backgroundColor: COLORS.successSurface,
  },
  statusBadgeRejected: {
    backgroundColor: COLORS.errorSurface,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  statusTextPending: {
    color: COLORS.warning,
  },
  statusTextApproved: {
    color: COLORS.success,
  },
  statusTextRejected: {
    color: COLORS.danger,
  },
  reasonText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  approveButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    paddingHorizontal: 14,
  },
  approveButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  rejectButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#EBC9C8',
    borderRadius: 10,
    backgroundColor: COLORS.errorSurface,
    paddingHorizontal: 12,
  },
  rejectButtonText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  idImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  rejectForm: {
    gap: 8,
  },
  reasonInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  rejectFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },

  /* USERS */

  searchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    padding: 12,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 5,
  },
  roleButton: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 8,
    minWidth: 58,
  },
  roleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleButtonText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  roleButtonTextActive: {
    color: COLORS.textOnPrimary,
  },

  /* STATES */

  statePanel: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  stateText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: COLORS.card,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 6,
  },
  emptyTitle: {
    marginTop: 4,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  retryText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
