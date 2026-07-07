import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fullSync } from "@/lib/sync";
import { getAllItems } from "@/db/items";
import { Network } from "@capacitor/network";
import type { Session } from "@supabase/supabase-js";
import type { Item } from "@/lib/types";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { BottomNav } from "@/components/BottomNav";

export type Page = "home" | "week" | "month" | "tasks" | "new";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Load local items on mount
  useEffect(() => {
    getAllItems().then(setItems).catch(console.error);
  }, []);

  // Sync when online + authenticated
  useEffect(() => {
    if (!session?.user) return;

    async function trySync() {
      const status = await Network.getStatus();
      if (!status.connected) return;

      setSyncing(true);
      try {
        await fullSync(session!.user.id);
        const fresh = await getAllItems();
        setItems(fresh);
      } catch (err) {
        console.error("Sync failed:", err);
      } finally {
        setSyncing(false);
      }
    }

    trySync();

    const handle = Network.addListener("networkStatusChange", (status) => {
      if (status.connected) trySync();
    });

    return () => { handle.then((h) => h.remove()); };
  }, [session]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-soft border-t-foreground" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  function refreshItems() {
    getAllItems().then(setItems).catch(console.error);
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Sync indicator */}
      {syncing && (
        <div className="fixed top-0 inset-x-0 z-50 h-0.5 bg-foreground/20">
          <div className="h-full bg-foreground animate-pulse" style={{ width: "60%" }} />
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {currentPage === "home" && (
          <HomePage items={items} onRefresh={refreshItems} session={session} />
        )}
        {currentPage !== "home" && (
          <div className="flex items-center justify-center h-64 text-muted text-sm">
            Próximamente: {currentPage}
          </div>
        )}
      </main>

      <BottomNav current={currentPage} onChange={setCurrentPage} />
    </div>
  );
}
