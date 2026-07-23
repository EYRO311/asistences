import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractTaskFromSpeech } from "@/lib/gemini";
import { toLocalDateStr } from "@/lib/freeSlots";
import type { Profile } from "@/lib/types";

const bodySchema = z.object({
  transcript: z.string().min(1).max(2000),
});

// POST /api/items/voice-extract — fase 4 del plan de implementación: "crear
// una tarea hablando". Recibe una transcripción de texto (ya generada por
// Web Speech API en el navegador — este endpoint no procesa audio) y le pide
// a Gemini que extraiga título/categoría/fecha/hora en JSON. Solo prellena
// el formulario de creación; no crea nada por sí mismo.
export async function POST(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single<Pick<Profile, "timezone">>();

  const tz = profile?.timezone ?? "America/Mexico_City";
  const now = new Date();
  const todayDate = toLocalDateStr(now, tz);
  const nowTime = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: tz,
  }).format(now);
  const weekday = new Intl.DateTimeFormat("es-MX", { weekday: "long", timeZone: tz }).format(now);

  // extractTaskFromSpeech ya no devuelve null: en el peor caso regresa un
  // resultado de respaldo con el título tomado directo de la transcripción,
  // así el dictado nunca se pierde por completo.
  const extraction = await extractTaskFromSpeech(parsed.data.transcript, { todayDate, nowTime, weekday });

  return NextResponse.json({ extraction });
}
