import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { getMyTeacherApplication } from '@/lib/teacherApplications';
import type { TeacherApplication } from '@/lib/teacherApplications';

type ApplicationState = {
  application: TeacherApplication | null;
  loading: boolean;
  refresh: () => void;
};

/**
 * Loads the current user's most recent teacher application (if any) so the
 * Profile screen can show the pending / approved / rejected status.
 */
export function useMyTeacherApplication(user: User | null): ApplicationState {
  const [application, setApplication] = useState<TeacherApplication | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!user) {
      setApplication(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    void getMyTeacherApplication(user.id)
      .then(({ application: result, error }) => {
        if (!active) return;
        setApplication(error ? null : result);
      })
      .catch(() => {
        if (active) setApplication(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  return { application, loading, refresh };
}