import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFullSync } from "@/lib/sync";

/**
 * Sincroniza (en la dirección Google Calendar / Notion -> app) lo que el
 * usuario haya creado directo en esos servicios. Se dispara manualmente
 * (botón) o una vez por sesión desde el cliente.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const result = await runFullSync(user.id);
  return NextResponse.json(result);
}
