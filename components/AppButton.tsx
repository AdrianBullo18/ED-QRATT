import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function AppButton({
  title,
  icon,
  theme,
  onPress,
  disabled = false,
  loading = false,
}: Props) {
  const primary = theme === 'primary';
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed && !unavailable && (primary ? styles.primaryPressed : styles.secondaryPressed),
        unavailable && (primary ? styles.primaryDisabled : styles.secondaryDisabled),
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? COLORS.primary : COLORS.textSecondary}
          style={styles.icon}
        />
      ) : (
        <Ionicons
          name={icon}
          size={20}
          color={primary && unavailable ? COLORS.textMuted : primary ? COLORS.textOnPrimary : COLORS.primary}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.label,
          primary ? styles.primaryLabel : styles.secondaryLabel,
          unavailable && (primary ? styles.primaryDisabledLabel : styles.secondaryDisabledLabel),
        ]}
      >
        {title}
      </Text>
      {loading ? <View accessibilityElementsHidden style={styles.trailingSpace} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  primaryButton: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  primaryPressed: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.navy,
  },
  secondaryPressed: {
    backgroundColor: COLORS.surface,
  },
  primaryDisabled: {
    borderColor: '#D7E0EC',
    backgroundColor: '#E8EDF4',
  },
  secondaryDisabled: {
    borderColor: '#E5EAF1',
    backgroundColor: '#F5F7FA',
  },
  icon: {
    marginRight: 9,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryLabel: {
    color: COLORS.textOnPrimary,
  },
  secondaryLabel: {
    color: COLORS.textPrimary,
  },
  primaryDisabledLabel: {
    color: '#64758C',
  },
  secondaryDisabledLabel: {
    color: '#8794A6',
  },
  trailingSpace: {
    width: 29,
  },
});
