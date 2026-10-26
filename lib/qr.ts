export type QRPayload = {
  v: 1;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type ParseQRResult =
  | { ok: true; payload: QRPayload }
  | { ok: false; message: string };

type EventQRInput = {
  eventId: string;
  title: string;
  start?: string;
  end?: string;
};

export function buildQRPayload(event: EventQRInput): string {
  const payload: QRPayload = {
    v: 1,
    event: event.eventId,
  };

  if (event.title) payload.title = event.title;
  if (event.start) payload.start = event.start;
  if (event.end) payload.end = event.end;

  return JSON.stringify(payload);
}

export function parseQRPayload(raw: string): ParseQRResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Invalid QR code.' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('v' in parsed) ||
    parsed.v !== 1 ||
    !('event' in parsed) ||
    typeof parsed.event !== 'string' ||
    !parsed.event.trim()
  ) {
    return { ok: false, message: 'Not an attendance QR code.' };
  }

  const payload = parsed as QRPayload;
  return { ok: true, payload: { ...payload, event: payload.event.trim() } };
}
