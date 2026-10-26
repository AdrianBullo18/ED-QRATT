import { supabase } from '@/lib/supabase';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Sign in again before creating an event.' };
  }

  const { error } = await supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: toIsoOrNull(event.start),
      end_time: toIsoOrNull(event.end),
      created_by: user.id,
    },
    { onConflict: 'event_code' }
  );

  if (error?.code === '23505') {
    return { error: 'Event code already in use. Choose a different code.' };
  }
  if (error?.code === '42501') {
    return {
      error: 'Only teacher accounts can create events. Sign in with a teacher account.',
    };
  }

  return { error: error?.message ?? null };
}

export async function getEventsByTeacher(teacherId: string): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_by, created_at')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as CloudEvent[];
}

export async function getEventByCode(code: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_by, created_at')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) return null;
  return data as CloudEvent;
}
