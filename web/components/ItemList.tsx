"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Item } from "@/lib/types";
import { decryptClient } from "@/lib/crypto-client";
import { DeleteItemButton } from "@/components/DeleteItemButton";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import { TYPE_BADGE_COLORS, TYPE_LABELS, STATUS_LABELS, formatDateRange } from "@/lib/itemPresentation";
import { IconShirt } from "@tabler/icons-react";

function ItemDescriptionPreview({ description }: { description: string | null }) {
  const [plain, setPlain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    decryptClient(description).then((v) => { if (!cancelled) setPlain(v); });
    return () => { cancelled = true; };
  }, [description]);

  if (!plain) return null;
  return <p className="text-sm text-foreground/80 line-clamp-2">{plain}</p>;
}

export function ItemList({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<Item | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        No tienes tareas todavía. Crea una desde &quot;Nueva tarea&quot;.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border-soft">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 py-3">
            {/* Área clickeable para abrir el modal de detalle */}
            <button
              type="button"
              className="flex-1 space-y-1 text-left"
              onClick={() => setSelected(item)}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[item.type]}`}>
                  {TYPE_LABELS[item.type]}
                </span>
                <span className="font-medium">{item.title}</span>
              </div>
              <p className="text-sm text-muted">{formatDateRange(item)}</p>
              {item.description && <ItemDescriptionPreview description={item.description} />}
              {item.outfit_suggestion && (
                <p className="flex items-start gap-1 text-sm text-muted">
                  <IconShirt size={14} className="shrink-0 mt-0.5" aria-hidden />
                  {item.outfit_suggestion}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{STATUS_LABELS[item.status]}</span>
                {item.notion_url && (
                  <span
                    className="underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(item.notion_url!, "_blank", "noreferrer");
                    }}
                  >
                    Ver en Notion
                  </span>
                )}
              </div>
            </button>

            {/* Acciones rápidas siempre visibles */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Link
                href={`/items/${item.id}/editar`}
                className="text-xs text-muted underline hover:text-foreground"
              >
                Editar
              </Link>
              <DeleteItemButton itemId={item.id} />
            </div>
          </li>
        ))}
      </ul>

      {selected && (
        <ItemDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
