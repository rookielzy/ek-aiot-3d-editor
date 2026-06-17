import type { AssetOption, InspectorFieldDescriptor, InspectorFieldOption } from "./types";
import type { AssetKind, AssetReference, SceneSnapshot } from "../snapshot/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";

export interface NumberRange {
  min?: number;
  max?: number;
}

export function numberField(
  id: string,
  label: string,
  value: number,
  options: Partial<Pick<InspectorFieldDescriptor<number>, "disabled" | "min" | "max" | "step" | "problem">> = {}
): InspectorFieldDescriptor<number> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "number",
    value,
    ...options
  };
}

export function colorField(id: string, label: string, value = "#ffffff", disabled = false): InspectorFieldDescriptor<string> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "color",
    value: normalizeColorInputValue(value),
    disabled
  };
}

export function textField(id: string, label: string, value: string, disabled = false): InspectorFieldDescriptor<string> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "text",
    value,
    disabled
  };
}

export function checkboxField(id: string, label: string, value: boolean, disabled = false): InspectorFieldDescriptor<boolean> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "checkbox",
    value,
    disabled
  };
}

export function selectField<T extends string>(
  id: string,
  label: string,
  value: T,
  options: InspectorFieldOption<T>[],
  disabled = false
): InspectorFieldDescriptor<T> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "select",
    value,
    options,
    disabled
  };
}

export function assetField(
  id: string,
  label: string,
  value: string,
  snapshot: SceneSnapshot,
  assetKinds: AssetKind[],
  disabled = false
): InspectorFieldDescriptor<string> {
  return {
    id,
    label,
    labelDescriptor: fieldLabelDescriptor(id, label),
    kind: "asset",
    value,
    assetKinds,
    options: createAssetOptions(snapshot, assetKinds),
    disabled
  };
}

export function createAssetOptions(snapshot: SceneSnapshot, assetKinds: AssetKind[]): AssetOption[] {
  const allowed = new Set(assetKinds);
  return Object.values(snapshot.assets)
    .filter((asset) => allowed.has(asset.kind))
    .map((asset) => ({
      value: asset.id,
      label: asset.label ?? asset.id,
      kind: asset.kind
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function validateAssetKind(
  snapshot: SceneSnapshot,
  assetId: string,
  assetKinds: AssetKind[],
  label: string
): { ok: true; asset: AssetReference } | { ok: false; message: string } {
  const asset = snapshot.assets[assetId];
  if (!asset) {
    return { ok: false, message: `${label} must reference an existing asset.` };
  }
  if (!assetKinds.includes(asset.kind)) {
    return { ok: false, message: `${label} must reference a ${assetKinds.join(" or ")} asset.` };
  }
  return { ok: true, asset };
}

export function parseFiniteNumber(value: unknown, label: string, range: NumberRange = {}): { ok: true; value: number } | { ok: false; message: string } {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return { ok: false, message: `${label} must be a finite number.` };
  }
  if (range.min !== undefined && numberValue < range.min) {
    return { ok: false, message: `${label} must be greater than or equal to ${range.min}.` };
  }
  if (range.max !== undefined && numberValue > range.max) {
    return { ok: false, message: `${label} must be less than or equal to ${range.max}.` };
  }
  return { ok: true, value: numberValue };
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return value === "true" || value === "on" || value === "1";
}

function normalizeColorInputValue(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  const rgb = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!rgb) {
    return value;
  }

  const channels = rgb.slice(1).map((channel) => Number(channel));
  if (channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return value;
  }

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function fieldLabelDescriptor(id: string, label: string) {
  return createDisplayMessageDescriptor({
    namespace: "inspector",
    path: `field.${id}`,
    field: "label",
    fallback: label,
    values: { fieldId: id }
  });
}
