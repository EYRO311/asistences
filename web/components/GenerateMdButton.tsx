"use client";

import { useState } from "react";
import { sileo } from "sileo";
import { IconMarkdown } from "@tabler/icons-react";
import { formatDailyMarkdown, type MdTaskItem } from "@/lib/dailyMarkdown";

interface Props {
  items: MdTaskItem[];
  dateLabel: string;
  tz: string;
}

export function GenerateMdButton({ items, dateLabel, tz }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const markdown = formatDailyMarkdown(items, dateLabel, tz);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      sileo.success({ title: "Copiado", description: "Pégalo en tu nota diaria de Obsidian." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      sileo.error({ title: "No se pudo copiar", description: "El navegador bloqueó el acceso al portapapeles." });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
    >
      <IconMarkdown size={16} stroke={1.5} aria-hidden />
      {copied ? "Copiado" : "Generar MD"}
    </button>
  );
}
