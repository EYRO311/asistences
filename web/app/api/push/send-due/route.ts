import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendPushToSubscription } from "@/lib/webPush";
import { getLocalDateInfo, isReminderDue, type ReminderCandidate } from "@/lib/reminders";

// Fase 6 del plan de implementación: endpoint que un cron externo (Vercel
// Cron en Hobby solo corre 1 vez al día, así que se usa un servicio externo
// tipo cron-job.org cada 5-15 min) llama para revisar y enviar recordatorios
// pendientes. No usa sesión de usuario — se autentica con CRON_SECRET.
function isAuthorizedCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface ReminderItemRow extends ReminderCandidate {
  id: string;
  title: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, timezone, reminder_minutes_before")
    .eq("reminders_enabled", true);

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  let sent = 0;
  let expiredRemoved = 0;

  for (const profile of profiles ?? []) {
    const { data: items } = await supabase
      .from("items")
      .select("id, title, start_time, all_day, recurrence_days, recurrence_start_time, recurrence_end_time, last_reminder_date")
      .eq("user_id", profile.id)
      .eq("all_day", false)
      .neq("status", "cancelled");

    const dueItems = ((items ?? []) as ReminderItemRow[]).filter((item) =>
      isReminderDue(item, profile.timezone, profile.reminder_minutes_before, new Date())
    );
    if (dueItems.length === 0) continue;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", profile.id);
    if (!subs || subs.length === 0) continue;

    const { dateStr } = getLocalDateInfo(profile.timezone);

    for (const item of dueItems) {
      for (const sub of subs) {
        const result = await sendPushToSubscription(sub, {
          title: "Recordatorio",
          body: item.title,
          url: "/",
        });
        if (result.ok) sent++;
        if (result.expired) {
          expiredRemoved++;
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
      await supabase.from("items").update({ last_reminder_date: dateStr }).eq("id", item.id);
    }
  }

  return NextResponse.json({ ok: true, sent, expiredRemoved });
}
