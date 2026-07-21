import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

const schema = z.object({
  reminders_enabled: z.boolean().optional(),
  reminder_minutes_before: z.number().int().min(1).max(180).optional(),
});

export async function PATCH(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ ok: true });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
