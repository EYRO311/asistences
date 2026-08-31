import { useState } from "react";
import { IconMarkdown } from "@tabler/icons-react";
import { formatDailyMarkdown, type MdTaskItem } from "@/lib/dailyMarkdown";

// Equivalente mobile de web/components/GenerateMdButton.tsx.

interface Props {
  items: MdTaskItem[];
  dateLabel: string;
  tz: string;
}

export function GenerateMdButton({ items, dateLabel, tz }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    const markdown = formatDailyMarkdown(items, dateLabel, tz);
    try {
      await navigator.clipboard.writeText(markdown);
      setError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
    >
      <IconMarkdown size={14} stroke={1.5} aria-hidden />
      {error ? "No se pudo copiar" : copied ? "Copiado" : "Generar MD"}
    </button>
  );
}
