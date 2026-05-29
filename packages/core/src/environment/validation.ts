import type { AssetReference } from "../assets/types";
import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import type { SceneEnvironment } from "./types";

const ENVIRONMENT_MODES = new Set(["none", "solid", "texture", "hdr"]);
const BACKGROUND_MODES = new Set(["none", "solid", "texture", "hdr"]);

export function validateSceneEnvironment(
  value: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): asserts value is SceneEnvironment {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot environment must be a plain object.");
    return;
  }

  if (!ENVIRONMENT_MODES.has(String(value.mode))) {
    errors.push("Snapshot environment mode is unsupported.");
  }

  if (!isPlainRecord(value.background)) {
    errors.push("Snapshot environment background must be a plain object.");
  } else {
    validateBackground(value.background, assets, errors);
  }

  if (!isPlainRecord(value.environment)) {
    errors.push("Snapshot environment settings must be a plain object.");
  } else {
    validateEnvironmentAsset(value.mode, value.environment.assetId, assets, errors);
    validateRange(value.environment.intensity, "Environment intensity", 0, Number.POSITIVE_INFINITY, errors);
    validateRotation(value.environment.rotation, "Environment rotation", errors);
  }

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push("Snapshot environment metadata must be JSON-compatible.");
  }
}

function validateEnvironmentAsset(
  mode: unknown,
  assetId: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): void {
  if (mode === "hdr") {
    validateOptionalAsset(assetId, assets, ["hdr"], "Environment asset", errors, true);
    return;
  }

  if (mode === "texture") {
    validateOptionalAsset(assetId, assets, ["texture", "image"], "Environment asset", errors, true);
    return;
  }

  if (assetId !== undefined) {
    errors.push("Environment assetId is only supported for texture or HDR environments.");
  }
}

function validateBackground(value: Record<string, unknown>, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!BACKGROUND_MODES.has(String(value.mode))) {
    errors.push("Snapshot background mode is unsupported.");
  }

  if (value.mode === "solid") {
    validateOptionalColor(value.color, "Background color", errors);
  }

  if (value.mode === "texture") {
    validateOptionalAsset(value.assetId, assets, ["texture", "image"], "Background texture asset", errors, true);
  } else if (value.mode === "hdr") {
    validateOptionalAsset(value.assetId, assets, ["hdr"], "Background HDR asset", errors, true);
  } else if ("assetId" in value && value.assetId !== undefined) {
    errors.push("Background assetId is only supported for texture or HDR backgrounds.");
  }

  if ("intensity" in value) {
    validateRange(value.intensity, "Background intensity", 0, Number.POSITIVE_INFINITY, errors);
  }
  if ("blur" in value) {
    validateRange(value.blur, "Background blur", 0, 1, errors);
  }
  if ("rotation" in value) {
    validateRotation(value.rotation, "Background rotation", errors);
  }
}

function validateOptionalAsset(
  assetId: unknown,
  assets: Record<string, AssetReference>,
  allowedKinds: AssetReference["kind"][],
  label: string,
  errors: string[],
  required = false
): void {
  if (assetId === undefined) {
    if (required) {
      errors.push(`${label} must reference an existing asset.`);
    }
    return;
  }
  if (typeof assetId !== "string" || !assets[assetId]) {
    errors.push(`${label} must reference an existing asset.`);
    return;
  }
  if (!allowedKinds.includes(assets[assetId].kind)) {
    errors.push(`${label} kind is unsupported.`);
  }
}

function validateRotation(value: unknown, label: string, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must include x, y, and z finite numbers.`);
    return;
  }

  for (const axis of ["x", "y", "z"] as const) {
    if (typeof value[axis] !== "number" || !Number.isFinite(value[axis])) {
      errors.push(`${label}.${axis} must be a finite number.`);
    }
  }
}

function validateOptionalColor(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !/^(#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/.test(value)) {
    errors.push(`${label} must be a #rrggbb or rgb(r, g, b) color string.`);
  }
}

function validateRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${label} must be a finite number between ${min} and ${max}.`);
  }
}
