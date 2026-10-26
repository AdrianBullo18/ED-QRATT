-- ============================================================================
-- QR-ATT :: Consolidated Schema (student / teacher / admin)
-- ============================================================================
-- Single authoritative migration. Replaces ALL previous files:
--   schema.sql, admin_approval.sql, admin_security_migration.sql,
--   avatar_migration.sql, remove_admin_role.sql, complete_fix_migration.sql
--
-- Safe to re-run: every statement is idempotent (IF EXISTS / IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS).
-- Upgrades an existing database in place (adds the admin role, restores the
-- approval RPCs, re-arms the escalation guard).
--
-- Run in: Supabase Dashboard > SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ADMIN BOOTSTRAP
--    (Runs in section 1.1 below, AFTER the profiles table exists and every
--    auth user has been backfilled — running it first fails on a fresh
--    database with 42P01: relation "public.profiles" does not exist.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

create table if not exists public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  id_image_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  rejection_reason text
);

-- Backfill: every auth user gets a profile row.
insert into public.profiles (id, email, role)
select id, coalesce(email, ''), 'student'
from auth.users
on conflict (id) do nothing;

-- 1.1 ADMIN BOOTSTRAP
--     >>> EDIT THE EMAIL BELOW before running <<<
--     Runs after the table exists and the backfill, so it works on both fresh
--     and existing databases. The SQL Editor has no JWT (auth.uid() is null),
--     which is the only trusted path that may change a role directly.
--     If your admin account does not exist yet, this is a harmless no-op:
--     create the account, then re-run just this UPDATE (or the whole file).
--     After this, further admins are promoted from the in-app Admin tab.
update public.profiles
set role = 'admin'
where lower(email) = lower('qr.attendance.admin@gmail.com')
  and role <> 'admin';

-- Older installs may point attendance at auth.users; repoint at profiles so
-- PostgREST can join attendee names.
alter table public.attendance
  drop constraint if exists attendance_student_id_fkey;
alter table public.attendance
  add constraint attendance_student_id_fkey
  foreign key (student_id) references public.profiles (id) on delete cascade;

-- Additive columns for databases created by older schema versions.
alter table public.profiles
  add column if not exists avatar_path text;

-- ----------------------------------------------------------------------------
-- 2. THREE-ROLE CHECK CONSTRAINT
--    (Supersedes the old two-role constraint from schema.sql / remove_admin.)
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));

-- ----------------------------------------------------------------------------
-- 3. CLEAN UP LEGACY ADMIN ERA OBJECTS
--    The old admin system used an is_admin boolean column; the three-role
--    model stores admin in profiles.role instead.
-- ----------------------------------------------------------------------------
alter table public.profiles drop column if exists is_admin;

drop function if exists public.prevent_self_role_escalation();
drop trigger if exists prevent_self_role_escalation on public.profiles;

drop policy if exists "Only admins can update role or is_admin on profiles" on public.profiles;
drop policy if exists "Admins can update teacher applications" on public.teacher_applications;

-- ----------------------------------------------------------------------------
-- 4. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists events_created_by_created_at_idx
  on public.events (created_by, created_at desc);
create index if not exists attendance_event_id_idx
  on public.attendance (event_id);
create index if not exists attendance_student_id_scanned_at_idx
  on public.attendance (student_id, scanned_at desc);
create index if not exists teacher_applications_user_id_idx
  on public.teacher_applications (user_id);
create index if not exists teacher_applications_status_idx
  on public.teacher_applications (status);

-- ----------------------------------------------------------------------------
-- 5. HELPER: public.is_admin()
--    STABLE so PostgREST can plan RLS subqueries; security definer so policy
--    evaluation is not blocked by profiles RLS; false without a JWT.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS
-- ----------------------------------------------------------------------------

