import type { DataParameterType } from "@ek-aiot/3d-editor-core";

export function DataParameterValueInput({
  id,
  type,
  value,
  disabled,
  label,
  trueLabel,
  falseLabel,
  onChange
}: {
  id: string;
  type: DataParameterType;
  value: string;
  disabled: boolean;
  label: string;
  trueLabel: string;
  falseLabel: string;
  onChange(value: string): void;
}) {
  if (type === "boolean") {
    return (
      <select
        id={id}
        aria-label={label}
        value={value === "true" ? "true" : "false"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">{trueLabel}</option>
        <option value="false">{falseLabel}</option>
      </select>
    );
  }
  return (
    <input
      id={id}
      type={type === "number" ? "number" : "text"}
      step={type === "number" ? "any" : undefined}
      inputMode={type === "number" ? "decimal" : undefined}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
