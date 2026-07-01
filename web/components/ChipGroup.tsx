export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  allowClear,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(allowClear && value === option.value ? null : option.value)}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            value === option.value ? "border-foreground bg-foreground text-background" : "border-border-soft"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
