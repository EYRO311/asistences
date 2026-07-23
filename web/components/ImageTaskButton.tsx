"use client";

import { useRef, useState } from "react";
import { sileo } from "sileo";
import { IconPhoto, IconLoader2 } from "@tabler/icons-react";
import type { TaskExtraction } from "@/lib/taskExtraction";

// Crear una tarea a partir de una imagen (volante, invitación, captura de
// pantalla, boleto, nota escrita a mano): la imagen se manda a
// /api/items/image-extract para que Gemini extraiga los campos — la imagen
// en sí no se guarda en ningún lado, solo se usa para esta extracción.
//
// Mismo patrón de seguridad que VoiceTaskButton: solo PRELLENA el
// formulario, el usuario revisa y confirma con el botón de crear normal.

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

export function ImageTaskButton({ onExtracted }: { onExtracted: (extraction: TaskExtraction) => void }) {
  const [status, setStatus] = useState<"idle" | "previewing" | "processing">("idle");
  const [preview, setPreview] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      sileo.error({ title: "Formato no soportado", description: "Usa una foto JPG, PNG, WEBP o HEIC." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      sileo.error({ title: "Imagen muy pesada", description: "Usa una imagen de menos de 4MB." });
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setPreview({ dataUrl, base64, mimeType: file.type });
      setStatus("previewing");
    } catch {
      sileo.error({ title: "No se pudo leer la imagen", description: "Intenta con otra foto." });
    }
  }

  async function confirmImage() {
    if (!preview) return;
    setStatus("processing");
    try {
      const res = await fetch("/api/items/image-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: preview.base64, mimeType: preview.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo interpretar la imagen");
      onExtracted(data.extraction as TaskExtraction);
      sileo.success({ title: "Listo", description: "Revisa los campos antes de crear." });
    } catch (err) {
      sileo.error({
        title: "No se pudo interpretar",
        description: err instanceof Error ? err.message : "Intenta de nuevo o llena el formulario a mano.",
      });
    } finally {
      setStatus("idle");
      setPreview(null);
    }
  }

  function cancelPreview() {
    setStatus("idle");
    setPreview(null);
  }

  if (status === "previewing" && preview) {
    return (
      <div className="rounded-md border border-border-soft p-2.5 space-y-2">
        <p className="text-xs text-muted">¿Usar esta imagen para crear la tarea?</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- preview de un archivo local, no una URL optimizable */}
        <img src={preview.dataUrl} alt="Vista previa" className="max-h-40 rounded-md border border-border-soft object-contain" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmImage}
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium"
          >
            Usar esta imagen
          </button>
          <button
            type="button"
            onClick={cancelPreview}
            className="rounded-md border border-border-soft px-3 py-1.5 text-sm hover:bg-surface"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileSelected}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "processing"}
        className="flex items-center gap-1.5 rounded-md border border-border-soft px-3 py-1.5 text-sm transition-colors hover:border-foreground/40 disabled:opacity-50"
      >
        {status === "processing" ? (
          <IconLoader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <IconPhoto size={15} aria-hidden />
        )}
        {status === "processing" ? "Interpretando…" : "Crear tarea desde imagen"}
      </button>
    </>
  );
}
