import { useEffect, useId, useRef, useState, type AriaAttributes, type CSSProperties } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Popover, PopoverContent, PopoverTrigger, getPortalTheme } from "./ui/Popover";
import type { InspectorI18n } from "./inspector-i18n";

interface InspectorColorInputProps extends AriaAttributes {
  value: string;
  disabled?: boolean;
  i18n: InspectorI18n;
  onCommit(value: string): boolean;
  onReset?(): void;
}

export function InspectorColorInput({ value, disabled, i18n, onCommit, onReset, ...aria }: InspectorColorInputProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const resetRef = useRef(onReset);
  resetRef.current = onReset;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const [theme, setTheme] = useState<CSSProperties>({});
  const id = useId();
  useEffect(() => {
    setDraft(value);
    setError(false);
    setOpen(false);
    resetRef.current?.();
  }, [value]);
  function changeOpen(next: boolean) {
    setDraft(value);
    setError(false);
    if (next) setTheme(getPortalTheme(trigger.current));
    else resetRef.current?.();
    setOpen(next);
  }
  function apply() {
    const next = draft.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(next)) { setError(true); return; }
    if (next === value.toLowerCase() || onCommit(next)) changeOpen(false);
  }
  const validDraft = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button ref={trigger} className="ek-ui-color-trigger" disabled={disabled} {...aria}>
          <span aria-hidden className="ek-ui-color-swatch" style={{ backgroundColor: value }} /><span>{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent style={theme} collisionPadding={8} aria-label={aria["aria-label"]}>
        <div className="ek-ui-color-editor">
          <input type="color" aria-label={i18n.t("reactWorkbench.inspector.form.colorPicker")} value={validDraft ? draft : value} onChange={(event) => { setDraft(event.currentTarget.value); setError(false); }} />
          <Input type="text" aria-label={i18n.t("reactWorkbench.inspector.form.hex")} value={draft} aria-invalid={error || undefined} aria-describedby={error ? id : undefined}
            onChange={(event) => { setDraft(event.currentTarget.value); setError(false); }} />
          <span aria-hidden className="ek-ui-color-swatch" style={{ backgroundColor: validDraft ? draft : value }} />
          {error ? <p className="ek-ui-color-error" id={id} role="alert">{i18n.t("reactWorkbench.inspector.form.invalidColor")}</p> : null}
          <div className="ek-ui-color-actions">
            <Button onClick={() => changeOpen(false)}>{i18n.t("reactWorkbench.inspector.form.cancel")}</Button>
            <Button onClick={apply}>{i18n.t("reactWorkbench.inspector.form.apply")}</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
