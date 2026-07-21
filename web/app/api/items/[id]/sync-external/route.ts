import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncItemExternal, SagaError } from "@/lib/saga/createItem";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function authenticate(request: NextRequest): Promise<string | null> {
  const service = createServiceRoleClient();
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await service.auth.getUser(authHeader.slice(7));
    return data.user?.id ?? null;
  }
  const cookieSupabase = await createClient();
  const { data: { user } } = await cookieSupabase.auth.getUser();
  return user?.id ?? null;
}

// POST /api/items/[id]/sync-external — fase 1 del plan de implementación:
// sincroniza con Google Calendar/Notion un item creado directo en Supabase
// (mobile, offline-first), que nunca pasa por el saga de creación de web.
// Idempotente y best-effort: si Google/Notion fallan, el item queda en
// 'failed' en vez de revertirse (ya existe y el usuario ya lo ve).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const userId = await authenticate(request);
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
