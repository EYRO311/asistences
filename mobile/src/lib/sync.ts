import { supabase } from "./supabase";
import {
  upsertManyItems,
  getPendingSyncQueue,
  clearSyncQueueEntry,
  getAllItems,
  updateLocalItem,
} from "@/db/items";
import { getDb } from "@/db/database";
import type { Item } from "./types";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

export async function pullFromSupabase(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: true });

  if (error) throw error;
  if (data?.length) {
    await upsertManyItems(data as Item[]);
  }
}

/**
 * Fase 1 del plan de implementación: dispara la sincronización con Google
 * Calendar/Notion para un item recién llegado a Supabase (best-effort — si
 * falla, el item queda en 'failed' para poder reintentar en vez de
 * revertirse, ya que el usuario ya lo ve en su app). Antes, mobile marcaba
 * los items "confirmed" en cuanto llegaban a Supabase sin haber tocado
 * ninguna de las dos integraciones — este es el punto que lo reemplaza.
 */
export async function syncItemExternal(itemId: string): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    const res = await fetch(`${WEB_URL}/api/items/${itemId}/sync-external`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      await supabase.from("items").update({ status: "failed" }).eq("id", itemId);
      return;
    }

    // Refleja el resultado real en SQLite local — importante para el caso de
    // creación en línea, que no pasa por pullFromSupabase() después.
    const { item } = await res.json();
    if (item) {
      await updateLocalItem(itemId, {
        status: item.status,
        google_event_id: item.google_event_id,
        notion_page_id: item.notion_page_id,
        notion_url: item.notion_url,
        outfit_suggestion: item.outfit_suggestion,
      });
    }
  } catch {
    try {
      await supabase.from("items").update({ status: "failed" }).eq("id", itemId);
    } catch {
      // sin conexión otra vez; se reintentará en el próximo sync
    }
  }
}

export async function pushToSupabase(): Promise<void> {
  const queue = await getPendingSyncQueue();

  for (const entry of queue) {
    try {
      if (entry.operation === "create") {
        const item = JSON.parse(entry.payload as string);
        const { error } = await supabase.from("items").upsert({ ...item, status: "syncing" });
        if (error) throw error;
        await clearSyncQueueEntry(entry.id as string);
        // No se marca "confirmed" aquí — syncItemExternal deja el estado
        // final real (confirmed/failed) según si Google/Notion sí se
        // pudieron crear.
        await syncItemExternal(entry.item_id as string);
        continue;
      } else if (entry.operation === "update") {
        const changes = JSON.parse(entry.payload as string);
        await supabase.from("items").update(changes).eq("id", entry.item_id);
      } else if (entry.operation === "delete") {
        await supabase.from("items").delete().eq("id", entry.item_id);
      }
      await clearSyncQueueEntry(entry.id as string);
    } catch {
      // keep entry in queue to retry next time
    }
  }
}

export async function fullSync(userId: string): Promise<void> {
  await pushToSupabase();
  await pullFromSupabase(userId);
}

// Fuerza el envío de TODOS los items locales a Supabase,
// borra la cola pendiente y vuelve a jalar desde Supabase.
export async function forceSyncAll(userId: string): Promise<void> {
  const items = await getAllItems();
  if (items.length > 0) {
    const { error } = await supabase.from("items").upsert(
      items.map((i) => (i.status === "draft" ? { ...i, status: "syncing" } : i))
    );
    if (error) throw error;

    const draftIds = items.filter((i) => i.status === "draft").map((i) => i.id);
    for (const id of draftIds) {
      await syncItemExternal(id);
    }
  }

  const db = await getDb();
  await db.run("DELETE FROM sync_queue");
  await db.run("UPDATE items SET synced = 1");

  await pullFromSupabase(userId);
}
