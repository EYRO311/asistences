"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sileo } from "sileo";
import { IconTrash } from "@tabler/icons-react";

export function DeleteItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirmDelete() {
    setLoading(true);

    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo eliminar");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      sileo.error({ title: "Error al eliminar", description: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button 
        type="button" 
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }} 
        className="p-2 text-muted hover:text-red-600 transition-colors rounded-full hover:bg-surface"
        aria-label="Eliminar tarea"
      >
        <IconTrash size={18} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4 pb-[env(safe-area-inset-bottom)]"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border-soft bg-surface p-6 shadow-lg pb-10 sm:pb-6 transition-transform transform translate-y-0 animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-handwriting text-2xl mb-2 text-foreground">¿Eliminar esta tarea?</h2>
            <p className="mb-6 text-sm text-muted">
              Se borrará también <strong>el evento de Google Calendar</strong> y se{" "}
              <strong>archivará la página de Notion</strong> asociados. Esta acción no se puede deshacer.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={loading}
                className="w-full rounded-xl bg-red-600 text-white py-3 sm:py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="w-full rounded-xl border border-border-soft px-4 py-3 sm:py-2 text-sm font-medium transition-colors hover:bg-surface"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
