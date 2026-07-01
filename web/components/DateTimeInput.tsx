export function DateTimeInput({
  id,
  value,
  onChange,
  allDay,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  allDay: boolean;
}) {
  const datePart = value.slice(0, 10);
  const timePart = value.slice(11, 16) || "00:00";

  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="date"
        value={datePart}
        onChange={(e) => onChange(`${e.target.value}T${timePart}`)}
        className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
      />
      {!allDay && (
        <input
          type="time"
          aria-label="Hora"
          value={timePart}
          onChange={(e) => onChange(`${datePart}T${e.target.value}`)}
          className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
