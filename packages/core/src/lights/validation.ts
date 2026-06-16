import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import { isColorString, isFiniteRange, isVector } from "../snapshot/primitives";
import type { LightDefinition, LightKind, ShadowCapableLightKind } from "./types";

const LIGHT_KINDS = new Set(["ambient", "directional", "hemisphere", "point", "spot"]);
const SHADOW_CAPABLE_LIGHT_KINDS = new Set<LightKind>(["directional", "point", "spot"]);
const MAX_SHADOW_MAP_SIZE = 4096;

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
      rejectUnsupportedShadow(id, value, errors);
      break;
    case "directional":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateVector3(value.target, `Light ${id} target`, errors);
      validateLightShadow(id, "directional", value.shadow, errors);
      break;
    case "hemisphere":
      validateColor(value.groundColor, `Light ${id} groundColor`, errors);
      rejectUnsupportedShadow(id, value, errors);
      break;
    case "point":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateOptionalRange(value.distance, `Light ${id} distance`, 0, Number.POSITIVE_INFINITY, errors);
      validateOptionalRange(value.decay, `Light ${id} decay`, 0, Number.POSITIVE_INFINITY, errors);
      validateLightShadow(id, "point", value.shadow, errors);
      break;
    case "spot":
      validateTransform(value.transform, `Light ${id} transform`, errors);
      validateVector3(value.target, `Light ${id} target`, errors);
      validateOptionalRange(value.distance, `Light ${id} distance`, 0, Number.POSITIVE_INFINITY, errors);
      validateRange(value.angle, `Light ${id} angle`, 0, Math.PI / 2, errors);
      validateOptionalRange(value.penumbra, `Light ${id} penumbra`, 0, 1, errors);
      validateOptionalRange(value.decay, `Light ${id} decay`, 0, Number.POSITIVE_INFINITY, errors);
      validateLightShadow(id, "spot", value.shadow, errors);
      break;
  }

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`Light ${id} metadata must be JSON-compatible.`);
  }
}

function rejectUnsupportedShadow(id: string, value: Record<string, unknown>, errors: string[]): void {
  if ("shadow" in value) {
    errors.push(`Light ${id} kind ${String(value.kind)} does not support shadow settings.`);
  }
}

function validateLightShadow(id: string, kind: ShadowCapableLightKind, value: unknown, errors: string[]): void {
  const label = `Light ${id} shadow`;
  if (!SHADOW_CAPABLE_LIGHT_KINDS.has(kind)) {
    errors.push(`${label} is not supported by ${kind} lights.`);
    return;
  }
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be a plain object.`);
    return;
  }
  if (typeof value.enabled !== "boolean") {
    errors.push(`${label} enabled must be a boolean.`);
  }
  validateShadowMapSize(value.mapSize, `${label} mapSize`, errors);
  validateFiniteNumber(value.bias, `${label} bias`, errors);
  validateRange(value.normalBias, `${label} normalBias`, 0, Number.POSITIVE_INFINITY, errors);
  validateRange(value.radius, `${label} radius`, 0, Number.POSITIVE_INFINITY, errors);
  validateShadowCamera(id, kind, value.camera, errors);
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`${label} metadata must be JSON-compatible.`);
  }
}

function validateShadowMapSize(value: unknown, label: string, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must include width and height.`);
    return;
  }
  validateShadowMapDimension(value.width, `${label} width`, errors);
  validateShadowMapDimension(value.height, `${label} height`, errors);
}

function validateShadowMapDimension(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_SHADOW_MAP_SIZE || !isPowerOfTwo(value)) {
    errors.push(`${label} must be a positive power-of-two integer no greater than ${MAX_SHADOW_MAP_SIZE}.`);
  }
}

function validateShadowCamera(id: string, kind: ShadowCapableLightKind, value: unknown, errors: string[]): void {
  const label = `Light ${id} shadow camera`;
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be a plain object.`);
    return;
  }
  validateRange(value.near, `${label} near`, 0, Number.POSITIVE_INFINITY, errors);
  validateRange(value.far, `${label} far`, 0, Number.POSITIVE_INFINITY, errors);
  if (typeof value.near === "number" && typeof value.far === "number" && Number.isFinite(value.near) && Number.isFinite(value.far) && value.near >= value.far) {
    errors.push(`${label} near must be less than far.`);
  }
  if (kind !== "directional") {
    return;
  }
  validateFiniteNumber(value.left, `${label} left`, errors);
  validateFiniteNumber(value.right, `${label} right`, errors);
  validateFiniteNumber(value.top, `${label} top`, errors);
  validateFiniteNumber(value.bottom, `${label} bottom`, errors);
  if (
    typeof value.left === "number" &&
    typeof value.right === "number" &&
    Number.isFinite(value.left) &&
    Number.isFinite(value.right) &&
    value.left >= value.right
  ) {
    errors.push(`${label} left must be less than right.`);
  }
  if (
    typeof value.bottom === "number" &&
    typeof value.top === "number" &&
    Number.isFinite(value.bottom) &&
    Number.isFinite(value.top) &&
    value.bottom >= value.top
  ) {
    errors.push(`${label} bottom must be less than top.`);
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

function validateFiniteNumber(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
  }
}

function validateOptionalRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  validateRange(value, label, min, max, errors);
}

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}
