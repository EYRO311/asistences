import type { NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Fase 2 del plan de implementación: único helper de autenticación para
 * rutas API — antes cada ruta repetía (o reinventaba con pequeñas
 * variaciones) el mismo patrón de doble auth. Acepta `Authorization: Bearer
 * <token>` (mobile, llamando directo) o, si no viene, la sesión por cookie
 * (web). Devuelve el user_id autenticado o null.
 *
 * Toda ruta nueva que necesite saber "quién hace esta petición" debe usar
 * este helper en vez de reimplementar la verificación — así una corrección
 * aquí (o el test en scripts/verify-route-auth.mjs) cubre a todas.
 */
export async function requireUser(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const service = createServiceRoleClient();
    const { data } = await service.auth.getUser(authHeader.slice(7));
    return data.user?.id ?? null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
