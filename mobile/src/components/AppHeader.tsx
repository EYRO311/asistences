import { IconSettings, IconCloudUpload } from "@tabler/icons-react";

interface Props {
  title: string;
  onSettings: () => void;
  onSync?: () => void;
  syncing?: boolean;
  pendingCount?: number;
}

export function AppHeader({ title, onSettings, onSync, syncing = false, pendingCount = 0 }: Props) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-4">
      <h1 className="font-handwriting text-3xl flex-1">{title}</h1>
      <div className="flex items-center gap-1">
        {onSync && (
          <div className="relative">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-40"
              aria-label="Sincronizar"
            >
              <IconCloudUpload
                size={18}
                stroke={1.5}
                className={syncing ? "animate-pulse" : ""}
                aria-hidden
              />
            </button>
            {pendingCount > 0 && !syncing && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold leading-none">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-surface transition-colors"
          aria-label="Ajustes"
        >
          <IconSettings size={19} stroke={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
