import Form from "react-bootstrap/Form";

const ALL_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 1024);

export function MemorySelect({
  id,
  valueMb,
  onChangeMb,
  required,
  maxMb,
  disabled,
}: {
  id?: string;
  valueMb: number;
  onChangeMb: (mb: number) => void;
  required?: boolean;
  /** Cap selectable options (and clamp current value). */
  maxMb?: number | null;
  disabled?: boolean;
}) {
  const options = ALL_OPTIONS.filter((mb) => maxMb == null || mb <= maxMb);
  const effective =
    options.length === 0
      ? ALL_OPTIONS.slice(0, 1)
      : options.includes(valueMb)
        ? options
        : [...options, valueMb].sort((a, b) => a - b);

  return (
    <Form.Select
      id={id}
      value={valueMb}
      required={required}
      disabled={disabled}
      onChange={(e) => onChangeMb(Number(e.target.value))}
    >
      {effective.map((mb) => (
        <option key={mb} value={mb} disabled={maxMb != null && mb > maxMb}>
          {mb / 1024} GB
          {maxMb != null && mb > maxMb ? " (over quota)" : ""}
        </option>
      ))}
    </Form.Select>
  );
}
