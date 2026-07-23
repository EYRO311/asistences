import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractTaskFromImage } from "@/lib/gemini";
import { toLocalDateStr } from "@/lib/freeSlots";
import type { Profile } from "@/lib/types";

// ~4MB de imagen original en base64 (+33% del tamaño original) queda justo
// debajo del límite de payload de las funciones de Vercel (4.5MB).
const MAX_BASE64_LENGTH = 5_600_000;

const bodySchema = z.object({
  image: z.string().min(1).max(MAX_BASE64_LENGTH),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
});

// POST /api/items/image-extract — crear una tarea/evento a partir de una
// imagen (volante, invitación, captura de pantalla, nota escrita a mano).
// Recibe la imagen en base64 (sin encabezado data URL) y le pide a Gemini
// que extraiga título/categoría/fecha/hora/ubicación/descripción en JSON.
// Solo prellena el formulario de creación; no crea nada por sí mismo — el
// usuario siempre tiene que revisar y tocar "Crear".
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

  // extractTaskFromImage nunca devuelve null: en el peor caso regresa un
  // resultado de respaldo genérico, así el usuario solo tiene que llenar
  // el formulario a mano en vez de perder el intento por completo.
  const extraction = await extractTaskFromImage(parsed.data.image, parsed.data.mimeType, {
    todayDate,
    nowTime,
    weekday,
  });

  return NextResponse.json({ extraction });
}
