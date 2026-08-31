"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { IconPalette } from "@tabler/icons-react";

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-8 h-8 rounded-full bg-surface animate-pulse" />;
  }

  const cycleTheme = () => {
    const themes = ["light", "dark", "theme-ocean", "theme-forest"];
    const currentIndex = themes.indexOf(theme ?? "light");
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-1.5 rounded-full text-muted hover:text-foreground hover:bg-border-soft transition-colors"
      aria-label="Cambiar tema"
      title={`Tema actual: ${theme}`}
    >
      <IconPalette size={20} stroke={1.5} />
    </button>
  );
}
