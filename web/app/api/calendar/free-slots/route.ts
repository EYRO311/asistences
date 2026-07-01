import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { fetchBusyIntervals, getValidGoogleAccessToken } from "@/lib/google";
import { computeFreeSlots } from "@/lib/freeSlots";
import type { Item, Profile } from "@/lib/types";

const querySchema = z.object({
  time_min: z.string().datetime(),
  time_max: z.string().datetime(),
});

const WORKING_HOURS_BY_WEEKDAY: Record<string, { start: string; end: string }> = {
  "1": { start: "06:00", end: "23:59" },
  "2": { start: "06:00", end: "23:59" },
  "3": { start: "06:00", end: "23:59" },
  "4": { start: "06:00", end: "23:59" },
  "5": { start: "06:00", end: "23:59" },
  "6": { start: "07:00", end: "23:59" },
  "7": { start: "07:00", end: "23:59" },
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    time_min: request.nextUrl.searchParams.get("time_min"),
    time_max: request.nextUrl.searchParams.get("time_max"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const accessToken = await getValidGoogleAccessToken(user.id);
    const service = createServiceRoleClient();

    const { data: profile } = await service
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .single<Pick<Profile, "timezone">>();

    const tz = profile?.timezone ?? "America/Mexico_City";
    const timeMin = new Date(parsed.data.time_min);
    const timeMax = new Date(parsed.data.time_max);

    // Intervalos ocupados de Google Calendar
    const googleBusy = await fetchBusyIntervals(
      accessToken,
      parsed.data.time_min,
      parsed.data.time_max
    );

    // Intervalos extra: tareas en Supabase sin evento de Google Calendar
    const { data: itemsRaw } = await service
      .from("items")
      .select("start_time, end_time, recurrence_days, recurrence_start_time, recurrence_end_time")
      .eq("user_id", user.id)
      .is("google_event_id", null)
      .not("start_time", "is", null);

    const items = (itemsRaw ?? []) as Pick<
      Item,
      "start_time" | "end_time" | "recurrence_days" | "recurrence_start_time" | "recurrence_end_time"
    >[];

    const extraBusy: { start: Date; end: Date }[] = [];

    for (const item of items) {
      if (!item.start_time) continue;

      if (item.recurrence_days?.length && item.recurrence_start_time && item.recurrence_end_time) {
        const [startH, startM] = item.recurrence_start_time.split(":").map(Number);
        const [endH, endM] = item.recurrence_end_time.split(":").map(Number);
        const cursor = new Date(timeMin);
        cursor.setUTCHours(0, 0, 0, 0);

        while (cursor < timeMax) {
          const jsWeekday = cursor.getUTCDay();
          const isoWeekday = jsWeekday === 0 ? 7 : jsWeekday;
          if (item.recurrence_days.includes(isoWeekday)) {
            const occStart = new Date(cursor);
            occStart.setUTCHours(startH, startM, 0, 0);
            const occEnd = new Date(cursor);
            occEnd.setUTCHours(endH, endM, 0, 0);
            if (occEnd > occStart) {
              extraBusy.push({ start: occStart, end: occEnd });
            }
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
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

    const days = computeFreeSlots(allBusy, timeMin, timeMax, tz, WORKING_HOURS_BY_WEEKDAY);

    return NextResponse.json({ days });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
