import { useRef, useState, type AriaAttributes, type CSSProperties } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { Button } from "./ui/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { Popover, PopoverContent, PopoverTrigger, getPortalTheme } from "./ui/Popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/Command";
import type { InspectorI18n } from "./inspector-i18n";

interface InspectorSelectProps extends AriaAttributes {
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  i18n: InspectorI18n;
  onCommit(value: string): boolean;
}

export function InspectorSelect({ value, options, disabled, searchable, className, i18n, onCommit, ...aria }: InspectorSelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<CSSProperties>({});
  function changeOpen(next: boolean) {
    if (next) setTheme(getPortalTheme(trigger.current));
    setOpen(next);
  }
  function commit(next: string) {
    if (next === value || onCommit(next)) setOpen(false);
  }
  const label = options.find((option) => option.value === value)?.label ?? value;
  if (searchable) return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button ref={trigger} data-ek-searchable disabled={disabled} className={`ek-ui-select-trigger ${className ?? ""}`} {...aria} role="combobox" aria-haspopup="listbox" aria-expanded={open}>
          <span>{label}</span><CaretDown aria-hidden size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent style={theme} collisionPadding={8}>
        <Command>
          <CommandInput aria-label={i18n.t("reactWorkbench.inspector.form.search")} placeholder={i18n.t("reactWorkbench.inspector.form.search")} />
          <CommandList aria-label={aria["aria-label"]}>
            <CommandEmpty>{i18n.t("reactWorkbench.inspector.form.noResults")}</CommandEmpty>
            {options.map((option) => (
              <CommandItem key={option.value} data-ek-value={option.value} value={`value:${option.value}`} keywords={[option.label]} disabled={option.disabled} onSelect={() => commit(option.value)}>
                <span>{option.label}</span>{option.value === value ? <Check aria-hidden size={14} /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
  return (
    <Select value={`value:${value}`} open={open} onOpenChange={changeOpen} disabled={disabled} onValueChange={(next) => commit(next.slice(6))}>
      <SelectTrigger ref={trigger} {...aria} className={className}><SelectValue>{label}</SelectValue></SelectTrigger>
      <SelectContent style={theme} collisionPadding={8}>
        {options.map((option) => <SelectItem key={option.value} data-ek-value={option.value} value={`value:${option.value}`} disabled={option.disabled}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
