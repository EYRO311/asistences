"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  if (!theme) {
    return <div className="h-9 w-40" />;
  }

  function select(next: Theme) {
    setTheme(next);
    applyTheme(next);
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  return (
    <div className="inline-flex rounded-full border border-border-soft bg-surface p-1 text-sm">
      <button
        type="button"
        onClick={() => select("light")}
        className={`rounded-full px-3 py-1.5 transition-colors ${
          theme === "light" ? "bg-foreground text-background" : "text-muted"
        }`}
      >
        Claro
      </button>
      <button
        type="button"
        onClick={() => select("dark")}
        className={`rounded-full px-3 py-1.5 transition-colors ${
          theme === "dark" ? "bg-foreground text-background" : "text-muted"
        }`}
      >
        Oscuro
      </button>
    </div>
  );
}
