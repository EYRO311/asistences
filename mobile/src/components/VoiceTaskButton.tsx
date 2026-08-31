import { useState } from "react";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { IconMicrophone, IconLoader2 } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import type { TaskExtraction } from "@/lib/taskExtraction";

// Equivalente mobile de web/components/VoiceTaskButton.tsx. El WebView de
// Android no implementa la Web Speech API (por eso se había dejado pendiente
// en la fase original), así que aquí se usa un plugin nativo
// (@capacitor-community/speech-recognition) en vez de `webkitSpeechRecognition`.
// Mismo contrato de backend: solo transcribe, /api/items/voice-extract
// (Gemini) interpreta el texto, y el resultado únicamente PRELLENA el
// formulario — el usuario revisa y confirma con el botón de crear normal.

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

export function VoiceTaskButton({ onExtracted }: { onExtracted: (extraction: TaskExtraction) => void }) {
  const [status, setStatus] = useState<"idle" | "listening" | "confirming" | "processing">("idle");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function flashMessage(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 4500);
  }

  async function startListening() {
    setMessage(null);
    try {
      const { available } = await SpeechRecognition.available();
      if (!available) {
        flashMessage("Este dispositivo no soporta dictado por voz.");
        return;
      }

      const { speechRecognition } = await SpeechRecognition.checkPermissions();
      if (speechRecognition !== "granted") {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== "granted") {
          flashMessage("Necesitas dar permiso de micrófono para usar esto.");
          return;
        }
      }

      setStatus("listening");
      const { matches } = await SpeechRecognition.start({
        language: "es-MX",
        maxResults: 1,
        popup: false,
        partialResults: false,
      });

      const heard = matches?.[0]?.trim();
      if (heard) {
        setTranscript(heard);
        setStatus("confirming");
      } else {
        setStatus("idle");
        flashMessage("No se detectó voz. Intenta de nuevo.");
      }
    } catch (err) {
      setStatus("idle");
      flashMessage(err instanceof Error ? err.message : "No se pudo escuchar. Intenta de nuevo.");
    }
  }

  async function stopListening() {
    await SpeechRecognition.stop().catch(() => {});
    setStatus("idle");
  }

  function cancelConfirmation() {
    setStatus("idle");
    setTranscript("");
  }

  async function sendToInterpret(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus("processing");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sin sesión");

      const res = await fetch(`${WEB_URL}/api/items/voice-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcript: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo interpretar la nota de voz");
      onExtracted(data.extraction as TaskExtraction);
      flashMessage("Listo — revisa los campos antes de crear.");
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "No se pudo interpretar. Llena el formulario a mano.");
    } finally {
      setStatus("idle");
      setTranscript("");
    }
  }

  if (status === "confirming") {
    return (
      <div className="rounded-md border border-border-soft p-2.5 space-y-2">
        <p className="text-xs text-muted">Esto escuché — corrígelo si hace falta:</p>
        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-border-soft bg-transparent px-2.5 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => sendToInterpret(transcript)}
            disabled={!transcript.trim()}
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Usar
          </button>
          <button
            type="button"
            onClick={cancelConfirmation}
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
      <button
        type="button"
        onClick={status === "listening" ? stopListening : startListening}
        disabled={status === "processing"}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
          status === "listening"
            ? "border-red-500 text-red-600 dark:text-red-400 animate-pulse"
            : "border-border-soft hover:border-foreground/40"
        }`}
      >
        {status === "processing" ? (
          <IconLoader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <IconMicrophone size={15} aria-hidden />
        )}
        {status === "listening" ? "Escuchando… (toca para detener)" : status === "processing" ? "Interpretando…" : "Crear tarea hablando"}
      </button>
      {message && <p className="mt-1 text-xs text-muted">{message}</p>}
    </div>
  );
}
