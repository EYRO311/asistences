import { getDb } from "./database";
import type { Item } from "@/lib/types";

function rowToItem(row: Record<string, unknown>): Item {
  return {
    ...row,
    all_day: row.all_day === 1,
    add_to_calendar: row.add_to_calendar === 1,
    categories: JSON.parse((row.categories as string) ?? "[]"),
    recurrence_days: JSON.parse((row.recurrence_days as string) ?? "[]"),
    cached_recommendation: row.cached_recommendation
      ? JSON.parse(row.cached_recommendation as string)
      : null,
  } as Item;
}

function itemToValues(item: Partial<Item> & { id: string; user_id: string }) {
  return {
    id: item.id,
    user_id: item.user_id,
    type: item.type ?? "personal",
    title: item.title ?? "",
    description: item.description ?? null,
    start_time: item.start_time ?? null,
    end_time: item.end_time ?? null,
    all_day: item.all_day ? 1 : 0,
    add_to_calendar: item.add_to_calendar ? 1 : 0,
    status: item.status ?? "draft",
    google_event_id: item.google_event_id ?? null,
    notion_page_id: item.notion_page_id ?? null,
    notion_url: item.notion_url ?? null,
    due_date: item.due_date ?? null,
    priority: item.priority ?? null,
    effort: item.effort ?? null,
    task_status: item.task_status ?? "sin_empezar",
    categories: JSON.stringify(item.categories ?? []),
    outfit_suggestion: item.outfit_suggestion ?? null,
    location: item.location ?? null,
    source: item.source ?? "app",
    cached_recommendation: item.cached_recommendation
      ? JSON.stringify(item.cached_recommendation)
      : null,
    meet_link: item.meet_link ?? null,
    recurrence_days: JSON.stringify(item.recurrence_days ?? []),
    recurrence_start_time: item.recurrence_start_time ?? null,
    recurrence_end_time: item.recurrence_end_time ?? null,
    created_at: item.created_at ?? new Date().toISOString(),
    updated_at: item.updated_at ?? new Date().toISOString(),
  };
}

export async function getAllItems(): Promise<Item[]> {
  const db = await getDb();
  const result = await db.query(
    "SELECT * FROM items WHERE pending_delete = 0 ORDER BY start_time ASC NULLS LAST"
  );
  return (result.values ?? []).map(rowToItem);
}

export async function upsertItem(item: Item): Promise<void> {
  const db = await getDb();
  const v = itemToValues(item);
  await db.run(
    `INSERT OR REPLACE INTO items
      (id, user_id, type, title, description, start_time, end_time, all_day, add_to_calendar,
       status, google_event_id, notion_page_id, notion_url, due_date, priority, effort,
       task_status, categories, outfit_suggestion, location, source, cached_recommendation,
       meet_link, recurrence_days, recurrence_start_time, recurrence_end_time,
       created_at, updated_at, synced, pending_delete)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`,
    Object.values(v)
  );
}

export async function upsertManyItems(items: Item[]): Promise<void> {
  const db = await getDb();
  await db.executeTransaction(
    items.map((item) => {
      const v = itemToValues(item);
      return {
        statement: `INSERT OR REPLACE INTO items
          (id, user_id, type, title, description, start_time, end_time, all_day, add_to_calendar,
           status, google_event_id, notion_page_id, notion_url, due_date, priority, effort,
           task_status, categories, outfit_suggestion, location, source, cached_recommendation,
           meet_link, recurrence_days, recurrence_start_time, recurrence_end_time,
           created_at, updated_at, synced, pending_delete)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`,
        values: Object.values(v),
      };
    })
  );
}

