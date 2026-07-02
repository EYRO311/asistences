"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyError } from "@/components/ErrorBanner";

const SYNCED_FLAG = "syncedThisSession";

interface SyncApiResult {
  importedFromGoogle: number;
  importedFromNotion: number;
  mergedDuplicates: number;
  errors: string[];
}

async function runSync(): Promise<SyncApiResult> {
  const res = await fetch("/api/sync", { method: "POST" });
  if (!res.ok) throw new Error("No se pudo conectar con el servidor");
  return res.json();
}

function summarize(result: SyncApiResult): { text: string | null; errors: string[] } {
  const imported = result.importedFromGoogle + result.importedFromNotion;
  const parts: string[] = [];
  if (imported > 0) parts.push(`${imported} importada${imported > 1 ? "s" : ""}`);
  if (result.mergedDuplicates > 0) parts.push(`${result.mergedDuplicates} duplicado${result.mergedDuplicates > 1 ? "s" : ""} unidos`);
  return { text: parts.length > 0 ? parts.join(", ") : null, errors: result.errors ?? [] };
}

export function SyncWidget() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SYNCED_FLAG)) return;
    sessionStorage.setItem(SYNCED_FLAG, "1");
    setSyncing(true);

    runSync()
      .then((result) => {
        const { text, errors } = summarize(result);
        if (text) { setMessage(text); router.refresh(); }
        if (errors.length > 0) setSyncErrors(errors);
      })
      .catch(() => {})
      .finally(() => {
        setSyncing(false);
        setTimeout(() => setMessage(null), 5000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    setMessage(null);
    setSyncErrors([]);
    setShowErrors(false);

    try {
      const result = await runSync();
      sessionStorage.setItem(SYNCED_FLAG, "1");
      const { text, errors } = summarize(result);
      setMessage(text ?? "Sin novedades");
      if (errors.length > 0) setSyncErrors(errors);
      if (text) router.refresh();
    } catch (err) {
      const { message: msg } = friendlyError(err instanceof Error ? err.message : "Error");
      setMessage(msg);
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className={`text-xs ${syncErrors.length > 0 ? "text-amber-500" : "text-muted"}`}>
          {message}
          {syncErrors.length > 0 && (
            <button
              type="button"
              onClick={() => setShowErrors((v) => !v)}
              className="ml-1 underline"
            >
              ({syncErrors.length} error{syncErrors.length > 1 ? "es" : ""})
            </button>
          )}
        </span>
      )}
      {showErrors && syncErrors.length > 0 && (
        <div className="absolute top-12 right-4 z-50 w-72 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/50 p-3 text-xs shadow-lg">
          <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">Errores al sincronizar:</p>
          <ul className="space-y-1 text-amber-700 dark:text-amber-300">
            {syncErrors.map((e, i) => (
              <li key={i}>{friendlyError(e).message}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowErrors(false)}
            className="mt-2 text-amber-600 dark:text-amber-400 underline"
          >
            Cerrar
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleManualSync}
        disabled={syncing}
        className="text-muted hover:text-foreground disabled:opacity-50"
        title="Importar lo que agregaste directo en Google Calendar o Notion, y unir tareas duplicadas"
      >
        {syncing ? "Sincronizando..." : "⟳ Sincronizar"}
      </button>
      <Link
        href="/settings"
        title="Ajustes"
        className="text-muted hover:text-foreground"
        aria-label="Ajustes"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </div>
  );
}
