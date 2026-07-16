import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { fetchBusyIntervals, getValidGoogleAccessToken } from "@/lib/google";
import { computeFreeSlots, wallToUTC, toLocalDateStr } from "@/lib/freeSlots";
import type { Item, Profile } from "@/lib/types";

const querySchema = z.object({
  time_min: z.string().datetime(),
  time_max: z.string().datetime(),
});

function buildWorkingHours(
  wakeTime: string,
  sleepTime: string
): Record<string, { start: string; end: string }> {
  const hours = { start: wakeTime, end: sleepTime };
  return { "1": hours, "2": hours, "3": hours, "4": hours, "5": hours, "6": hours, "7": hours };
}

export async function GET(request: NextRequest) {
  const service = createServiceRoleClient();

  // Auth: cookie session (web) OR Bearer token (mobile)
  let userId: string | undefined;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await service.auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const user = { id: userId };

  const parsed = querySchema.safeParse({
    time_min: request.nextUrl.searchParams.get("time_min"),
    time_max: request.nextUrl.searchParams.get("time_max"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { data: profile } = await service
      .from("profiles")
      .select("timezone, wake_time, sleep_time")
      .eq("id", user.id)
      .single<Pick<Profile, "timezone" | "wake_time" | "sleep_time">>();

    const tz = profile?.timezone ?? "America/Mexico_City";
    const wakeTime = profile?.wake_time ?? "06:00";
    const sleepTime = profile?.sleep_time ?? "23:00";
    const timeMin = new Date(parsed.data.time_min);
    const timeMax = new Date(parsed.data.time_max);

    // Intervalos ocupados de Google Calendar (vacío si el usuario no tiene conectada su cuenta)
    let googleBusy: { start: Date; end: Date }[] = [];
    try {
      const accessToken = await getValidGoogleAccessToken(user.id);
      googleBusy = await fetchBusyIntervals(accessToken, parsed.data.time_min, parsed.data.time_max);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("no tiene conectada")) throw err;
    }

    // Traer TODOS los items del usuario y filtrar en JS para evitar
    // problemas con combinaciones de filtros de Supabase.
    const { data: allItemsRaw } = await service
      .from("items")
      .select("start_time, end_time, recurrence_days, recurrence_start_time, recurrence_end_time, google_event_id, source")
      .eq("user_id", user.id);

    type RawItem = Pick<Item, "start_time" | "end_time" | "recurrence_days" | "recurrence_start_time" | "recurrence_end_time" | "google_event_id" | "source">;
    const items = (allItemsRaw ?? []) as RawItem[];

    const extraBusy: { start: Date; end: Date }[] = [];

    for (const item of items) {
      const days: number[] = Array.isArray(item.recurrence_days) ? item.recurrence_days.map(Number) : [];
      const isRoutine = days.length > 0 && item.recurrence_start_time && item.recurrence_end_time;

      if (isRoutine) {
        // Rutina recurrente: expandir cada ocurrencia en el rango con el timezone correcto.
        // Se incluye SIEMPRE (con o sin google_event_id) para que funcione aunque
        // Google Calendar no esté conectado.
        const cursor = new Date(timeMin);
        cursor.setUTCHours(0, 0, 0, 0);

        while (cursor < timeMax) {
          const localDateStr = toLocalDateStr(cursor, tz);
          const jsDay = new Date(localDateStr + "T12:00:00Z").getUTCDay();
          const isoWeekday = jsDay === 0 ? 7 : jsDay;

          if (days.includes(isoWeekday)) {
            const occStart = wallToUTC(localDateStr, item.recurrence_start_time!, tz);
            const occEnd = wallToUTC(localDateStr, item.recurrence_end_time!, tz);
            if (occEnd > occStart) {
              extraBusy.push({ start: occStart, end: occEnd });
            }
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else if (!item.google_event_id && item.start_time) {
        // Evento puntual no sincronizado con Google Calendar
        const start = new Date(item.start_time);
        const end = item.end_time
          ? new Date(item.end_time)
          : new Date(start.getTime() + 60 * 60 * 1000);
        if (start < timeMax && end > timeMin) {
          extraBusy.push({ start, end });
        }
      }
    }

    const allBusy = [...googleBusy, ...extraBusy];

    const workingHours = buildWorkingHours(wakeTime, sleepTime);
    const days = computeFreeSlots(allBusy, timeMin, timeMax, tz, workingHours);

    return NextResponse.json({ days });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
