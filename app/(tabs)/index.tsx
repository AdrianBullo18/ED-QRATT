import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountRole } from '@/hooks/useAccountRole';
import { getAdminOverview, type AdminOverview } from '@/lib/admin';
import {
  getAttendanceHistory,
  getTeacherEventSummary,
  type AttendanceRecord,
  type TeacherEventSummary,
} from '@/lib/attendance';
import type { Role } from '@/lib/profiles';

export default function HomeScreen() {
  const { user } = useAuth();

  const {
    role,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useAccountRole(user);

  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventSummary[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);

  // Get user's display name
  const metadataName = user?.user_metadata?.full_name;

  const displayName =
    (typeof metadataName === 'string' && metadataName.trim()) ||
    user?.email?.split('@')[0] ||
    'there';

  // Load recent activity whenever the screen becomes active
  useFocusEffect(
    useCallback(() => {
      if (!user || !role) return;

      let active = true;

      setActivityLoading(true);
      setActivityError(false);

      const loadActivity = async () => {
        try {
          if (role === 'admin') {
            const overview = await getAdminOverview();

            if (active) {
              setAdminOverview(overview);
            }
          } else if (role === 'teacher') {
            const events = await getTeacherEventSummary(user.id);

            if (active) {
              setTeacherEvents(events.slice(0, 2));
            }
          } else {
            const records = await getAttendanceHistory(user.id);

            if (active) {
              setStudentRecords(records.slice(0, 2));
            }
          }
        } catch (error) {
          console.error('Failed to load activity:', error);

          if (active) {
            setActivityError(true);
          }
        } finally {
          if (active) {
            setActivityLoading(false);
          }
        }
      };

      void loadActivity();

      return () => {
        active = false;
      };
    }, [user, role])
  );

  // Retry loading activity
  const retryActivity = () => {
    if (!user || !role) {
      refreshRole();
      return;
    }

    setActivityError(false);
    setActivityLoading(true);

    const reload =
      role === 'admin'
        ? getAdminOverview().then((overview) => {
            setAdminOverview(overview);
          })
        : role === 'teacher'
        ? getTeacherEventSummary(user.id).then((events) => {
            setTeacherEvents(events.slice(0, 2));
          })
        : getAttendanceHistory(user.id).then((records) => {
            setStudentRecords(records.slice(0, 2));
          });
    void reload
      .catch((error) => {
        console.error('Failed to reload activity:', error);
        setActivityError(true);
      })
      .finally(() => {
        setActivityLoading(false);
      });
  };

  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';

  const primaryRoute = isAdmin ? '/admin' : isTeacher ? '/teacher' : '/scan';

  const actionAvailable =
    Boolean(role) && !roleLoading && !roleError;

  return (
    <View style={styles.safeArea}>
      <GradientBackground />
      <SafeAreaView style={styles.safeAreaInner}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}
          <View style={styles.brandRow}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={styles.logo}
              resizeMode="cover"
              accessible
              accessibilityLabel="QR-ATT app icon"
            />

            <View style={styles.brandText}>
              <Text style={styles.appName}>QR-ATT</Text>

              <Text style={styles.appSubtitle}>
                QR Attendance System
              </Text>

              <Text style={styles.authorText}>
                by: Adrian Clint B. Bullo
              </Text>
            </View>
          </View>

          {/* WELCOME */}
          <View style={styles.welcomeBlock}>
            <Text style={styles.welcomeLabel}>
              Welcome back
            </Text>

            <Text
              style={styles.welcomeName}
              numberOfLines={1}
            >
              {displayName}
            </Text>

            <Text style={styles.roleLine}>
              {roleLoading
                ? 'Checking your account…'
                : role
                  ? `${capitalize(role)} account`
                  : 'Attendance dashboard'}
            </Text>
          </View>

          {/* MAIN ACTION */}
          <View style={styles.actionPanel}>
            <View style={styles.panelHeading}>
              <View style={styles.panelIcon}>
                <Ionicons
                  name={
                    isAdmin
                      ? 'shield-checkmark-outline'
                      : isTeacher
                      ? 'calendar-outline'
                      : 'qr-code-outline'
                  }
                  size={20}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.panelCopy}>
                <Text style={styles.panelEyebrow}>
                  {roleLoading
                    ? 'Preparing your account'
                    : isAdmin
                    ? 'Admin console'
                    : isTeacher
                    ? 'Teacher tools'
                    : 'Your next step'}
                </Text>

                <Text style={styles.panelTitle}>
                  {roleLoading
                    ? 'Loading your tools…'
                    : isAdmin
                    ? 'Review applications'
                    : isTeacher
                    ? 'Create an event'
                    : 'Scan an event QR'}
                </Text>
              </View>
            </View>

            <Text style={styles.panelDescription}>
              {roleLoading
                ? 'We’re confirming which attendance tools belong to your account.'
                : isAdmin
                ? 'Approve or reject teacher requests and manage who holds each role.'
                : isTeacher
                ? 'Set the event time window, then share the QR code with students.'
                : 'Check in when your teacher displays the event code.'}
            </Text>

            <AppButton
              theme="primary"
              title={
                isAdmin
                  ? 'Open Admin Console'
                  : isTeacher
                  ? 'Create Event QR'
                  : 'Scan QR Code'
              }
              icon={
                isAdmin
                  ? 'shield-checkmark-outline'
                  : isTeacher
                  ? 'add-circle-outline'
                  : 'qr-code-outline'
              }
              onPress={() => router.push(primaryRoute)}
              disabled={!actionAvailable}
            />
          </View>

          {/* ACTIVITY HEADER */}
          <View style={styles.activityHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                {isAdmin
                  ? 'Overview'
                  : isTeacher
                  ? 'Your events'
                  : 'Recent attendance'}
              </Text>

              <Text style={styles.sectionDescription}>
                {isAdmin
                  ? 'Your console at a glance'
                  : isTeacher
                  ? 'Events you’ve created'
                  : 'Your latest check-ins'}
              </Text>
            </View>

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(isAdmin ? '/admin' : '/history')}
              style={styles.historyLink}
            >
              <Text style={styles.historyLinkText}>
                {isAdmin ? 'Open console' : 'View history'}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={16}
                color={COLORS.primary}
              />
            </Pressable>
          </View>

          {/* LOADING */}
          {roleLoading || activityLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
              />

              <Text style={styles.loadingText}>
                Loading your attendance…
              </Text>
            </View>
          ) : roleError ? (
            /* ROLE ERROR */
            <View style={styles.errorPanel}>
              <InlineFeedback
                kind="error"
                message="We couldn’t confirm your account role. Your attendance data is unchanged."
              />

              <Pressable
                accessibilityRole="button"
                onPress={refreshRole}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : role === null ? (
            /* NO ROLE */
            <EmptyActivity
              message="Your role information isn’t available yet. You can still open your attendance history."
              actionLabel="Open history"
              onPress={() => router.push('/history')}
            />
          ) : activityError ? (
            /* ACTIVITY ERROR */
            <View style={styles.errorPanel}>
              <InlineFeedback
                kind="error"
                message="We couldn’t load your recent activity. Your existing records are unchanged."
              />

              <Pressable
                accessibilityRole="button"
                onPress={retryActivity}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : isAdmin ? (
            /* ADMIN OVERVIEW */
            adminOverview ? (
              <View style={styles.activityList}>
                <View style={styles.activityRow}>
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name="people-outline"
                      size={18}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>Users</Text>
                    <Text style={styles.activityMeta}>
                      Registered accounts
                    </Text>
                  </View>

                  <View style={styles.countBadge}>
                    <Text style={styles.countNumber}>
                      {adminOverview.userCount}
                    </Text>
                    <Text style={styles.countLabel}>TOTAL</Text>
                  </View>
                </View>

                <View style={styles.activityRow}>
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color={COLORS.warning}
                    />
                  </View>

                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>
                      Pending applications
                    </Text>
                    <Text style={styles.activityMeta}>
                      Teacher requests awaiting review
                    </Text>
                  </View>

                  <View style={styles.countBadge}>
                    <Text style={styles.countNumber}>
                      {adminOverview.pendingApplications}
                    </Text>
                    <Text style={styles.countLabel}>WAITING</Text>
                  </View>
                </View>

                <View style={styles.activityRow}>
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>Events</Text>
                    <Text style={styles.activityMeta}>
                      Created across all teachers
                    </Text>
                  </View>

                  <View style={styles.countBadge}>
                    <Text style={styles.countNumber}>
                      {adminOverview.eventCount}
                    </Text>
                    <Text style={styles.countLabel}>TOTAL</Text>
                  </View>
                </View>
              </View>
            ) : (
              <EmptyActivity
                message="Your overview isn’t available yet."
                actionLabel="Open Admin Console"
                onPress={() => router.push('/admin')}
              />
            )
          ) : isTeacher ? (
            /* TEACHER EVENTS */
            teacherEvents.length ? (
              <View style={styles.activityList}>
                {teacherEvents.map((event) => (
                  <View
                    key={event.eventId}
                    style={styles.activityRow}
                  >
                    <View style={styles.activityIcon}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={COLORS.primary}
                      />
                    </View>

                    <View style={styles.activityCopy}>
                      <Text
                        style={styles.activityTitle}
                        numberOfLines={1}
                      >
                        {event.title}
                      </Text>

                      <Text style={styles.activityMeta}>
                        Event code · {event.eventCode}
                      </Text>
                    </View>

                    <View style={styles.countBadge}>
                      <Text style={styles.countNumber}>
                        {event.attendeeCount}
                      </Text>

                      <Text style={styles.countLabel}>
                        HERE
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyActivity
                message="No events yet. Create an event to start taking attendance."
                actionLabel="Create an event"
                onPress={() => router.push('/teacher')}
              />
            )
          ) : studentRecords.length ? (
            /* STUDENT ATTENDANCE */
            <View style={styles.activityList}>
              {studentRecords.map((record) => (
                <View
                  key={record.id}
                  style={styles.activityRow}
                >
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color={COLORS.success}
                    />
                  </View>

                  <View style={styles.activityCopy}>
                    <Text
                      style={styles.activityTitle}
                      numberOfLines={1}
                    >
                      {record.eventTitle}
                    </Text>

                    <Text style={styles.activityMeta}>
                      {formatDate(record.scannedAt)}
                    </Text>
                  </View>

                  <Text style={styles.recordedBadge}>
                    Recorded
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            /* EMPTY STUDENT ACTIVITY */
            <EmptyActivity
              message="Nothing recorded yet. Scan an event QR code and your check-in will appear here."
              actionLabel="Scan an event QR"
              onPress={() => router.push('/scan')}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* =========================
   EMPTY ACTIVITY
============================ */

function EmptyActivity({
  message,
  actionLabel,
  onPress,
}: {
  message: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyPanel}>
      <Ionicons
        name="file-tray-outline"
        size={22}
        color={COLORS.textMuted}
      />

      <Text style={styles.emptyMessage}>
        {message}
      </Text>

      <Pressable
        accessibilityRole="link"
        onPress={onPress}
        style={styles.emptyAction}
      >
        <Text style={styles.historyLinkText}>
          {actionLabel}
        </Text>

        <Ionicons
          name="chevron-forward"
          size={15}
          color={COLORS.primary}
        />
      </Pressable>
    </View>
  );
}

/* =========================
   HELPERS
============================ */

function capitalize(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

/* =========================
   STYLES
============================ */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  safeAreaInner: {
    flex: 1,
  },

  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
  },

  /* HEADER */

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },

  brandText: {
    flex: 1,
  },

  appName: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  appSubtitle: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  authorText: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },

  /* WELCOME */

  welcomeBlock: {
    marginTop: 30,
  },

  welcomeLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  welcomeName: {
    marginTop: 3,
    color: COLORS.navy,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },

  roleLine: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontSize: 13,
  },

  /* ACTION PANEL */

  actionPanel: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    padding: 18,
  },

  panelHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  panelIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },

  panelCopy: {
    flex: 1,
  },

  panelEyebrow: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  panelTitle: {
    marginTop: 2,
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: '800',
  },

  panelDescription: {
    marginTop: 10,
    marginBottom: 14,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  /* ACTIVITY */

  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
    gap: 12,
  },

  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },

  sectionDescription: {
    marginTop: 3,
    color: COLORS.textSecondary,
    fontSize: 12,
  },

  historyLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 3,
  },

  historyLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  /* LOADING */

  loadingRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  /* ERRORS */

  errorPanel: {
    gap: 6,
  },

  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  retryText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  /* ACTIVITY LIST */

  activityList: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },

  activityRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  activityIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },

  activityCopy: {
    flex: 1,
    minWidth: 0,
  },

  activityTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  activityMeta: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
  },

  countBadge: {
    minWidth: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  countNumber: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '800',
  },

  countLabel: {
    marginTop: 1,
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  recordedBadge: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
  },

  /* EMPTY */

  emptyPanel: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 15,
    backgroundColor: COLORS.card,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },

  emptyMessage: {
    marginTop: 9,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  emptyAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
});
