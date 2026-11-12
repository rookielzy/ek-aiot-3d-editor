// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/select.json
//
// Workbench fields keep their native-select contract (a `value` plus a list of
// `{ value, label }` options and an `onChange(value)` callback) on top of the
// shadcn select primitive, so call sites stay declarative and unchanged.
import { forwardRef, type AriaAttributes } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

const EMPTY_OPTION_VALUE = "ek-select-empty";

export interface WorkbenchSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface WorkbenchSelectProps extends AriaAttributes {
  value: string;
  options: readonly WorkbenchSelectOption[];
  disabled?: boolean;
  className?: string;
  onChange(value: string): void;
}

export const WorkbenchSelect = forwardRef<HTMLButtonElement, WorkbenchSelectProps>(
  function WorkbenchSelect({ value, options, disabled, className, onChange, ...aria }, ref) {
    const selected = options.find((option) => option.value === value);
    return (
      <Select
        value={value === "" ? EMPTY_OPTION_VALUE : value}
        disabled={disabled}
        onValueChange={(next) => onChange(next === EMPTY_OPTION_VALUE ? "" : next)}
      >
        <SelectTrigger ref={ref} className={className} {...aria}>
          <SelectValue>{selected?.label ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value === "" ? EMPTY_OPTION_VALUE : option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
);

WorkbenchSelect.displayName = "WorkbenchSelect";
