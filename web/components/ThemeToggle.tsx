"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9 w-64 rounded-full bg-surface animate-pulse" />;
  }

  function select(next: string) {
    setTheme(next);
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  const THEMES = [
    { id: "light", label: "Claro" },
    { id: "dark", label: "Oscuro" },
    { id: "theme-ocean", label: "Océano" },
    { id: "theme-forest", label: "Bosque" },
  ];

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-border-soft bg-surface p-1 text-sm">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => select(t.id)}
          className={`rounded-full px-3 py-1.5 transition-colors ${
            theme === t.id ? "bg-foreground text-background" : "text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
