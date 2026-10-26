import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountRole } from '@/hooks/useAccountRole';
import { createEvent } from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';

function toLocalISO(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const { user, refreshProfile } = useAuth();
  const {
    role,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useAccountRole(user);
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'error' | 'success' | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAndroid = Platform.OS === 'android';

  // Re-read the role on focus so a freshly approved account sees this screen
  // without restarting the app.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setMessageKind(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!editTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (editTarget === 'start') setStartDate(next);
    else setEndDate(next);

    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (milliseconds: number) => {
    setMessage(null);
    setMessageKind(null);
    setEndDate(new Date(startDate.getTime() + milliseconds));
  };

  const handleCreateEvent = async () => {
    setAttempted(true);
    setMessage(null);
    setMessageKind(null);
    setPayload(null);

    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
    };

    if (!event.eventId || !event.title) {
      setMessage('Add the highlighted event details to continue.');
      setMessageKind('error');
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('End time must be after the start time. Update the event window to continue.');
      setMessageKind('error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createEvent(event);
      if (result.error) {
        setMessage(`Could not save the event: ${result.error}`);
        setMessageKind('error');
        return;
      }
      setMessage('Event saved. Display this QR for students to check in.');
      setMessageKind('success');
      setPayload(buildQRPayload(event));
    } catch {
      setMessage('Could not save the event. Please try again.');
      setMessageKind('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (roleLoading) {
    return (
      <View style={styles.guardContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.guardTitle}>Checking your account…</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.guardContainer}>
        <Ionicons name="lock-closed-outline" size={30} color={COLORS.textSecondary} />
        <Text style={styles.guardTitle}>Sign in required</Text>
        <Text style={styles.guardText}>Sign in to access event tools.</Text>
        <Pressable onPress={() => router.replace('/sign-in')} style={styles.guardAction}>
          <Text style={styles.guardActionText}>Go to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (roleError) {
    return (
      <View style={styles.guardContainer}>
        <View style={styles.lockIcon}>
          <Ionicons name="alert-circle-outline" size={24} color={COLORS.danger} />
        </View>
        <Text style={styles.guardTitle}>Couldn’t verify teacher access</Text>
        <Text style={styles.guardText}>Check your connection, then try again.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={refreshRole}
          style={styles.guardAction}
        >
          <Text style={styles.guardActionText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (role !== 'teacher') {
    return (
      <View style={styles.guardContainer}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={24} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.guardTitle}>Teachers Only</Text>
        <Text style={styles.guardText}>Only teacher accounts can create events.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GradientBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.eyebrow}>TEACHER TOOLS</Text>
      <Text accessibilityRole="header" style={styles.title}>Create an event</Text>
      <Text style={styles.subtitle}>
        Set the check-in window, then share the QR code with students.
      </Text>

      <View style={styles.formGroup}>
        <Text style={styles.formSectionTitle}>Event details</Text>
        <Text style={styles.label}>Event title</Text>
        <TextInput
          accessibilityLabel="Event title"
          style={[styles.input, attempted && !title.trim() && styles.inputError]}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setMessage(null);
            setMessageKind(null);
          }}
          placeholder="e.g. Founders Day Assembly"
          placeholderTextColor={COLORS.textMuted}
          editable={!submitting}
        />
        {attempted && !title.trim() ? <Text style={styles.fieldError}>Enter an event title.</Text> : null}

        <Text style={styles.label}>Event code</Text>
        <TextInput
          accessibilityLabel="Event code"
          style={[styles.input, attempted && !eventId.trim() && styles.inputError]}
          value={eventId}
          onChangeText={(value) => {
            setEventId(value);
            setMessage(null);
            setMessageKind(null);
          }}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
        />
        {attempted && !eventId.trim() ? <Text style={styles.fieldError}>Enter an event code.</Text> : null}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formSectionTitle}>Check-in window</Text>
        <Text style={styles.label}>Starts</Text>
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker('start')}
        />

        <Text style={styles.label}>Ends</Text>
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker('end')}
        />
        {attempted && endDate.getTime() <= startDate.getTime() ? (
          <Text style={styles.fieldError}>End time must be after the start time.</Text>
        ) : null}

        <Text style={styles.quickLabel}>Quick end time</Text>
        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => {
            const selected = Math.abs(endDate.getTime() - startDate.getTime() - option.ms) < 60_000;
            return (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.chipPressed,
                ]}
                onPress={() => handleQuickEnd(option.ms)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {selected ? `✓ ${option.label}` : option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Choose a suggested end time or set it directly above.</Text>
      </View>

      {message ? <InlineFeedback kind={messageKind ?? 'error'} message={message} /> : null}

      <AppButton
        theme="primary"
        title={submitting ? 'Saving event…' : 'Create event'}
        icon="add-circle-outline"
        onPress={() => void handleCreateEvent()}
        disabled={submitting}
        loading={submitting}
      />

      {editTarget ? (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      ) : null}

      {payload ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeading}>
            <View style={styles.resultHeadingCopy}>
              <Text style={styles.resultTitle}>QR ready to share</Text>
              <Text style={styles.resultSubtitle}>Students scan this displayed code to check in.</Text>
            </View>
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
              <Text style={styles.savedText}>Saved</Text>
            </View>
          </View>
          <View style={styles.qrResultRow}>
            <View style={styles.qrBox}>
              <QRCode value={payload} size={148} />
            </View>
            <View style={styles.qrInstructions}>
              <Text style={styles.qrInstructionTitle}>Display at the event</Text>
              <Text style={styles.payloadText}>
                Keep the code visible on a screen or print it for students to scan.
              </Text>
              <Text style={styles.resultEventCode}>Event code · {eventId.trim()}</Text>
            </View>
          </View>
        </View>
      ) : null}
      </ScrollView>
    </View>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.pickerField, pressed && styles.pickerFieldPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.pickerValue}>
        {value}
      </Text>
      <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
    </Pressable>
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
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 40,
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
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 5,
    marginBottom: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  formGroup: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    padding: 15,
    marginBottom: 14,
  },
  formSectionTitle: {
    marginBottom: 4,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    marginTop: 13,
    marginBottom: 7,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  inputError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.errorSurface,
  },
  fieldError: {
    marginTop: 5,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  pickerField: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 13,
  },
  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },
  pickerValue: {
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginHorizontal: 10,
  },
  quickLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    paddingHorizontal: 13,
  },
  chipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  chipPressed: {
    borderColor: COLORS.navy,
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  guardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 32,
  },
  lockIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 28,
    backgroundColor: COLORS.card,
  },
  guardTitle: {
    marginTop: 14,
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  guardText: {
    marginTop: 7,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  guardAction: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  guardActionText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  resultCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    padding: 15,
    marginTop: 6,
  },
  resultHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  resultHeadingCopy: {
    flex: 1,
  },
  resultTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  resultSubtitle: {
    marginTop: 4,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: COLORS.successSurface,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  savedText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
  },
  qrResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 14,
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
  },
  qrInstructions: {
    flex: 1,
    minWidth: 0,
  },
  qrInstructionTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  payloadText: {
    marginTop: 4,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'left',
  },
  resultEventCode: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
