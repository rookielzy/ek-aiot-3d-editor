import type { InspectorFieldDescriptor } from "@ek-aiot/3d-editor-core";
import { InspectorNumberInput } from "./InspectorNumberInput";
import { InspectorTextInput } from "./InspectorTextInput";
import { InspectorColorInput } from "./InspectorColorInput";
import { InspectorSelect } from "./InspectorSelect";
import { Switch } from "./ui/Switch";
import { renderFieldLabel, renderOptionLabel, type InspectorI18n } from "./inspector-i18n";

interface InspectorFieldControlProps {
  field: InspectorFieldDescriptor;
  invalid?: boolean;
  descriptionId?: string;
  i18n: InspectorI18n;
  onCommit(value: string): boolean;
  onReset(): void;
  commitUnchanged?: boolean;
}

export function InspectorFieldControl({ field, invalid, descriptionId, i18n, onCommit, onReset, commitUnchanged }: InspectorFieldControlProps) {
  const props = { "aria-label": renderFieldLabel(i18n, field), "aria-invalid": invalid || undefined, "aria-describedby": descriptionId, disabled: field.disabled };
  if (field.kind === "number") return <InspectorNumberInput {...props} commitUnchanged={commitUnchanged} value={String(field.value)} min={field.min} max={field.max} step={field.step ?? 0.01} onReset={onReset} onCommit={(value) => onCommit(value.trim() === "" ? "NaN" : value)} />;
  if (field.kind === "text") return <InspectorTextInput {...props} value={String(field.value)} onCommit={onCommit} onReset={onReset} />;
  if (field.kind === "color") return <InspectorColorInput {...props} value={String(field.value)} i18n={i18n} onCommit={onCommit} onReset={onReset} />;
  if (field.kind === "checkbox") return <Switch {...props} checked={Boolean(field.value)} onCheckedChange={(value) => onCommit(String(value))} />;
  const options = (field.options ?? []).map((option) => ({ value: option.value, label: renderOptionLabel(i18n, option) }));
  if (field.kind === "asset") options.unshift({ value: "", label: i18n.t("reactWorkbench.inspector.field.asset.none") });
  return <InspectorSelect {...props} value={String(field.value)} i18n={i18n} searchable={field.kind === "asset"} options={options.map((option) => ({ ...option, disabled: option.value === "" && field.id.includes(".faces.") }))} onCommit={onCommit} />;
}
