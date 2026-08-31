import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runFullSync } from "@/lib/sync";

/**
 * Sincroniza (en la dirección Google Calendar / Notion -> app) lo que el
 * usuario haya creado directo en esos servicios. Se dispara manualmente
 * (botón) o una vez por sesión desde el cliente. Acepta sesión por cookie
 * (web) o Bearer token (mobile).
 */
export async function POST(request: NextRequest) {
  const userId = await requireUser(request);

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const result = await runFullSync(userId);
  return NextResponse.json(result);
}
