// Equivalente mobile de web/components/ThemeProvider.tsx (next-themes).
// Sin next-themes aquí: aplicamos la clase directamente al <html> y
// persistimos en localStorage, igual que hacía el toggle original de
// SettingsPage — solo que ahora soporta los 4 temas del perfil compartido
// (profiles.theme) en vez de nada más light/dark.

export type Theme = "light" | "dark" | "theme-ocean" | "theme-forest" | "system";

const STORAGE_KEY = "theme";
const THEME_CLASSES = ["dark", "theme-ocean", "theme-forest"] as const;

export function getStoredTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "system";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);

  const resolved =
    theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;

  if (resolved !== "light") root.classList.add(resolved);
  localStorage.setItem(STORAGE_KEY, theme);
}
