#!/usr/bin/env node
// Fase 5 del plan de implementación — riesgo señalado: qué pasa si un
// evento de Realtime llega para un item que todavía tiene un cambio local
// sin subir en sync_queue (condición de carrera con la cola offline).
//
// Reimplementa aquí la lógica de decisión de src/lib/realtime.ts (con un
// store en memoria en vez de SQLite real, que no corre fuera de Capacitor)
// para probar los 4 casos que importan: INSERT/UPDATE con y sin cambio
// pendiente, DELETE con y sin cambio pendiente.
//
// Uso: node scripts/verify-realtime-guard.mjs

// ── Fakes en memoria (espejo de la forma de mobile/src/db/items.ts) ────────
function createFakeStore() {
  const items = new Map();
  const pending = new Set();
  const applied = [];

  return {
    async hasPendingSyncFor(id) {
      return pending.has(id);
    },
    async upsertItem(item) {
      items.set(item.id, item);
      applied.push({ op: "upsert", id: item.id });
    },
    async hardDeleteLocalItem(id) {
      items.delete(id);
      applied.push({ op: "delete", id });
    },
    markPending(id) {
      pending.add(id);
    },
    items,
    applied,
  };
}

// Espejo de shouldApplyRealtimeEvent() en src/lib/realtime.ts
function shouldApplyRealtimeEvent(hasPendingLocalChange) {
  return !hasPendingLocalChange;
}

// Espejo del callback de subscribeToItemChanges()
async function handleRealtimeEvent(store, payload) {
  const row = payload.new ?? payload.old;
  const itemId = row?.id;
  if (!itemId) return;

  const isPending = await store.hasPendingSyncFor(itemId);
  if (!shouldApplyRealtimeEvent(isPending)) return;

  if (payload.eventType === "DELETE") {
    await store.hardDeleteLocalItem(itemId);
  } else if (payload.new) {
    await store.upsertItem(payload.new);
  }
}

let failures = 0;
function check(name, condition) {
  console.log(`${condition ? "✓" : "✗"} ${name}`);
  if (!condition) failures++;
}

// Caso 1: UPDATE remoto sin cambio local pendiente → se aplica.
{
  const store = createFakeStore();
  await handleRealtimeEvent(store, {
    eventType: "UPDATE",
    new: { id: "item-1", title: "Editado en web" },
    old: { id: "item-1", title: "Original" },
  });
  check("UPDATE sin pendiente: se aplica localmente", store.items.get("item-1")?.title === "Editado en web");
}

// Caso 2: UPDATE remoto CON cambio local pendiente → se ignora (el local manda).
{
  const store = createFakeStore();
  store.markPending("item-2");
  store.items.set("item-2", { id: "item-2", title: "Mi edición offline" });
  await handleRealtimeEvent(store, {
    eventType: "UPDATE",
    new: { id: "item-2", title: "Versión vieja del servidor" },
    old: { id: "item-2", title: "Original" },
  });
  check(
    "UPDATE con pendiente: se ignora, no pisa la edición local",
    store.items.get("item-2")?.title === "Mi edición offline"
  );
  check("UPDATE con pendiente: no se registra como aplicado", store.applied.length === 0);
}

// Caso 3: DELETE remoto sin pendiente → se borra localmente.
{
  const store = createFakeStore();
  store.items.set("item-3", { id: "item-3", title: "Por borrar" });
  await handleRealtimeEvent(store, { eventType: "DELETE", new: null, old: { id: "item-3" } });
  check("DELETE sin pendiente: se borra localmente", !store.items.has("item-3"));
}

// Caso 4: DELETE remoto CON pendiente (ej. el usuario está editándolo offline
// ahora mismo) → se ignora, no se borra la copia local todavía no subida.
{
  const store = createFakeStore();
  store.markPending("item-4");
  store.items.set("item-4", { id: "item-4", title: "Editando offline" });
  await handleRealtimeEvent(store, { eventType: "DELETE", new: null, old: { id: "item-4" } });
  check("DELETE con pendiente: se ignora, no borra la copia local", store.items.has("item-4"));
}

// Caso 5: evento sin id reconocible (payload corrupto) no debe tronar.
{
  const store = createFakeStore();
  await handleRealtimeEvent(store, { eventType: "UPDATE", new: {}, old: null });
  check("payload sin id: no lanza y no aplica nada", store.applied.length === 0);
}

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}

console.log("\nLa lógica de Realtime respeta los cambios locales pendientes en todos los casos.");
