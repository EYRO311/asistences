import type { Category, TaskStatus } from "@/lib/types";

// Genera el checklist en markdown de las tareas de hoy para pegar en una
// nota diaria de Obsidian. Solo título, hora y categorías (como tags) — sin
// descripción/ubicación, que van encriptadas y no aportan aquí.

export interface MdTaskItem {
  title: string;
  start_time: string | null;
  all_day: boolean;
  task_status: TaskStatus;
  categories: Category[];
}

function formatTimeInTZ(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso)
  );
}

function toTag(category: Category): string {
  return `#${category.toLowerCase().replace(/\s+/g, "-")}`;
}

export function formatDailyMarkdown(items: MdTaskItem[], dateLabel: string, tz: string): string {
  const lines: string[] = [`## Tareas — ${dateLabel}`, ""];

  if (items.length === 0) {
    lines.push("Sin tareas para hoy.");
    return lines.join("\n");
  }

  for (const item of items) {
    const checked = item.task_status === "listo" ? "x" : " ";
    const time = !item.all_day && item.start_time ? `${formatTimeInTZ(item.start_time, tz)} ` : "";
    const tags = item.categories.map(toTag).join(" ");
    lines.push(`- [${checked}] ${time}${item.title}${tags ? ` ${tags}` : ""}`);
  }

  return lines.join("\n");
}
