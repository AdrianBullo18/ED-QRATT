import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GRADIENT } from '@/constants/colors';

type Props = {
  /** Color stops for the gradient. Defaults to the app-wide blue theme. */
  colors?: readonly [string, string, ...string[]];
  /** Positions of each color stop (0–1). Must match the colors length. */
  locations?: readonly [number, number, ...number[]];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Reusable background gradient used across the app so every screen shares the
 * same blue -> light-blue treatment instead of duplicating color values.
 */
export default function GradientBackground({
  colors = GRADIENT.screen,
  locations = GRADIENT.locations,
  style,
  children,
}: Props) {
  return (
    <LinearGradient
      colors={colors}
      locations={locations}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={[styles.gradient, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
});
