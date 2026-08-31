import { useState } from "react";

// Mismo contenido que web/components/SettingsForm.tsx's NotionHelpModal —
// guía de 2 pestañas para encontrar/crear la base de datos de Notion.

export function NotionHelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"find" | "create">("find");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-0"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl border border-border-soft bg-surface p-5 shadow-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-handwriting text-xl">Base de datos de Notion</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground text-lg mt-0.5">✕</button>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setTab("find")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "find" ? "border-foreground bg-foreground text-background" : "border-border-soft"}`}
          >
            Ya tengo una
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "create" ? "border-foreground bg-foreground text-background" : "border-border-soft"}`}
          >
            Crear nueva
          </button>
        </div>

        {tab === "find" ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Sigue estos pasos para encontrar el ID de tu base de datos existente.</p>

            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium">Abre la base de datos en Notion</p>
                  <p className="text-muted text-xs mt-0.5">Debe ser una tabla o base de datos de página completa, no una vista inline.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium">Copia el link de la página</p>
                  <p className="text-muted text-xs mt-0.5">Clic en los tres puntos <strong>···</strong> arriba a la derecha → <strong>Copiar enlace</strong>.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium">Extrae el ID de la URL</p>
                  <p className="text-muted text-xs mt-1">El link se ve así:</p>
                  <div className="mt-1 rounded-md bg-background border border-border-soft px-2 py-1.5 font-mono text-xs break-all">
                    notion.so/Mi-base-<strong className="text-foreground">a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4</strong>?v=…
                  </div>
                  <p className="text-muted text-xs mt-1">Los <strong>32 caracteres</strong> alfanuméricos al final del nombre (antes del <code>?</code>) son el ID.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium">Conecta la integración a esa base de datos</p>
                  <p className="text-muted text-xs mt-0.5">En la base de datos: <strong>···</strong> → <strong>Conexiones</strong> → busca tu integración de Notion y selecciónala. Sin este paso la app no podrá escribir ahí.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p className="font-medium">Pega el ID arriba y guarda</p>
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-muted">Crea una base de datos nueva con las columnas que usa la app.</p>

            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="font-medium">Crea una página nueva en Notion</p>
                  <p className="text-muted text-xs mt-0.5">Clic en <strong>+ Nueva página</strong> en la barra lateral.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="font-medium">Inserta una tabla</p>
                  <p className="text-muted text-xs mt-0.5">Escribe <code>/tabla</code> (o <code>/table</code>) y elige <strong>Tabla — página completa</strong>.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="font-medium">Agrega estas columnas</p>
                  <div className="mt-2 rounded-md border border-border-soft overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-background">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Nombre exacto</th>
                          <th className="text-left px-2 py-1.5 font-medium">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {[
                          ["Descripción", "Texto"],
                          ["fecha evento", "Fecha"],
                          ["Fecha límite", "Fecha"],
                          ["Prioridad", "Selección (Alta / Media / Baja)"],
                          ["Nivel de esfuerzo", "Selección (Pequeño / Media / Grande)"],
                          ["Estado", "Estado"],
                          ["Tipo de tarea", "Multi-selección"],
                          ["Responsable", "Persona"],
                          ["vestimenta", "Texto"],
                          ["Ubicación", "Texto"],
                        ].map(([name, type]) => (
                          <tr key={name}>
                            <td className="px-2 py-1.5 font-mono">{name}</td>
                            <td className="px-2 py-1.5 text-muted">{type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted text-xs mt-1">Los nombres deben ser exactamente así (con mayúsculas y acentos).</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">4</span>
                <div>
                  <p className="font-medium">Conecta la integración</p>
                  <p className="text-muted text-xs mt-0.5"><strong>···</strong> → <strong>Conexiones</strong> → selecciona tu integración de Notion.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">5</span>
                <div>
                  <p className="font-medium">Copia el ID de la URL y pégalo arriba</p>
                  <p className="text-muted text-xs mt-0.5">Igual que en la pestaña "Ya tengo una", paso 3.</p>
                </div>
              </li>
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-md bg-foreground text-background py-2 text-sm font-medium"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
