import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fullSync, forceSyncAll } from "@/lib/sync";
import { getAllItems, getPendingCount } from "@/db/items";
import { Network } from "@capacitor/network";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { setDisplayTimezone } from "@/lib/timezone";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { WeekPage } from "@/pages/WeekPage";
import { MonthPage } from "@/pages/MonthPage";
import { TasksPage } from "@/pages/TasksPage";
import { GoalsPage } from "@/pages/GoalsPage";
import { NewItemPage } from "@/pages/NewItemPage";
import { EditItemPage } from "@/pages/EditItemPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { BottomNav } from "@/components/BottomNav";
import { ItemDetailModal } from "@/components/ItemDetailModal";

export type Page = "home" | "week" | "month" | "tasks" | "goals" | "new";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // Load user timezone from profile so all time formatters use it
      if (data.session?.user) {
        supabase
          .from("profiles")
          .select("timezone")
          .eq("id", data.session.user.id)
          .single()
          .then(({ data: p }) => { if (p?.timezone) setDisplayTimezone(p.timezone); });
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
          .select("timezone")
          .eq("id", s.user.id)
          .single()
          .then(({ data: p }) => { if (p?.timezone) setDisplayTimezone(p.timezone); });
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
    try {
      await forceSyncAll(session.user.id);
      await refreshItems();
    } catch (err) {
      console.error("Manual sync failed:", err);
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
        />
      )}

      {showSettings && (
        <SettingsPage session={session} onClose={() => setShowSettings(false)} />
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
