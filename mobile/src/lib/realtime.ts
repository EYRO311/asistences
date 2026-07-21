import { supabase } from "./supabase";
import { upsertItem, hardDeleteLocalItem, hasPendingSyncFor } from "@/db/items";
import type { Item } from "./types";

// Fase 5 del plan de implementación: que un cambio hecho en web (u otro
// dispositivo) se refleje en mobile sin esperar a un sync manual.
//
// Riesgo mitigado (condición de carrera con la cola offline): si hay un
// cambio local todavía sin subir para el mismo item, el evento de Realtime
// se ignora por completo — el cambio local manda. Cuando ese cambio se
// suba, su propia actualización en Supabase disparará su propio evento de
// Realtime (ya sin nada pendiente), así que el estado converge solo sin
// necesidad de resolver el conflicto aquí.

interface RealtimeItemPayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<Item> | null;
  old: Partial<Item> | null;
}

/** Decide si un evento de Realtime debe aplicarse o ignorarse (pura, sin DB). */
export function shouldApplyRealtimeEvent(hasPendingLocalChange: boolean): boolean {
  return !hasPendingLocalChange;
}

export function subscribeToItemChanges(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`items-changes-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "items", filter: `user_id=eq.${userId}` },
      async (payload: RealtimeItemPayload) => {
        const row = payload.new ?? payload.old;
        const itemId = row?.id;
        if (!itemId) return;

        const isPending = await hasPendingSyncFor(itemId).catch(() => true); // ante la duda, no pisar lo local
        if (!shouldApplyRealtimeEvent(isPending)) return;

        if (payload.eventType === "DELETE") {
          await hardDeleteLocalItem(itemId);
        } else if (payload.new) {
          await upsertItem(payload.new as Item);
        }
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Metas no tienen caché local (siempre se leen directo de Supabase), así
 * que aquí no hay nada que fusionar — cualquier cambio solo dispara un
 * refetch normal a través del callback que ya use cada pantalla.
 */
export function subscribeToGoalChanges(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`goals-changes-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "goals", filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .on(
      // goal_items no tiene columna user_id (solo goal_id) para filtrar
      // aquí — Supabase Realtime igual solo entrega las filas que las
      // políticas RLS de goal_items ya restringen al dueño de la meta, así
      // que sigue quedando scoped por usuario aunque no haya `filter`.
      "postgres_changes",
      { event: "*", schema: "public", table: "goal_items" },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
