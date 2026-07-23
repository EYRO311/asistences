import { useRef, useState } from "react";
import { IconPhoto, IconLoader2 } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import type { TaskExtraction } from "@/lib/taskExtraction";

// Crear una tarea a partir de una imagen (volante, invitación, captura de
// pantalla, boleto, nota escrita a mano): la imagen se manda al backend web
// (POST /api/items/image-extract) para que Gemini extraiga los campos — la
// imagen no se guarda en ningún lado, solo se usa para esta extracción.
//
// Mismo patrón de seguridad que en web: solo PRELLENA el formulario, el
// usuario revisa y confirma con el botón de crear normal.

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";
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
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function showMessage(kind: "error" | "success", text: string) {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showMessage("error", "Formato no soportado. Usa una foto JPG, PNG, WEBP o HEIC.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showMessage("error", "Imagen muy pesada. Usa una de menos de 4MB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setPreview({ dataUrl, base64, mimeType: file.type });
      setStatus("previewing");
    } catch {
      showMessage("error", "No se pudo leer la imagen. Intenta con otra foto.");
    }
  }

  async function confirmImage() {
    if (!preview) return;
    setStatus("processing");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sin sesión");

      const res = await fetch(`${WEB_URL}/api/items/image-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: preview.base64, mimeType: preview.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo interpretar la imagen");
      onExtracted(data.extraction as TaskExtraction);
      showMessage("success", "Listo — revisa los campos antes de crear.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "No se pudo interpretar. Llena el formulario a mano.");
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
    <div>
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
      {message && (
        <p className={`mt-1 text-xs ${message.kind === "error" ? "text-red-500" : "text-muted"}`}>{message.text}</p>
      )}
    </div>
  );
}
