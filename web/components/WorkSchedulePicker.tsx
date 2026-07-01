import { WEEKDAY_OPTIONS } from "@/lib/itemPresentation";

export function WorkSchedulePicker({
  label = "Horario recurrente",
  days,
  onToggleDay,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: {
  label?: string;
  days: number[];
  onToggleDay: (day: number) => void;
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}) {
  return (
    <div className="rounded-md border border-border-soft bg-surface p-3 space-y-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted">
        Marca los días y la hora. Se crea un solo evento recurrente en Google Calendar (cuenta como 1 sola tarea).
      </p>

      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => onToggleDay(day.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              days.includes(day.value)
                ? "border-foreground bg-foreground text-background"
                : "border-border-soft"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="recurrence_start_time">
            Entrada
          </label>
          <input
            id="recurrence_start_time"
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="recurrence_end_time">
            Salida
          </label>
          <input
            id="recurrence_end_time"
            type="time"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
            className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
