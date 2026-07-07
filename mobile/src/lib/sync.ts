import { supabase } from "./supabase";
import {
  upsertManyItems,
  getPendingSyncQueue,
  clearSyncQueueEntry,
} from "@/db/items";
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
        await supabase.from("items").upsert(item);
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
