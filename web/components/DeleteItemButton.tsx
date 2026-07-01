"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteItemButton({ itemId, label = "Eliminar" }: { itemId: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-red-600 hover:text-red-800">
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-soft bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-handwriting text-2xl mb-2">¿Eliminar esta tarea?</h2>
            <p className="mb-4 text-sm text-muted">
              Se borrará también <strong>el evento de Google Calendar</strong> y se{" "}
              <strong>archivará la página de Notion</strong> asociados. Esta acción no se puede deshacer.
            </p>

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={loading}
                className="flex-1 rounded-md bg-red-600 text-white py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-md border border-border-soft px-4 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
