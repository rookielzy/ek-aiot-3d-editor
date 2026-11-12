import { type AriaAttributes, type Ref } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

interface WorkbenchSelectProps<Value extends string> extends AriaAttributes {
  ref?: Ref<HTMLButtonElement>;
  value: Value;
  options: readonly { value: Value; label: string; disabled?: boolean }[];
  disabled?: boolean;
  className?: string;
  onChange(value: Value): void;
}

export function WorkbenchSelect<Value extends string>({
  ref, value, options, disabled, className, onChange, ...aria
}: WorkbenchSelectProps<Value>) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={`:${value}`}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((item) => `:${item.value}` === next);
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger ref={ref} className={className} {...aria}>
        <SelectValue>{selected?.label ?? ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            // Radix reserves the empty string; prefix every value to avoid collisions.
            value={`:${option.value}`}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