-- 6.1 updated_at stays honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 6.2 Signup can never grant a role: metadata role is ignored, everyone
--     starts as student. Teacher is granted by approve_teacher_application,
--     admin only from the SQL Editor or the admin RPC.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'student'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6.3 PRIVILEGE-ESCALATION GUARD (most important trigger)
--     RLS cannot restrict columns, so this BEFORE UPDATE trigger rejects any
--     role change that is not: (a) a JWT-less service/SQL-editor write, or
--     (b) performed while public.is_admin() is true (admin RPC path).
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role) then
    if auth.uid() is null then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    raise exception 'Role can only be changed by an administrator'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.teacher_applications enable row level security;

-- 7.1 profiles
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Owner may edit name/avatar. Role edits are stopped by the section 6.3
-- trigger, so no role predicate is needed here.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 7.2 events: any authenticated user can resolve a code; only teachers write.
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Teachers can insert their own events" on public.events;
create policy "Teachers can insert their own events"
  on public.events for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "Teachers can update their own events" on public.events;
create policy "Teachers can update their own events"
  on public.events for update
  using (
    auth.uid() = created_by
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  )
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'teacher'
    )
  );

-- 7.3 attendance: students check in; owners/teachers/admins read.
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (
    auth.uid() = student_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'student'
    )
  );

drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1
      from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance"
  on public.attendance for select
  using (public.is_admin());

-- 7.4 teacher_applications: applicants own their rows, admins review them.
drop policy if exists "Applicants can view their own application" on public.teacher_applications;
create policy "Applicants can view their own application"
  on public.teacher_applications for select
  using (auth.uid() = user_id);

drop policy if exists "Applicants can insert their own application" on public.teacher_applications;
create policy "Applicants can insert their own application"
  on public.teacher_applications for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.teacher_applications ta
      where ta.user_id = auth.uid()
        and ta.status = 'pending'
    )
  );

drop policy if exists "Applicants can update their rejected application" on public.teacher_applications;
create policy "Applicants can update their rejected application"
  on public.teacher_applications for update
  using (auth.uid() = user_id and status = 'rejected')
  with check (
    auth.uid() = user_id
    and status in ('pending', 'rejected')
  );

drop policy if exists "Admins can view all teacher applications" on public.teacher_applications;
create policy "Admins can view all teacher applications"
  on public.teacher_applications for select
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. PRIVILEGED RPCs (admin-only; re-check authorization inside every function)
-- ----------------------------------------------------------------------------
grant execute on function public.is_admin() to authenticated;

