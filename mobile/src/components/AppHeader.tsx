import { IconSettings } from "@tabler/icons-react";

interface Props {
  title: string;
  onSettings: () => void;
}

export function AppHeader({ title, onSettings }: Props) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-1">
      <h1 className="font-handwriting text-3xl">{title}</h1>
      <button
        type="button"
        onClick={onSettings}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-surface transition-colors"
        aria-label="Ajustes"
      >
        <IconSettings size={19} stroke={1.5} aria-hidden />
      </button>
    </div>
  );
}
