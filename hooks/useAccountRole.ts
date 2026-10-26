import { useCallback } from 'react';
import type { User } from '@supabase/supabase-js';

import type { Role } from '@/lib/profiles';
import { useAuth } from '@/contexts/AuthContext';

type AccountRoleState = {
  role: Role | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
};

/**
 * Resolves the current user's role.
 *
 * The role is owned by AuthContext (one profile fetch per session), so the
 * tab bar, Home and every screen read the same value — no duplicate queries
 * and no disagreement after a role change. `user` only decides whether a
 * role can be reported at all (signed-out callers get null).
 */
export function useAccountRole(user: User | null): AccountRoleState {
  const { role, profileLoading, profileError, refreshProfile } = useAuth();

  const refresh = useCallback(() => {
    void refreshProfile();
  }, [refreshProfile]);

  if (!user) {
    return { role: null, loading: false, error: false, refresh };
  }

  return {
    role,
    loading: profileLoading && role === null,
    error: profileError && role === null,
    refresh,
  };
}
