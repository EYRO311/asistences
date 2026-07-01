import { google } from "googleapis";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Integration } from "@/lib/types";
import { WEEKDAY_RRULE_CODES } from "@/lib/itemPresentation";

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
  "profile",
];

/**
 * Devuelve un access token válido de Google para el usuario, refrescándolo
 * con el refresh_token guardado en `integrations` si ya expiró.
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .single<Integration>();

  if (error || !integration) {
    throw new Error("El usuario no tiene conectada su cuenta de Google");
  }

  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null;
  const isExpired = !expiresAt || expiresAt.getTime() - Date.now() < 60_000;

  if (!isExpired) {
    return integration.access_token;
  }

  if (!integration.refresh_token) {
    throw new Error("Token de Google expirado y sin refresh_token disponible");
  }

  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: integration.refresh_token });

  const { credentials } = await oauth2Client.refreshAccessToken();

  await supabase
    .from("integrations")
    .update({
      access_token: credentials.access_token,
      expires_at: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null,
    })
    .eq("id", integration.id);

  return credentials.access_token!;
}

function getCalendarClient(accessToken: string) {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Google Calendar espera que, cuando se especifica `timeZone`, `dateTime`
 * sea la hora de pared (local) en esa zona — sin sufijo `Z`/offset. Si se
 * manda una hora UTC absoluta junto con `timeZone`, Google reinterpreta los
 * mismos dígitos como hora local de esa zona, aplicando el offset dos veces
 * y corriendo el evento un día/horas. Esta función convierte un ISO UTC a
 * la hora de pared correspondiente en `timeZone`.
 */
function toZonedWallTime(isoUtc: string, timeZone: string): string {
  const date = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export interface GoogleEventInput {
  title: string;
  description?: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  allDay?: boolean;
  timeZone?: string;
  /** Días ISO (1=lunes..7=domingo) para crear un evento recurrente semanal. */
  recurrenceDays?: number[];
}

function buildRecurrenceRule(recurrenceDays?: number[]): string[] | undefined {
  if (!recurrenceDays || recurrenceDays.length === 0) return undefined;

  const byDay = recurrenceDays
    .map((d) => WEEKDAY_RRULE_CODES[d])
    .filter(Boolean)
    .join(",");

  return byDay ? [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`] : undefined;
}

export async function createCalendarEvent(
  accessToken: string,
  input: GoogleEventInput
): Promise<string> {
  const calendar = getCalendarClient(accessToken);

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: input.title,
      description: input.description,
      start: input.allDay
        ? { date: input.start.slice(0, 10) }
        : { dateTime: toZonedWallTime(input.start, input.timeZone ?? "America/Mexico_City"), timeZone: input.timeZone },
      end: input.allDay
        ? { date: input.end.slice(0, 10) }
        : { dateTime: toZonedWallTime(input.end, input.timeZone ?? "America/Mexico_City"), timeZone: input.timeZone },
      recurrence: buildRecurrenceRule(input.recurrenceDays),
    },
  });

  if (!data.id) {
    throw new Error("Google Calendar no devolvió un id de evento");
  }

  return data.id;
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  input: GoogleEventInput
): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  await calendar.events.update({
    calendarId: "primary",
    eventId,
    requestBody: {
      summary: input.title,
      description: input.description,
      start: input.allDay
        ? { date: input.start.slice(0, 10) }
        : { dateTime: toZonedWallTime(input.start, input.timeZone ?? "America/Mexico_City"), timeZone: input.timeZone },
      end: input.allDay
        ? { date: input.end.slice(0, 10) }
        : { dateTime: toZonedWallTime(input.end, input.timeZone ?? "America/Mexico_City"), timeZone: input.timeZone },
      recurrence: buildRecurrenceRule(input.recurrenceDays),
    },
  });
}

export interface RemoteCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
  /** ID del evento maestro cuando este es una ocurrencia de un evento recurrente. */
  recurringEventId?: string;
}

/**
 * Lista eventos del calendario `primary` del usuario en un rango de fechas
 * (para detectar eventos creados/editados directo en Google Calendar, fuera
 * de la app).
 */
export async function listCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<RemoteCalendarEvent[]> {
  const calendar = getCalendarClient(accessToken);
  const events: RemoteCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      pageToken,
      maxResults: 250,
    });

    for (const event of data.items ?? []) {
      if (!event.id || event.status === "cancelled") continue;

      const allDay = Boolean(event.start?.date);
      const start = event.start?.dateTime ?? event.start?.date;
      const end = event.end?.dateTime ?? event.end?.date;
      if (!start) continue;

      events.push({
        id: event.id,
        title: event.summary ?? "(sin título)",
        description: event.description ?? null,
        start,
        end: end ?? null,
        allDay,
        recurringEventId: event.recurringEventId ?? undefined,
      });
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

/**
 * Devuelve los intervalos en los que el calendario `primary` del usuario
 * está ocupado en el rango indicado (equivalente a freebusy.query de la API).
 */
export async function fetchBusyIntervals(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: Date; end: Date }[]> {
  const calendar = getCalendarClient(accessToken);
  const { data } = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: [{ id: "primary" }] },
  });

  return (data.calendars?.["primary"]?.busy ?? [])
    .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (err: unknown) {
    // Si el evento ya no existe (404/410), lo consideramos eliminado.
    const status = (err as { code?: number; status?: number })?.code ??
      (err as { code?: number; status?: number })?.status;
    if (status !== 404 && status !== 410) {
      throw err;
    }
  }
}
