import type { Category } from "@/lib/types";

// Forma compartida por VoiceTaskButton.tsx e ImageTaskButton.tsx — mismo
// contrato que TaskExtraction en web/lib/gemini.ts (server-only), pero
// definido aparte para que los componentes cliente no importen nada de un
// módulo que trae @google/genai/env vars del servidor.
export interface TaskExtraction {
  title: string;
  category: Category | null;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:mm"
  allDay: boolean;
  location: string | null;
  description: string | null;
}
