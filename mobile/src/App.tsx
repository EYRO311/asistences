import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fullSync, forceSyncAll } from "@/lib/sync";
import { getAllItems, getPendingCount, updateLocalItem } from "@/db/items";
import { computeAutoTaskStatus } from "@/lib/taskStatus";
import { subscribeToItemChanges } from "@/lib/realtime";
import { Network } from "@capacitor/network";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { setDisplayTimezone } from "@/lib/timezone";
import { applyTheme, type Theme } from "@/lib/theme";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { WeekPage } from "@/pages/WeekPage";
import { MonthPage } from "@/pages/MonthPage";
import { TasksPage } from "@/pages/TasksPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { NewItemPage } from "@/pages/NewItemPage";
import { EditItemPage } from "@/pages/EditItemPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { BottomNav } from "@/components/BottomNav";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import { ErrorBanner } from "@/components/ErrorBanner";
import { rescheduleReminders, type ReminderSettings } from "@/lib/notifications";

export type Page = "home" | "week" | "month" | "tasks" | "goals" | "reports" | "new";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [newItemMode, setNewItemMode] = useState<"tarea" | "meta">("tarea");
  const [lockNewItemMode, setLockNewItemMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [integrationToast, setIntegrationToast] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ enabled: false, minutesBefore: 15 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // Load user timezone from profile so all time formatters use it
      if (data.session?.user) {
        supabase
          .from("profiles")
          .select("timezone, reminders_enabled, reminder_minutes_before, theme")
          .eq("id", data.session.user.id)
          .single()
          .then(({ data: p }) => {
            if (p?.timezone) setDisplayTimezone(p.timezone);
            if (p) setReminderSettings({ enabled: p.reminders_enabled ?? false, minutesBefore: p.reminder_minutes_before ?? 15 });
            // El tema del perfil manda (igual que web/app/layout.tsx) — así un
            // cambio hecho en otro dispositivo se ve reflejado al abrir la app.
            if (p?.theme) applyTheme(p.theme as Theme);
          });
      }
    });
    // Handle OAuth deep link callbacks (com.eyro.agenda://auth/*/success|error)
    const deepLinkHandle = CapApp.addListener("appUrlOpen", async (data) => {
      const url = data.url;
      if (!url.startsWith("com.eyro.agenda://auth/")) return;
      await Browser.close().catch(() => {});
      if (url.includes("/success")) {
        const provider = url.includes("/google/") ? "Google Calendar" : "Notion";
        setIntegrationToast(`${provider} conectado`);
        setTimeout(() => setIntegrationToast(null), 3000);
      } else {
        setIntegrationToast("Error al conectar. Intenta de nuevo.");
        setTimeout(() => setIntegrationToast(null), 3500);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        supabase
          .from("profiles")
          .select("timezone, reminders_enabled, reminder_minutes_before, theme")
          .eq("id", s.user.id)
          .single()
          .then(({ data: p }) => {
            if (p?.timezone) setDisplayTimezone(p.timezone);
            if (p) setReminderSettings({ enabled: p.reminders_enabled ?? false, minutesBefore: p.reminder_minutes_before ?? 15 });
            // El tema del perfil manda (igual que web/app/layout.tsx) — así un
            // cambio hecho en otro dispositivo se ve reflejado al abrir la app.
            if (p?.theme) applyTheme(p.theme as Theme);
          });
      }
    });
    return () => {
      listener.subscription.unsubscribe();
      deepLinkHandle.then((h) => h.remove());
    };
  }, []);

  useEffect(() => {
    getAllItems().then(setItems).catch(console.error);
    getPendingCount().then(setPendingCount).catch(console.error);
  }, []);

  async function refreshItems() {
    const [fresh, count] = await Promise.all([getAllItems(), getPendingCount()]);
    setItems(fresh);
    setPendingCount(count);
  }

  // Reprograma los recordatorios locales cada vez que cambian los items o las
  // preferencias — ver mobile/src/lib/notifications.ts.
  useEffect(() => {
    if (!session?.user) return;
    rescheduleReminders(items, reminderSettings).catch((err) => console.error("No se pudieron reprogramar recordatorios:", err));
  }, [items, reminderSettings, session]);

  // Al iniciar sesión, corrige el estado de las tareas (sin_empezar/en_curso/
  // listo) según la hora actual — funciona offline, es local y se sincroniza
  // después como cualquier otro cambio.
  useEffect(() => {
    if (!session?.user) return;

    (async () => {
      try {
        const localItems = await getAllItems();
        const now = new Date();
        const updates = localItems
          .map((item) => ({ item, expected: computeAutoTaskStatus(item, now) }))
          .filter((u): u is { item: Item; expected: NonNullable<typeof u.expected> } => Boolean(u.expected) && u.expected !== u.item.task_status);

        if (updates.length === 0) return;
        await Promise.all(updates.map(({ item, expected }) => updateLocalItem(item.id, { task_status: expected })));
        await refreshItems();
      } catch (err) {
        console.error("Auto task status sync failed:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Fase 5 del plan de implementación: refleja en vivo (sin sync manual)
  // los cambios que se hagan en web u otro dispositivo, mientras no haya un
  // cambio local todavía pendiente de subir para ese mismo item.
  useEffect(() => {
    if (!session?.user) return;
    const unsubscribe = subscribeToItemChanges(session.user.id, refreshItems);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;

    async function trySync() {
      const status = await Network.getStatus();
      if (!status.connected) return;
      setSyncing(true);
      try {
        await fullSync(session!.user.id);
        await refreshItems();
      } catch (err) {
        console.error("Sync failed:", err);
      } finally {
        setSyncing(false);
      }
    }

    trySync();
    const handle = Network.addListener("networkStatusChange", (s) => { if (s.connected) trySync(); });
    return () => { handle.then((h) => h.remove()); };
  }, [session]);

  async function handleManualSync() {
    if (!session?.user || syncing) return;
    const status = await Network.getStatus();
    if (!status.connected) return;
    setSyncing(true);
    setSyncError(null);
    setSyncSummary(null);
    try {
      const result = await forceSyncAll(session.user.id);
      await refreshItems();
      if (result) {
        const imported = result.importedFromGoogle + result.importedFromNotion;
        const parts: string[] = [];
        if (imported > 0) parts.push(`${imported} importada${imported > 1 ? "s" : ""}`);
        if (result.mergedDuplicates > 0) parts.push(`${result.mergedDuplicates} duplicado${result.mergedDuplicates > 1 ? "s" : ""} unidos`);
        setSyncSummary(parts.length > 0 ? parts.join(", ") : "Sin novedades");
        if (result.errors.length > 0) {
          setSyncError(result.errors[0]);
        }
        setTimeout(() => setSyncSummary(null), 5000);
      }
    } catch (err) {
      console.error("Manual sync failed:", err);
      setSyncError(err instanceof Error ? err.message : "No se pudo sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-soft border-t-foreground" />
      </div>
    );
  }

  if (!session) return <LoginPage onLogin={setSession} />;

  const sharedProps = {
    onSettings: () => setShowSettings(true),
    onSync: handleManualSync,
    syncing,
    pendingCount,
    onItemClick: (item: Item) => setSelectedItem(item),
    onNavigate: setCurrentPage,
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {syncing && (
        <div className="fixed top-0 inset-x-0 z-50 h-0.5 bg-foreground/10">
          <div className="h-full w-3/5 bg-foreground/40 animate-pulse" />
        </div>
      )}

      <div className="shrink-0 border-b border-border-soft bg-surface" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button
          type="button"
          onClick={() => setCurrentPage("home")}
          className="font-handwriting text-xl px-4 py-2 text-foreground"
        >
          Mi Agenda
        </button>
      </div>

      {syncSummary && !syncError && (
        <div className="shrink-0 px-4 pt-3">
          <p className="rounded-xl border border-border-soft bg-surface px-4 py-2 text-xs text-muted text-center">{syncSummary}</p>
        </div>
      )}

      {syncError && (
        <div className="shrink-0 px-4 pt-3">
          <ErrorBanner error={syncError} onDismiss={() => setSyncError(null)} onGoToSettings={() => { setSyncError(null); setShowSettings(true); }} />
        </div>
      )}

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        {currentPage === "home"  && <HomePage  items={items} onRefresh={refreshItems} session={session} {...sharedProps} />}
        {currentPage === "week"  && <WeekPage  items={items} {...sharedProps} />}
        {currentPage === "month" && <MonthPage items={items} {...sharedProps} />}
        {currentPage === "tasks" && <TasksPage items={items} {...sharedProps} />}
        {currentPage === "goals" && (
          <GoalsPage
            session={session}
            onSettings={sharedProps.onSettings}
            onNewGoal={() => { setNewItemMode("meta"); setLockNewItemMode(true); setShowNew(true); }}
          />
        )}
        {currentPage === "reports" && (
          <ReportsPage items={items} session={session} onSettings={sharedProps.onSettings} />
        )}
      </main>

      <BottomNav
        current={currentPage}
        onChange={(page) => {
          if (page === "new") { setNewItemMode("tarea"); setLockNewItemMode(false); setShowNew(true); }
          else setCurrentPage(page);
        }}
      />

      {showNew && (
        <NewItemPage
          userId={session.user.id}
          initialMode={newItemMode}
          lockMode={lockNewItemMode}
          onClose={() => setShowNew(false)}
          onCreated={(mode) => {
            setShowNew(false);
            if (mode === "meta") {
              setCurrentPage("goals");
            } else {
              refreshItems();
              setCurrentPage("home");
            }
          }}
          onGoToSettings={() => { setShowNew(false); setShowSettings(true); }}
        />
      )}

      {showSettings && (
        <SettingsPage
          session={session}
          onClose={() => setShowSettings(false)}
          reminderSettings={reminderSettings}
          onReminderSettingsChange={setReminderSettings}
        />
      )}

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onEdit={(item) => { setSelectedItem(null); setEditingItem(item); }}
        />
      )}

      {editingItem && (
        <EditItemPage
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); refreshItems(); }}
          onDeleted={() => { setEditingItem(null); refreshItems(); }}
          onGoToSettings={() => { setEditingItem(null); setShowSettings(true); }}
        />
      )}

      {integrationToast && (
        <div className="fixed bottom-24 inset-x-4 z-50 flex justify-center pointer-events-none">
          <div className="rounded-xl bg-foreground text-background px-4 py-3 text-sm font-medium shadow-lg">
            {integrationToast}
          </div>
        </div>
      )}
    </div>
  );
}
