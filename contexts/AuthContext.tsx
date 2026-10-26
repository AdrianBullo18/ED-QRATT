
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase, clearStoredSession } from '@/lib/supabase';
import {
  signIn as signInWithSupabase,
  signOut as signOutFromSupabase,
  signUp as signUpWithSupabase,
  type AuthActionResult,
  type SignUpProfile,
} from '@/lib/auth';
import { getProfile, type Profile, type Role } from '@/lib/profiles';

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signingOut: boolean;
  /**
   * Profile row of the signed-in user, loaded once per session. `role` is
   * derived from it so every screen reads the same value.
   */
  profile: Profile | null;
  role: Role | null;
  profileLoading: boolean;
  profileError: boolean;
  /** Re-reads the profile (e.g. after approval or profile edits). */
  refreshProfile: () => Promise<void>;
  signIn: (
    email: string,
    password: string
  ) => Promise<AuthActionResult>;
  signUp: (
    email: string,
    password: string,
    profile: SignUpProfile
  ) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);

  const signingOutRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const profileRequestIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    // Subscribe first so auth changes aren't missed during initialization.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setLoading(false);
    });

    // Load the persisted session.
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error(
            '[AuthContext] Failed to load session:',
            error.message
          );
          setSession(null);
          return;
        }

        setSession(data.session);
      } catch (error) {
        console.error('[AuthContext] Session initialization failed:', error);

        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  userRef.current = user;
  const userId = user?.id ?? null;

  const refreshProfile = useCallback(async (): Promise<void> => {
    const currentUser = userRef.current;

    if (!currentUser) {
      profileRequestIdRef.current += 1;
      setProfile(null);
      setProfileError(false);
      setProfileLoading(false);
      return;
    }

    const requestId = ++profileRequestIdRef.current;
    setProfileLoading(true);

    try {
      const nextProfile = await getProfile(currentUser.id);
      if (requestId !== profileRequestIdRef.current) return;
      setProfile(nextProfile);
      setProfileError(false);
    } catch (error) {
      if (requestId !== profileRequestIdRef.current) return;
      console.error('[AuthContext] Failed to load profile:', error);
      setProfileError(true);
    } finally {
      if (requestId === profileRequestIdRef.current) {
        setProfileLoading(false);
      }
    }
  }, []);

  // Load the profile once per signed-in user (id-keyed so token refreshes
  // don't refetch).
  useEffect(() => {
    if (!userId) {
      profileRequestIdRef.current += 1;
      setProfile(null);
      setProfileError(false);
      setProfileLoading(false);
      return;
    }

    void refreshProfile();
  }, [userId, refreshProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithSupabase(
        email.trim(),
        password
      );

      if (result.session) {
        setSession(result.session);
      }

      return result;
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      profile: SignUpProfile
    ) => {
      const result = await signUpWithSupabase(
        email.trim(),
        password,
        profile
      );

      if (result.session) {
        setSession(result.session);
      }

      return result;
    },
    []
  );

  const signOut = useCallback(async (): Promise<void> => {
    if (signingOutRef.current) return;

    signingOutRef.current = true;
    setSigningOut(true);

    try {
      const { error } = await signOutFromSupabase();

      if (error) {
        throw error;
      }
    } finally {
      // Clear the local session even if the server request fails.
      setSession(null);
      profileRequestIdRef.current += 1;
      setProfile(null);
      setProfileError(false);
      setProfileLoading(false);

      try {
        await clearStoredSession();
      } catch (error) {
        console.error(
          '[AuthContext] Failed to clear stored session:',
          error
        );
      }

      signingOutRef.current = false;
      setSigningOut(false);
    }
  }, []);

  const role = profile?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      signingOut,
      profile,
      role,
      profileLoading,
      profileError,
      refreshProfile,
      signIn,
      signUp,
      signOut,
    }),
    [
      session,
      user,
      loading,
      signingOut,
      profile,
      role,
      profileLoading,
      profileError,
      refreshProfile,
      signIn,
      signUp,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
