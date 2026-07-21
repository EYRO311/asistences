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

export function VoiceTaskButton({ onExtracted }: { onExtracted: (extraction: VoiceExtraction) => void }) {
  const [status, setStatus] = useState<"idle" | "listening" | "processing">("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function handleTranscript(transcript: string) {
    setStatus("processing");
    try {
      const res = await fetch("/api/items/voice-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo interpretar la nota de voz");
      onExtracted(data.extraction as VoiceExtraction);
      sileo.success({ title: "Escuchado", description: `"${transcript}"` });
    } catch (err) {
      sileo.error({
        title: "No se pudo interpretar",
        description: err instanceof Error ? err.message : "Intenta de nuevo o llena el formulario a mano.",
      });
    } finally {
      setStatus("idle");
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
      const transcript = last?.[0]?.transcript?.trim();
      if (transcript) handleTranscript(transcript);
    };
    recognition.onerror = () => {
      setStatus("idle");
      sileo.error({ title: "Error de micrófono", description: "No se pudo escuchar. Intenta de nuevo." });
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
