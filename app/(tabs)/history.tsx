import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountRole } from '@/hooks/useAccountRole';
import {
  getAttendanceHistory,
  getEventAttendance,
  getTeacherEventSummary,
  type AttendanceRecord,
  type TeacherEventAttendance,
  type TeacherEventSummary,
} from '@/lib/attendance';

export default function HistoryScreen() {
  const { user, refreshProfile, profileLoading } = useAuth();
  const { role } = useAccountRole(user);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventSummary[]>([]);
  const [attendeeDetails, setAttendeeDetails] = useState<
    Record<string, TeacherEventAttendance>
  >({});
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendeeError, setAttendeeError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Keep the role fresh on focus so approvals apply without an app restart.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadHistory = async () => {
        if (!user) {
          setLoading(false);
          setError('Sign in to view attendance history.');
          return;
        }

        if (!role) {
          if (profileLoading) {
            setLoading(true);
            setError(null);
            return;
          }
          setLoading(false);
          setError('We couldn’t confirm your account role. Refresh your account and try again.');
          return;
        }

        setLoading(true);
        setError(null);
        setExpandedEventId(null);
        setAttendeeDetails({});
        setAttendeeError(false);

        try {
          if (role === 'teacher') {
            const summaries = await getTeacherEventSummary(user.id);
            if (active) setTeacherEvents(summaries);
          } else {
            const records = await getAttendanceHistory(user.id);
            if (active) setStudentRecords(records);
          }
        } catch {
          if (active) setError('We couldn’t load attendance. Check your connection and try again.');
        } finally {
          if (active) setLoading(false);
        }
      };

      void loadHistory();
      return () => {
        active = false;
      };
    }, [user, role, profileLoading, retryKey])
  );

  const loadAttendees = async (eventId: string) => {
    setLoadingAttendees(true);
    setAttendeeError(false);
    try {
      const detail = await getEventAttendance(eventId);
      if (detail) {
        setAttendeeDetails((current) => ({ ...current, [eventId]: detail }));
      }
    } catch {
      setAttendeeError(true);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const toggleAttendees = (eventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    setExpandedEventId(eventId);
    setAttendeeError(false);
    if (!attendeeDetails[eventId]) void loadAttendees(eventId);
  };

  return (
    <View style={styles.container}>
      <GradientBackground />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{role === 'teacher' ? 'TEACHER TOOLS' : 'YOUR ATTENDANCE'}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {role === 'teacher' ? 'Attendance by Event' : 'Attendance History'}
          </Text>
          <Text style={styles.subtitle}>
            {role === 'teacher'
              ? 'Review check-ins for the events you created.'
              : 'Your recorded school events, newest first.'}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="time-outline" size={21} color={COLORS.primary} />
        </View>
      </View>

      {loading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <Text style={styles.stateText}>Loading attendance…</Text>
        </View>
      ) : error ? (
        <View style={styles.statePanel}>
          <InlineFeedback kind="error" message={error} />
          <Pressable accessibilityRole="button" onPress={() => setRetryKey((key) => key + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : role === 'teacher' ? (
        teacherEvents.length === 0 ? (
          <EmptyState message="No events yet. Create an event to start taking attendance." />
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const expanded = expandedEventId === item.eventId;
              const detail = attendeeDetails[item.eventId];
              return (
                <View style={styles.eventCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => toggleAttendees(item.eventId)}
                    style={({ pressed }) => [styles.eventPressable, pressed && styles.eventPressed]}
                  >
                    <View style={styles.eventHeading}>
                      <View style={styles.eventTitleBlock}>
                        <Text style={styles.eventTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.eventCode}>Event code · {item.eventCode}</Text>
                      </View>
                      <View style={styles.countBadge}>
                        <Text style={styles.countValue}>{item.attendeeCount}</Text>
                        <Text style={styles.countLabel}>CHECKED IN</Text>
                      </View>
                    </View>
                    <View style={styles.expandHint}>
                      <Text style={styles.expandText}>
                        {expanded ? 'Hide attendees' : 'View attendees'}
                      </Text>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={17}
                        color={COLORS.primary}
                      />
                    </View>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.attendeeSection}>
                      {loadingAttendees && !detail ? (
                        <View style={styles.inlineLoading}>
                          <ActivityIndicator color={COLORS.primary} size="small" />
                          <Text style={styles.metaText}>Loading check-ins…</Text>
                        </View>
                      ) : attendeeError ? (
                        <View>
                          <InlineFeedback kind="error" compact message="Couldn’t load attendees." />
                          <Pressable accessibilityRole="button" onPress={() => void loadAttendees(item.eventId)} style={styles.retryButton}>
                            <Text style={styles.retryText}>Try again</Text>
                          </Pressable>
                        </View>
                      ) : detail?.attendees.length ? (
                        detail.attendees.map((attendee) => (
                          <View key={`${item.eventId}-${attendee.studentId}`} style={styles.attendeeRow}>
                            <View style={styles.attendeeIdentity}>
                              <Ionicons name="person-circle-outline" size={22} color={COLORS.primary} />
                              <View style={styles.attendeeCopy}>
                                <Text style={styles.attendeeName} numberOfLines={1}>
                                  {attendee.studentName?.trim() || shortId(attendee.studentId)}
                                </Text>
                                <Text style={styles.attendeeTime}>{formatDate(attendee.scannedAt)}</Text>
                              </View>
                            </View>
                            <View style={styles.recordedBadge}>
                              <Text style={styles.recordedText}>Recorded</Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noAttendees}>No one has checked in yet.</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )
      ) : studentRecords.length === 0 ? (
        <EmptyState message="No records yet. Scan an event QR code to check in." />
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.studentCard}>
              <View style={styles.eventHeading}>
                <View style={styles.recordIcon}>
                  <Ionicons name="calendar-outline" size={19} color={COLORS.primary} />
                </View>
                <View style={styles.recordCopy}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{item.eventTitle}</Text>
                  <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              </View>
              <View style={styles.codeRow}>
                <Text style={styles.codeLabel}>Event code</Text>
                <Text style={styles.eventCode}>{item.eventCode}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="file-tray-outline" size={26} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>Nothing recorded yet</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'Unknown student';
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
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
    maxWidth: 380,
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.surface,
  },
  list: {
    paddingBottom: 26,
  },
  studentCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    padding: 15,
    marginBottom: 10,
  },
  eventCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    marginBottom: 10,
    overflow: 'hidden',
  },
  eventPressable: {
    padding: 15,
  },
  eventPressed: {
    backgroundColor: COLORS.inputBackground,
  },
  eventHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  eventTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  eventCode: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  countBadge: {
    minWidth: 64,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
  },
  countValue: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  countLabel: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  expandText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  attendeeSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  attendeeRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  attendeeIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attendeeCopy: {
    flex: 1,
    minWidth: 0,
  },
  attendeeName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  attendeeTime: {
    marginTop: 3,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  recordedBadge: {
    borderRadius: 999,
    backgroundColor: COLORS.successSurface,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recordedText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
  },
  noAttendees: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  recordIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  recordCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 5,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    marginTop: 12,
    paddingTop: 10,
  },
  codeLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  statePanel: {
    marginTop: 22,
    alignItems: 'center',
    gap: 12,
  },
  stateText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  inlineLoading: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  emptyState: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 15,
    backgroundColor: COLORS.card,
    paddingHorizontal: 24,
    paddingVertical: 26,
    marginTop: 22,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },
  emptyTitle: {
    marginTop: 12,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
});
