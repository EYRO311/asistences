import {
  IconCalendar,
  IconCalendarMonth,
  IconClipboardList,
  IconTarget,
  IconPlus,
} from "@tabler/icons-react";
import type { Page } from "@/App";

interface Props {
  current: Page;
  onChange: (page: Page) => void;
}

const LEFT: { page: Page; Icon: typeof IconCalendar; label: string }[] = [
  { page: "week", Icon: IconCalendar, label: "Semana" },
  { page: "month", Icon: IconCalendarMonth, label: "Mes" },
];

const RIGHT: { page: Page; Icon: typeof IconCalendar; label: string }[] = [
  { page: "tasks", Icon: IconClipboardList, label: "Tareas" },
  { page: "goals", Icon: IconTarget, label: "Metas" },
];

export function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="relative mx-auto flex h-16 max-w-md items-center justify-between px-6">
        {LEFT.map(({ page, Icon, label }) => (
          <button
            key={page}
            type="button"
            onClick={() => onChange(page)}
            className={`flex flex-col items-center gap-0.5 text-[11px] ${
              current === page ? "text-foreground" : "text-muted"
            }`}
          >
            <Icon size={22} stroke={1.5} aria-hidden />
            {label}
          </button>
        ))}

        {/* FAB center */}
        <button
          type="button"
          onClick={() => onChange("new")}
          aria-label="Nueva tarea"
          className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
        >
          <IconPlus size={24} stroke={2} aria-hidden />
        </button>
        <span className="w-10" aria-hidden />

        {RIGHT.map(({ page, Icon, label }) => (
          <button
            key={page}
            type="button"
            onClick={() => onChange(page)}
            className={`flex flex-col items-center gap-0.5 text-[11px] ${
              current === page ? "text-foreground" : "text-muted"
            }`}
          >
            <Icon size={22} stroke={1.5} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
