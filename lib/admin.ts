import type { Role } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';
import type { TeacherApplication } from '@/lib/teacherApplications';

export type AdminOverview = {
  userCount: number;
  pendingApplications: number;
  eventCount: number;
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

function normalizeRole(value: unknown): Role {
  return value === 'teacher' || value === 'admin' ? value : 'student';
}

function toMessage(error: { message?: string } | null): string | null {
  if (!error) return null;
  const message = error.message ?? 'Unexpected error';
  if (message.includes('Only administrators')) {
    return 'Your account no longer has administrator access.';
  }
  if (message.includes('last administrator')) {
    return 'You cannot demote the last administrator.';
  }
  if (message.includes('cannot change your own role')) {
    return 'You cannot change your own role.';
  }
  if (message.includes('already reviewed')) {
    return 'That application has already been reviewed.';
  }
  if (message.includes('own teacher application')) {
    return 'You cannot review your own application.';
  }
  if (message.includes('new row violates') || message.includes('check constraint')) {
    return 'That value is not allowed.';
  }
  return message;
}

/** Counts for the admin overview cards. RLS scopes every count. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const [users, pending, events] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('teacher_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('events').select('id', { count: 'exact', head: true }),
  ]);

  if (users.error) throw users.error;
  if (pending.error) throw pending.error;
  if (events.error) throw events.error;

  return {
    userCount: users.count ?? 0,
    pendingApplications: pending.count ?? 0,
    eventCount: events.count ?? 0,
  };
}

/** Every profile (admins only — enforced by the "Admins can view all" policy). */
export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: normalizeRole(row.role),
  }));
}

/** All teacher applications, newest first (admins see every row). */
export async function listTeacherApplications(): Promise<TeacherApplication[]> {
  const { data, error } = await supabase
    .from('teacher_applications')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TeacherApplication[];
}

export async function approveTeacherApplication(
  applicationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('approve_teacher_application', {
    application_id: applicationId,
  });
  return { error: toMessage(error) };
}

export async function rejectTeacherApplication(
  applicationId: string,
  reason: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reject_teacher_application', {
    application_id: applicationId,
    reason,
  });
  return { error: toMessage(error) };
}

/** Changes another user's role (never yourself — the RPC enforces that too). */
export async function setUserRole(
  targetUserId: string,
  role: Role
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_user_role', {
    target_user_id: targetUserId,
    new_role: role,
  });
  return { error: toMessage(error) };
}
