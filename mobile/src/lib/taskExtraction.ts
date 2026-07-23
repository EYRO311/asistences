import type { Category } from "@/lib/types";

// Forma compartida con web/lib/taskExtraction.ts — lo que regresa
// /api/items/image-extract (backend web) para prellenar el formulario de
// "Nueva tarea" en mobile.
export interface TaskExtraction {
  title: string;
  category: Category | null;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:mm"
  allDay: boolean;
  location: string | null;
  description: string | null;
}
