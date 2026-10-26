import { getEventByCode } from '@/lib/events';
import { parseQRPayload } from '@/lib/qr';
import { supabase } from '@/lib/supabase';

export type AttendanceRecord = {
  id: string;
  /** The event's human-readable code (not the row UUID). */
  eventCode: string;
  eventTitle: string;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  const event = await getEventByCode(parsed.payload.event);
  if (!event) {
    return {
      success: false,
      message: 'Event not found. Ask your teacher to create a new QR code.',
    };
  }

  // The cloud event, rather than editable QR text, is authoritative for its window.
  const now = Date.now();
  const startTime = event.start_time ? new Date(event.start_time).getTime() : null;
  const endTime = event.end_time ? new Date(event.end_time).getTime() : null;

  if (startTime !== null && now < startTime) {
    return { success: false, message: 'Event has not started yet.', eventTitle: event.title };
  }
  if (endTime !== null && now > endTime) {
    return { success: false, message: 'Event has already ended.', eventTitle: event.title };
  }

  const { error } = await supabase.from('attendance').insert({
    student_id: studentId,
    event_id: event.id,
  });

  if (error?.code === '23505') {
    return {
      success: false,
      message: 'Already registered for this event.',
      eventTitle: event.title,
    };
  }
  if (error?.code === '42501') {
    // RLS rejected the insert: the attendance policy only admits students.
    return {
      success: false,
      message: 'Only student accounts can check in to events.',
    };
  }
  if (error) {
    return { success: false, message: 'Could not record attendance. Please try again.' };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: event.title };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row) => {
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as
      | { event_code?: string | null; title?: string | null }
      | null;

    return {
      id: String(row.id),
      eventCode: event?.event_code ?? '',
      eventTitle: event?.title ?? '',
      scannedAt: row.scanned_at,
    };
  });
}

/**
 * Attendees of a single event (used when the teacher expands one row).
 * RLS already scopes the query to events the caller created.
 */
export async function getEventAttendance(
  eventId: string
): Promise<TeacherEventAttendance | null> {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_at')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) return null;

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, profiles!attendance_student_id_fkey(full_name)')
    .eq('event_id', eventId)
    .order('scanned_at', { ascending: false });

  if (attendanceError) throw attendanceError;

  const attendees = (attendance ?? []).map((row) => {
    const joinedProfile = row.profiles;
    const profile = (Array.isArray(joinedProfile)
      ? joinedProfile[0]
      : joinedProfile) as { full_name?: string | null } | null;
    return {
      studentId: row.student_id,
      studentName: profile?.full_name ?? null,
      scannedAt: row.scanned_at,
    };
  });

  return {
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time,
    attendeeCount: attendees.length,
    attendees,
  };
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, created_at')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError) throw eventError;
  if (!events || events.length === 0) return [];

  const eventIds = events.map((event) => event.id);
  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attendanceError) throw attendanceError;
  if (!attendanceRows) return [];

  const counts: Record<string, number> = {};
  attendanceRows.forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}
