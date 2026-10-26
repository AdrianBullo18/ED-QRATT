import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import GradientBackground from '@/components/GradientBackground';
import InlineFeedback from '@/components/InlineFeedback';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountRole } from '@/hooks/useAccountRole';
import { registerAttendance } from '@/lib/attendance';

export default function ScanScreen() {
  const { user } = useAuth();
  const { role } = useAccountRole(user);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (role === null) {
    return (
      <View style={styles.permissionContainer}>
        <GradientBackground />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.permissionTitle}>Checking your account…</Text>
        <Text style={styles.permissionSubtitle}>This will only take a moment.</Text>
      </View>
    );
  }

  if (role !== 'student') {
    return (
      <View style={styles.permissionContainer}>
        <GradientBackground />
        <View style={styles.permissionIcon}>
          <Ionicons name="lock-closed-outline" size={24} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.permissionTitle}>Students Only</Text>
        <Text style={styles.permissionSubtitle}>
          Only student accounts can scan event QR codes.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <GradientBackground />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.permissionTitle}>Preparing the camera…</Text>
        <Text style={styles.permissionSubtitle}>This will only take a moment.</Text>
      </View>
    );
  }

  if (!permission.granted) {
    const canRequest = permission.canAskAgain;
    return (
      <View style={styles.permissionContainer}>
        <GradientBackground />
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={25} color={COLORS.primary} />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionSubtitle}>
          Allow camera access to scan the event QR code and record attendance.
          {!canRequest ? ' Camera access is currently blocked in your device settings.' : ''}
        </Text>
        <AppButton
          theme="primary"
          title={canRequest ? 'Allow camera access' : 'Open Settings'}
          icon={canRequest ? 'camera-outline' : 'settings-outline'}
          onPress={() => {
            if (canRequest) void requestPermission();
            else void Linking.openSettings();
          }}
        />
        <Text style={styles.permissionHint}>
          You can return here after updating your camera permission.
        </Text>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || submitting) return;
    setScanned(true);
    setSubmitting(true);
    setMessage(null);
    setEventTitle(null);

    if (!user) {
      setMessage('Sign in to record attendance.');
      setSuccess(false);
      setSubmitting(false);
      return;
    }

    try {
      const result = await registerAttendance(data, user.id);
      setMessage(result.message);
      setEventTitle(result.eventTitle ?? null);
      setSuccess(result.success);
    } catch {
      setMessage('Could not record attendance. Please try again.');
      setSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanAgain = () => {
    setScanned(false);
    setEventTitle(null);
    setMessage(null);
    setSuccess(false);
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />
      <View pointerEvents="none" style={styles.cameraScrim} />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.topEyebrow}>QR-ATT</Text>
          <Text style={styles.topTitle}>Scan event QR</Text>
        </View>
        <View style={styles.cameraReadyBadge}>
          <View style={styles.readyDot} />
          <Text style={styles.cameraReadyText}>{scanned ? 'Code found' : 'Camera ready'}</Text>
        </View>
      </View>

      {!scanned ? (
        <View pointerEvents="none" style={styles.scanGuide}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
      ) : null}

      <View style={styles.overlay}>
        {scanned ? (
          <>
            <Text style={styles.overlayTitle}>{success ? 'Attendance recorded' : 'Check-in update'}</Text>
            {submitting ? (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.status}>Checking the event…</Text>
              </View>
            ) : message ? (
              <InlineFeedback kind={success ? 'success' : 'error'} message={message} />
            ) : null}
            {eventTitle ? <Text style={styles.eventTitle}>{eventTitle}</Text> : null}
            {!submitting ? (
              <View style={styles.scanAgain}>
                <AppButton
                  theme="primary"
                  title="Scan Again"
                  icon="refresh"
                  onPress={handleScanAgain}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.overlayTitle}>Hold the QR inside the frame</Text>
            <Text style={styles.overlaySubtitle}>
              Keep your camera steady. Check-in happens automatically.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 28,
  },
  permissionIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    marginBottom: 16,
  },
  permissionTitle: {
    marginTop: 15,
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionSubtitle: {
    maxWidth: 380,
    marginTop: 8,
    marginBottom: 20,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 18, 40, 0.34)',
  },
  topBar: {
    position: 'absolute',
    top: 24,
    left: 22,
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topEyebrow: {
    color: '#D8E6F7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  topTitle: {
    marginTop: 3,
    color: COLORS.card,
    fontSize: 18,
    fontWeight: '800',
  },
  cameraReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: 999,
    backgroundColor: 'rgba(10,32,71,0.7)',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#85D3B0',
    marginRight: 7,
  },
  cameraReadyText: {
    color: COLORS.card,
    fontSize: 11,
    fontWeight: '700',
  },
  scanGuide: {
    width: 250,
    height: 250,
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
  },
  corner: {
    width: 38,
    height: 38,
    position: 'absolute',
    borderColor: '#FFFFFF',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  overlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    padding: 16,
  },
  overlayTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },
  overlaySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  eventTitle: {
    marginTop: 9,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  scanAgain: {
    marginTop: 12,
  },
});
