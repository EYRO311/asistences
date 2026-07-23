"use client";

import { useRef, useState } from "react";
import { sileo } from "sileo";
import { IconMicrophone, IconLoader2 } from "@tabler/icons-react";
import type { Category } from "@/lib/types";

// Fase 4 del plan de implementación: "crear una tarea hablando". Usa la Web
// Speech API del navegador (Chrome/Edge; no todos los navegadores la
// soportan) para transcribir, y manda el texto a /api/items/voice-extract
// para que Gemini extraiga los campos — nunca se sube audio a ningún lado.
//
// Solo PRELLENA el formulario; el usuario revisa y confirma con el botón de
// crear normal, así que un error de transcripción o de interpretación no
// puede guardar una tarea equivocada por sí solo.

export interface VoiceExtraction {
  title: string;
  category: Category | null;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:mm"
  allDay: boolean;
}

// SpeechRecognition no tiene tipos oficiales en lib.dom todavía en todos los
// entornos — se define el mínimo necesario aquí.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike; isFinal: boolean }; length: number };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Mensajes específicos por código de error de SpeechRecognition — antes se
// mostraba el mismo mensaje genérico para todo, lo que hacía parecer
// aleatorio cuando en realidad "no-speech" (no dijiste nada a tiempo) y
// "network" (el servicio de reconocimiento del navegador falló) son cosas
// distintas con distinta solución.
const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  "no-speech": "No se detectó voz. Intenta de nuevo y habla justo después de tocar el botón.",
  "audio-capture": "No se pudo acceder al micrófono. Revisa que esté conectado y disponible.",
  "not-allowed": "Necesitas dar permiso de micrófono en el navegador para usar esto.",
  network: "El servicio de reconocimiento de voz del navegador falló por conexión. Intenta de nuevo.",
  aborted: "Se canceló la escucha.",
};

export function VoiceTaskButton({ onExtracted }: { onExtracted: (extraction: VoiceExtraction) => void }) {
  const [status, setStatus] = useState<"idle" | "listening" | "confirming" | "processing">("idle");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function sendToInterpret(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus("processing");
    try {
      const res = await fetch("/api/items/voice-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo interpretar la nota de voz");
      onExtracted(data.extraction as VoiceExtraction);
      sileo.success({ title: "Listo", description: `"${trimmed}"` });
    } catch (err) {
      sileo.error({
        title: "No se pudo interpretar",
        description: err instanceof Error ? err.message : "Intenta de nuevo o llena el formulario a mano.",
      });
    } finally {
      setStatus("idle");
      setTranscript("");
    }
  }

  function startListening() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      sileo.error({
        title: "No disponible",
        description: "Tu navegador no soporta dictado por voz (funciona en Chrome/Edge).",
      });
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const heard = last?.[0]?.transcript?.trim();
      if (heard) {
        setTranscript(heard);
        setStatus("confirming");
      } else {
        setStatus("idle");
      }
    };
    recognition.onerror = (event) => {
      setStatus("idle");
      sileo.error({
        title: "Error de micrófono",
        description: SPEECH_ERROR_MESSAGES[event.error] ?? "No se pudo escuchar. Intenta de nuevo.",
      });
    };
    recognition.onend = () => {
      setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;
    setStatus("listening");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  function cancelConfirmation() {
    setStatus("idle");
    setTranscript("");
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
  );
}