export async function createLocalItem(item: Omit<Item, "id" | "created_at" | "updated_at">): Promise<Item> {
  const db = await getDb();
  const newItem: Item = {
    ...item,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "draft",
    source: "app",
  } as Item;

  const v = itemToValues(newItem);
  await db.run(
    `INSERT OR REPLACE INTO items
      (id, user_id, type, title, description, start_time, end_time, all_day, add_to_calendar,
       status, google_event_id, notion_page_id, notion_url, due_date, priority, effort,
       task_status, categories, outfit_suggestion, location, source, cached_recommendation,
       meet_link, recurrence_days, recurrence_start_time, recurrence_end_time,
       created_at, updated_at, synced, pending_delete)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    Object.values(v)
  );

  // Queue for sync
  await db.run(
    "INSERT INTO sync_queue (id, item_id, operation, payload, created_at) VALUES (?,?,?,?,?)",
    [crypto.randomUUID(), newItem.id, "create", JSON.stringify(newItem), new Date().toISOString()]
  );

  return newItem;
}

export async function updateLocalItem(id: string, changes: Partial<Item>): Promise<void> {
  const db = await getDb();
  const current = await db.query("SELECT * FROM items WHERE id = ?", [id]);
  if (!current.values?.length) return;

  const updated: Item = { ...rowToItem(current.values[0]), ...changes, updated_at: new Date().toISOString() };
  const v = itemToValues(updated);

  await db.run(
    `INSERT OR REPLACE INTO items
      (id, user_id, type, title, description, start_time, end_time, all_day, add_to_calendar,
       status, google_event_id, notion_page_id, notion_url, due_date, priority, effort,
       task_status, categories, outfit_suggestion, location, source, cached_recommendation,
       meet_link, recurrence_days, recurrence_start_time, recurrence_end_time,
       created_at, updated_at, synced, pending_delete)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    Object.values(v)
  );

  await db.run(
    "INSERT INTO sync_queue (id, item_id, operation, payload, created_at) VALUES (?,?,?,?,?)",
    [crypto.randomUUID(), id, "update", JSON.stringify(changes), new Date().toISOString()]
  );
}

export async function deleteLocalItem(id: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE items SET pending_delete = 1, synced = 0 WHERE id = ?", [id]);
  await db.run(
    "INSERT INTO sync_queue (id, item_id, operation, payload, created_at) VALUES (?,?,?,?,?)",
    [crypto.randomUUID(), id, "delete", null, new Date().toISOString()]
  );
}

export async function getPendingSyncQueue() {
  const db = await getDb();
  const result = await db.query("SELECT * FROM sync_queue ORDER BY created_at ASC");
  return result.values ?? [];
}

export async function clearSyncQueueEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM sync_queue WHERE id = ?", [id]);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const result = await db.query("SELECT COUNT(*) as count FROM sync_queue");
  return (result.values?.[0]?.count as number) ?? 0;
}

export async function getUnsyncedItems(): Promise<string[]> {
  const db = await getDb();
  const result = await db.query("SELECT id FROM items WHERE synced = 0 AND pending_delete = 0");
  return (result.values ?? []).map((r) => r.id as string);
}

// ── Fase 5 del plan de implementación: soporte para Realtime ────────────────

/**
 * true si hay un cambio local todavía sin subir para este item (crear,
 * editar o borrar). Se usa para ignorar un evento de Realtime que llegue
 * mientras ese cambio sigue pendiente — el cambio local manda, y su propia
 * confirmación llegará cuando se suba (evita que un evento viejo del
 * servidor sobrescriba una edición que el usuario acaba de hacer offline).
 */
export async function hasPendingSyncFor(itemId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.query("SELECT 1 FROM sync_queue WHERE item_id = ? LIMIT 1", [itemId]);
  return (result.values?.length ?? 0) > 0;
}

/**
 * Borra un item local SIN encolar un "delete" de vuelta — para cuando la
 * eliminación ya ocurrió en el servidor (evento de Realtime) y solo hay que
 * reflejarla localmente, no volver a sincronizarla.
 */
export async function hardDeleteLocalItem(id: string): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM items WHERE id = ?", [id]);
}
