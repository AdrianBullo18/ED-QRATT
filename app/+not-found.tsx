import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';

import GradientBackground from '@/components/GradientBackground';
import { COLORS } from '@/constants/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <View style={styles.container}>
        <GradientBackground />
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.subtitle}>This screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          Return to QR-ATT
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 28,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 7,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  link: {
    marginTop: 18,
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
