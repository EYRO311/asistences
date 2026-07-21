import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { syncItemExternal, SagaError } from "@/lib/saga/createItem";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/sync-external — fase 1 del plan de implementación:
// sincroniza con Google Calendar/Notion un item creado directo en Supabase
// (mobile, offline-first), que nunca pasa por el saga de creación de web.
// Idempotente y best-effort: si Google/Notion fallan, el item queda en
// 'failed' en vez de revertirse (ya existe y el usuario ya lo ve).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const userId = await requireUser(request);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const item = await syncItemExternal(userId, id);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof SagaError) {
      return NextResponse.json({ error: err.message, step: err.step }, { status: 422 });
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
