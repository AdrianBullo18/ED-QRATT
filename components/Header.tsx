import { Image, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
  subtitle?: string;
};

export default function Header({
  title,
  subtitle = 'QR Attendance System',
}: Props) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/icon.png')}
        style={styles.logo}
        resizeMode="cover"
        accessible
        accessibilityLabel="QR-ATT app icon"
      />
      <View style={styles.brandText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: '#000000',
  },
  brandText: {
    flex: 1,
    marginLeft: 13,
  },
  title: {
    color: COLORS.card,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 3,
    color: '#D3E0F1',
    fontSize: 12,
    fontWeight: '500',
  },
});
