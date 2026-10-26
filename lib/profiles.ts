import { supabase } from '@/lib/supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  /**
   * Storage path of the user's profile picture inside the private
   * `profile-images` bucket, e.g. `<user-uuid>/avatar.jpg`. Null when the
   * user has not uploaded a picture. The path is stored, never a signed URL,
   * so the picture survives session and app restarts.
   */
  avatar_path: string | null;
};

/**
 * The table constraint allows `student | teacher | admin`; anything else from
 * a legacy row is treated as `student` instead of being trusted.
 */
function normalizeRole(value: unknown): Role {
  return value === 'teacher' || value === 'admin' ? value : 'student';
}

/**
 * Loads the profile row that belongs to the currently authenticated user.
 *
 * The query is scoped to the base schema: `public.profiles` with columns
 * `id, email, full_name, role, avatar_path`. The row is matched on
 * `profiles.id`, which is the Supabase Auth user UUID (the base schema
 * declares it as `uuid primary key references auth.users (id) on delete
 * cascade`), so the returned row is guaranteed to belong to the signed-in
 * user.
 *
 * Errors are re-thrown so callers can distinguish a missing profile from a
 * permission or network failure. A role that is not `student`, `teacher` or
 * `admin` is normalized to `student` rather than silently kept, because the
 * table constraint is the authority on what is allowed.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  // The avatar migration adds `avatar_path`; query it first, and if PostgREST
  // reports the column is missing, retry with the base columns only so the
  // profile still loads on an un-migrated database (the avatar feature simply
  // stays unavailable until it does).
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, avatar_path')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: normalizeRole(data.role),
      avatar_path: data.avatar_path ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const isMissingColumn =
      normalized.includes('avatar_path') ||
      (normalized.includes('column') && normalized.includes('does not exist'));

    if (!isMissingColumn) {
      throw error;
    }

    // Retry without the migration-only column.
    const { data, error: retryError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    if (retryError) throw retryError;
    if (!data) return null;

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: normalizeRole(data.role),
      avatar_path: null,
    };
  }
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string | null; avatar_path?: string | null }
): Promise<{ error: string | null }> {
  // When the avatar migration has not been run, `avatar_path` does not exist
  // and any update that includes it would fail. Strip the field in that case
  // so name updates keep working; the avatar feature stays unavailable until
  // the migration is applied.
  const hasAvatarUpdate = updates.avatar_path !== undefined;

  if (!hasAvatarUpdate) {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: updates.full_name })
      .eq('id', userId);

    return { error: error?.message ?? null };
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('avatar_path') || (message.includes('column') && message.includes('does not exist'))) {
      // Fall back to a name-only update so the profile is not left broken.
      if (updates.full_name !== undefined) {
        const { error: fallbackError } = await supabase
          .from('profiles')
          .update({ full_name: updates.full_name })
          .eq('id', userId);
        return { error: fallbackError?.message ?? null };
      }
      return { error: error.message };
    }
    return { error: error.message };
  }

  return { error: null };
}
