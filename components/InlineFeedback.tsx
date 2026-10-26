import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type FeedbackKind = 'error' | 'success' | 'info';

type Props = {
  kind: FeedbackKind;
  message: string;
  compact?: boolean;
};

const FEEDBACK = {
  error: {
    icon: 'alert-circle-outline',
    color: COLORS.danger,
    background: COLORS.errorSurface,
    border: '#EBC9C8',
  },
  success: {
    icon: 'checkmark-circle-outline',
    color: COLORS.success,
    background: COLORS.successSurface,
    border: '#BBDCCB',
  },
  info: {
    icon: 'information-circle-outline',
    color: COLORS.primary,
    background: COLORS.surface,
    border: COLORS.border,
  },
} as const;

export default function InlineFeedback({ kind, message, compact = false }: Props) {
  const appearance = FEEDBACK[kind];

  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : 'text'}
      style={[
        styles.container,
        {
          backgroundColor: appearance.background,
          borderColor: appearance.border,
        },
        compact && styles.compact,
      ]}
    >
      <Ionicons
        name={appearance.icon}
        size={compact ? 16 : 18}
        color={appearance.color}
        style={styles.icon}
      />
      <Text style={[styles.message, { color: appearance.color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  icon: {
    marginRight: 8,
    marginTop: 1,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
