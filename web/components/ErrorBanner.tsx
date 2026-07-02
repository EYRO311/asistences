"use client";

import Link from "next/link";

const ERROR_MAP: { pattern: RegExp; message: string; action?: { label: string; href: string } }[] = [
  {
    pattern: /google/i,
    message: "Necesitas conectar tu cuenta de Google Calendar.",
    action: { label: "Ir a Ajustes", href: "/settings" },
  },
  {
    pattern: /notion.*conect|conect.*notion/i,
    message: "Necesitas conectar tu cuenta de Notion.",
    action: { label: "Ir a Ajustes", href: "/settings" },
  },
  {
    pattern: /base de datos de notion|notion_database_id/i,
    message: "Configura el ID de tu base de datos de Notion en Ajustes.",
    action: { label: "Ir a Ajustes", href: "/settings" },
  },
  {
    pattern: /start_time.*end_time|end_time.*start_time/i,
    message: "Debes seleccionar fecha y hora de inicio y fin.",
  },
  {
    pattern: /horario.*inv[aá]lido/i,
    message: "El horario de la rutina no es válido. Verifica los días y horas.",
  },
  {
    pattern: /fetch|network|failed to fetch/i,
    message: "Sin conexión. Revisa tu internet e intenta de nuevo.",
  },
  {
    pattern: /token.*expir|expir.*token/i,
    message: "Tu sesión expiró. Reconecta la integración en Ajustes.",
    action: { label: "Ir a Ajustes", href: "/settings" },
  },
];

export function friendlyError(raw: string): { message: string; action?: { label: string; href: string } } {
  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(raw)) {
      return { message: entry.message, action: entry.action };
    }
  }
  return { message: raw };
}

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss?: () => void;
}) {
  const { message, action } = friendlyError(error);

  return (
    <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <span className="mt-0.5 shrink-0 text-base" aria-hidden>⚠️</span>
      <div className="flex-1 space-y-1">
        <p className="font-medium">{message}</p>
        {action && (
          <Link href={action.href} className="underline hover:no-underline font-medium">
            {action.label} →
          </Link>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}
    </div>
  );
}
