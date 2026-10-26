import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import GradientBackground from '@/components/GradientBackground';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { getProfile } from '@/lib/profiles';

/**
 * Post-login router.
 *
 * Supabase only authenticates the credential; it does not know about app
 * roles. Once the session is restored this route verifies that the user has a
 * profile row and then sends everyone to the tab layout, where the tab bar
 * and Home screen decide which tools are visible from the role value.
 *
 * A profile that cannot be loaded is treated as a recoverable error rather
 * than silently granting access: the user is still routed to the tab layout,
 * and the Home screen shows the role error with a retry option.
 *
 * Signed-out visitors are redirected to the sign-in screen immediately; they
 * must never sit on the splash while the session check is pending.
 */
export default function IndexRoute() {
  const { user, loading } = useAuth();
  const [routing, setRouting] = useState(false);

  // Every hook above is called unconditionally, in the same order, on every
  // render. Conditional navigation happens after the hook list is complete
  // so React never sees a different hook count between renders (which would
  // trigger "Rendered fewer hooks than expected").
  useEffect(() => {
    // Only start routing once Supabase has finished restoring the session.
    if (loading || !user) return;

    let active = true;
    setRouting(true);

    const resolveRoute = async () => {
      try {
        // Verify the profile exists for this user before routing. The role
        // itself is not used for routing: both student and teacher land on
        // the tab layout, and the teacher tab is hidden for students.
        await getProfile(user.id);
      } catch {
        // Profile lookup failed (RLS block, network, missing row). Fall back
        // to the tab layout rather than trapping the user on a blank screen;
        // the Home screen will show the role error and a retry.
      }

      if (!active) return;

      // Teacher applicants who still owe an application (sign-up happened
      // without a session) land on the application screen instead of Home.
      const pendingApplication =
        user.user_metadata?.pending_teacher_application === 'true';
      router.replace(pendingApplication ? '/teacher-application' : '/(tabs)');
      setRouting(false);
    };

    void resolveRoute();

    return () => {
      active = false;
    };
  }, [user, loading]);

  // Signed out: redirect to the sign-in screen. This is a render-phase
  // redirect placed AFTER every hook so the hook count stays stable.
  if (!loading && !user) {
    return <Redirect href="/sign-in" />;
  }

  // While Supabase restores the session or we resolve the route, show the
  // branded splash. This also covers the initial load before auth is ready.
  if (loading || routing) {
    return (
      <View style={styles.container}>
        <GradientBackground />
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