-- Approve: stamps the verdict AND flips profiles.role to 'teacher' atomically.
create or replace function public.approve_teacher_application(application_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can approve teacher applications';
  end if;

  select user_id into v_user_id
  from public.teacher_applications
  where id = application_id;

  if v_user_id is null then
    raise exception 'Application not found';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Administrators cannot approve their own teacher application';
  end if;

  update public.teacher_applications
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = application_id
    and status = 'pending';

  if not found then
    raise exception 'Application is not pending (already reviewed)';
  end if;

  update public.profiles
  set role = 'teacher'
  where id = v_user_id;
end;
$$;

-- Reject: records the verdict and reason, leaves the role untouched.
create or replace function public.reject_teacher_application(
  application_id uuid,
  reason text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reject teacher applications';
  end if;

  select user_id into v_user_id
  from public.teacher_applications
  where id = application_id;

  if v_user_id is null then
    raise exception 'Application not found';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Administrators cannot reject their own teacher application';
  end if;

  update public.teacher_applications
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      rejection_reason = nullif(trim(reason), '')
  where id = application_id
    and status = 'pending';

  if not found then
    raise exception 'Application is not pending (already reviewed)';
  end if;
end;
$$;

-- Change any user's role from the Admin tab. The escalation trigger allows it
-- because the caller is an admin; the function additionally blocks self-edits
-- and demoting the last administrator.
create or replace function public.admin_set_user_role(
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_current_role text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change user roles';
  end if;

  if new_role not in ('student', 'teacher', 'admin') then
    raise exception 'Invalid role';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  select role into v_current_role
  from public.profiles
  where id = target_user_id;

  if v_current_role is null then
    raise exception 'User not found';
  end if;

  if v_current_role = 'admin' and new_role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Cannot demote the last administrator';
    end if;
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;
end;
$$;

grant execute on function public.approve_teacher_application(uuid) to authenticated;
grant execute on function public.reject_teacher_application(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
revoke execute on function public.approve_teacher_application(uuid) from anon;
revoke execute on function public.reject_teacher_application(uuid, text) from anon;
revoke execute on function public.admin_set_user_role(uuid, text) from anon;

-- ----------------------------------------------------------------------------
-- 9. STORAGE: private buckets + folder-scoped policies
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teacher-id-images',
  'teacher-id-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- NOTE: deliberately no "alter table storage.objects enable row level
-- security" here. RLS is already enabled on storage.objects by Supabase, and
-- this statement fails with 42501 (must be owner of table objects) when run
-- from the SQL Editor, which would roll back the whole migration.
--
-- Each policy below runs in its own guarded DO block: if the SQL Editor role
-- ever lacks ownership of storage.objects, the block prints a NOTICE and the
-- rest of the migration continues instead of aborting.

-- profile-images: owner-only CRUD.
do $$
begin
  drop policy if exists "Profile images are readable by owner" on storage.objects;
  create policy "Profile images are readable by owner"
    on storage.objects for select
    using (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Profile images are readable by owner"';
end $$;

do $$
begin
  drop policy if exists "Owners can upload their own profile image" on storage.objects;
  create policy "Owners can upload their own profile image"
    on storage.objects for insert
    with check (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Owners can upload their own profile image"';
end $$;

do $$
begin
  drop policy if exists "Owners can replace their own profile image" on storage.objects;
  create policy "Owners can replace their own profile image"
    on storage.objects for update
    using (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Owners can replace their own profile image"';
end $$;

do $$
begin
  drop policy if exists "Owners can delete their own profile image" on storage.objects;
  create policy "Owners can delete their own profile image"
    on storage.objects for delete
    using (
      bucket_id = 'profile-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Owners can delete their own profile image"';
end $$;

-- teacher-id-images: applicant owner access.
do $$
begin
  drop policy if exists "Applicants can upload their own teacher ID" on storage.objects;
  create policy "Applicants can upload their own teacher ID"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'teacher-id-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Applicants can upload their own teacher ID"';
end $$;

do $$
begin
  drop policy if exists "Applicants can view their own teacher ID" on storage.objects;
  create policy "Applicants can view their own teacher ID"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'teacher-id-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Applicants can view their own teacher ID"';
end $$;

do $$
begin
  drop policy if exists "Applicants can delete their own teacher ID" on storage.objects;
  create policy "Applicants can delete their own teacher ID"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'teacher-id-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Applicants can delete their own teacher ID"';
end $$;

-- Admins preview every teacher ID from the review queue (signed URLs).
do $$
begin
  drop policy if exists "Admins can view all teacher IDs" on storage.objects;
  create policy "Admins can view all teacher IDs"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'teacher-id-images'
      and public.is_admin()
    );
exception when insufficient_privilege then
  raise notice 'SKIP storage policy "Admins can view all teacher IDs"';
end $$;

-- ----------------------------------------------------------------------------
-- 10. GRANTS (RLS still applies on top of these)
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert on public.attendance to authenticated;
grant select, insert, update on public.teacher_applications to authenticated;

-- ============================================================================
-- VERIFICATION (read-only, optional)
-- ============================================================================
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.profiles'::regclass and contype = 'c';
--
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' order by tablename, policyname;
--
-- select tgname from pg_trigger
--  where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- select id, email, role from public.profiles order by role, email;
--
-- select id, status, email from public.teacher_applications
--  order by submitted_at desc;
-- ============================================================================
-- AFTER RUNNING
--   1. If your admin account did not exist when you ran this, edit the email
--      in section 1.1 and re-run just that UPDATE after signing up.
--   2. Sign in to the app with that account -> Home shows the admin overview
--      and the Admin tab appears.
--   3. Approve teacher applications from the Admin tab (no SQL needed).
-- ============================================================================
