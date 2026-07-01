"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SYNCED_FLAG = "syncedThisSession";

interface SyncApiResult {
  importedFromGoogle: number;
  importedFromNotion: number;
  mergedDuplicates: number;
  errors: string[];
}

async function runSync(): Promise<SyncApiResult> {
  const res = await fetch("/api/sync", { method: "POST" });
  if (!res.ok) throw new Error("Sync falló");
  return res.json();
}

function summarize(result: SyncApiResult): string | null {
  const imported = result.importedFromGoogle + result.importedFromNotion;
  const parts: string[] = [];
  if (imported > 0) parts.push(`${imported} importada(s)`);
  if (result.mergedDuplicates > 0) parts.push(`${result.mergedDuplicates} unida(s)`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function SyncWidget() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SYNCED_FLAG)) return;

    sessionStorage.setItem(SYNCED_FLAG, "1");
    setSyncing(true);

    runSync()
      .then((result) => {
        const summary = summarize(result);
        if (summary) {
          setMessage(summary);
          router.refresh();
        }
      })
      .catch(() => {})
      .finally(() => {
        setSyncing(false);
        setTimeout(() => setMessage(null), 4000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const result = await runSync();
      sessionStorage.setItem(SYNCED_FLAG, "1");
      const summary = summarize(result);
      setMessage(summary ?? "Sin novedades");
      if (summary) router.refresh();
    } catch {
      setMessage("Error al sincronizar");
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-muted">{message}</span>}
      <button
        type="button"
        onClick={handleManualSync}
        disabled={syncing}
        className="text-muted hover:text-foreground disabled:opacity-50"
        title="Importar lo que agregaste directo en Google Calendar o Notion, y unir tareas duplicadas"
      >
        {syncing ? "Sincronizando..." : "⟳ Sincronizar"}
      </button>
    </div>
  );
}
