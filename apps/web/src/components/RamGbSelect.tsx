import Form from "react-bootstrap/Form";

/** RAM pool picker: 1 GB … maxGb in 1 GB steps. */
export function RamGbSelect({
  id,
  valueGb,
  maxGb,
  disabled,
  onChangeGb,
}: {
  id?: string;
  valueGb: number;
  maxGb: number;
  disabled?: boolean;
  onChangeGb: (gb: number) => void;
}) {
  const max = Math.max(1, Math.floor(maxGb));
  const options = Array.from({ length: max }, (_, i) => i + 1);
  const value = Math.min(max, Math.max(1, valueGb));

  return (
    <Form.Select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChangeGb(Number(e.target.value))}
    >
      {options.map((gb) => (
        <option key={gb} value={gb}>
          {gb} GB
        </option>
      ))}
    </Form.Select>
  );
}
