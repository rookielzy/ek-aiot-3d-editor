import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import { isColorString, isFiniteRange, isVector } from "../snapshot/primitives";
import type { LightDefinition } from "./types";

const LIGHT_KINDS = new Set(["ambient", "directional", "hemisphere", "point", "spot"]);

export function validateLights(value: unknown, errors: string[]): asserts value is Record<string, LightDefinition> {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot lights must be a plain object map.");
    return;
  }

  for (const [id, light] of Object.entries(value)) {
    validateLightDefinition(id, light, errors);
  }
}

export function validateLightDefinition(id: string, value: unknown, errors: string[]): asserts value is LightDefinition {
  if (!isPlainRecord(value)) {
    errors.push(`Light ${id} must be a plain object.`);
    return;
  }

  if (value.id !== id) {
    errors.push(`Light ${id} must use a matching id field.`);
  }
  if (!LIGHT_KINDS.has(String(value.kind))) {
    errors.push(`Light ${id} kind is unsupported.`);
  }
  if (typeof value.name !== "string") {
    errors.push(`Light ${id} must include a name.`);
  }
  validateColor(value.color, `Light ${id} color`, errors);
  validateRange(value.intensity, `Light ${id} intensity`, 0, Number.POSITIVE_INFINITY, errors);

  switch (value.kind) {
    case "ambient":
      break;
    case "directional":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateVector3(value.target, `Light ${id} target`, errors);
      break;
    case "hemisphere":
      validateColor(value.groundColor, `Light ${id} groundColor`, errors);
      break;
    case "point":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateOptionalRange(value.distance, `Light ${id} distance`, 0, Number.POSITIVE_INFINITY, errors);
      validateOptionalRange(value.decay, `Light ${id} decay`, 0, Number.POSITIVE_INFINITY, errors);
      break;
    case "spot":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateVector3(value.target, `Light ${id} target`, errors);
      validateOptionalRange(value.distance, `Light ${id} distance`, 0, Number.POSITIVE_INFINITY, errors);
      validateRange(value.angle, `Light ${id} angle`, 0, Math.PI / 2, errors);
      validateOptionalRange(value.penumbra, `Light ${id} penumbra`, 0, 1, errors);
      validateOptionalRange(value.decay, `Light ${id} decay`, 0, Number.POSITIVE_INFINITY, errors);
      break;
  }

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`Light ${id} metadata must be JSON-compatible.`);
  }
}

function validateTransform(value: unknown, label: string, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must include position, rotation, and scale vectors.`);
    return;
  }

  validateVector3(value.position, `${label} position`, errors);
  validateVector3(value.rotation, `${label} rotation`, errors);
  validateVector3(value.scale, `${label} scale`, errors);
}

function validateVector3(value: unknown, label: string, errors: string[]): void {
  if (!isVector(value, 3)) {
    errors.push(`${label} must contain three finite numbers.`);
  }
}

function validateColor(value: unknown, label: string, errors: string[]): void {
  if (!isColorString(value)) {
    errors.push(`${label} must be a #rrggbb or rgb(r, g, b) color string.`);
  }
}

function validateRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (!isFiniteRange(value, min, max)) {
    errors.push(`${label} must be a finite number between ${min} and ${max}.`);
  }
}

function validateOptionalRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  validateRange(value, label, min, max, errors);
}
