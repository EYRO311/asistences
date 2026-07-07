import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fullSync, forceSyncAll } from "@/lib/sync";
import { getAllItems, getPendingCount } from "@/db/items";
import { Network } from "@capacitor/network";
import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { WeekPage } from "@/pages/WeekPage";
import { MonthPage } from "@/pages/MonthPage";
import { TasksPage } from "@/pages/TasksPage";
import { NewItemPage } from "@/pages/NewItemPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { BottomNav } from "@/components/BottomNav";
import { ItemDetailModal } from "@/components/ItemDetailModal";

export type Page = "home" | "week" | "month" | "tasks" | "new";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
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
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {syncing && (
        <div className="fixed top-0 inset-x-0 z-50 h-0.5 bg-foreground/10">
          <div className="h-full w-3/5 bg-foreground/40 animate-pulse" />
        </div>
      )}

      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        {currentPage === "home"  && <HomePage  items={items} onRefresh={refreshItems} session={session} {...sharedProps} />}
        {currentPage === "week"  && <WeekPage  items={items} {...sharedProps} />}
        {currentPage === "month" && <MonthPage items={items} {...sharedProps} />}
        {currentPage === "tasks" && <TasksPage items={items} {...sharedProps} />}
      </main>

      <BottomNav
        current={currentPage}
        onChange={(page) => {
          if (page === "new") setShowNew(true);
          else setCurrentPage(page);
        }}
      />

      {showNew && (
        <NewItemPage
          userId={session.user.id}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refreshItems(); setCurrentPage("home"); }}
        />
      )}

      {showSettings && (
        <SettingsPage session={session} onClose={() => setShowSettings(false)} />
      )}

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
