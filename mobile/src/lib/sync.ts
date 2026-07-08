import { supabase } from "./supabase";
import {
  upsertManyItems,
  getPendingSyncQueue,
  clearSyncQueueEntry,
  getAllItems,
} from "@/db/items";
import { getDb } from "@/db/database";
import type { Item } from "./types";

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

export async function pushToSupabase(): Promise<void> {
  const queue = await getPendingSyncQueue();

  for (const entry of queue) {
    try {
      if (entry.operation === "create") {
        const item = JSON.parse(entry.payload as string);
        const { error } = await supabase.from("items").upsert(item);
        if (error) throw error;
        // Mobile items are confirmed once they reach Supabase
        await supabase.from("items").update({ status: "confirmed" }).eq("id", entry.item_id);
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
    const { error } = await supabase.from("items").upsert(items);
    if (error) throw error;
    // Confirm all draft items that made it to Supabase
    const draftIds = items.filter((i) => i.status === "draft").map((i) => i.id);
    if (draftIds.length > 0) {
      await supabase.from("items").update({ status: "confirmed" }).in("id", draftIds);
    }
  }

  const db = await getDb();
  await db.run("DELETE FROM sync_queue");
  await db.run("UPDATE items SET synced = 1");

  await pullFromSupabase(userId);
}
