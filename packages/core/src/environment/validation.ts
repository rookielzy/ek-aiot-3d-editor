import type { AssetReference } from "../assets/types";
import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import { isColorString, isFiniteNumber, isFiniteRange } from "../snapshot/primitives";
import type { CubemapFaceRole, EnvironmentBackgroundSource, EnvironmentLightingSource, SceneEnvironment } from "./types";

const LIGHTING_SOURCE_KINDS = new Set(["none", "equirectangular", "hdr", "cubemap"]);
const BACKGROUND_SOURCE_KINDS = new Set(["none", "solid", "flat-image", "equirectangular", "hdr", "cubemap"]);
export const CUBEMAP_FACE_ROLES: CubemapFaceRole[] = [
  "positive-x",
  "negative-x",
  "positive-y",
  "negative-y",
  "positive-z",
  "negative-z"
];
const CUBEMAP_FACE_ROLE_SET = new Set(CUBEMAP_FACE_ROLES);

export function validateSceneEnvironment(
  value: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): asserts value is SceneEnvironment {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot environment must be a plain object.");
    return;
  }

  if (!isPlainRecord(value.lighting)) {
    errors.push("Snapshot environment lighting must be a plain object.");
  } else {
    validateLighting(value.lighting, assets, errors);
  }

  if (!isPlainRecord(value.background)) {
    errors.push("Snapshot environment background must be a plain object.");
  } else {
    validateBackground(value.background, assets, errors);
  }

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push("Snapshot environment metadata must be JSON-compatible.");
  }
}

function validateLighting(value: Record<string, unknown>, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!isPlainRecord(value.source)) {
    errors.push("Environment lighting source must be a plain object.");
  } else {
    validateLightingSource(value.source, assets, errors);
  }
  validateRange(value.intensity, "Environment lighting intensity", 0, Number.POSITIVE_INFINITY, errors);
  validateRotation(value.rotation, "Environment lighting rotation", errors);
}

function validateBackground(value: Record<string, unknown>, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!isPlainRecord(value.source)) {
    errors.push("Environment background source must be a plain object.");
  } else {
    validateBackgroundSource(value.source, assets, errors);
  }

  if ("intensity" in value) {
    validateRange(value.intensity, "Environment background intensity", 0, Number.POSITIVE_INFINITY, errors);
  }
  if ("blur" in value) {
    validateRange(value.blur, "Environment background blur", 0, 1, errors);
  }
  if ("rotation" in value) {
    validateRotation(value.rotation, "Environment background rotation", errors);
  }
}

function validateLightingSource(source: Record<string, unknown>, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!LIGHTING_SOURCE_KINDS.has(String(source.kind))) {
    errors.push("Environment lighting source kind is unsupported.");
    return;
  }

  switch ((source as unknown as EnvironmentLightingSource).kind) {
    case "none":
      rejectUnexpectedAssetFields(source, "Environment lighting source", errors);
      break;
    case "equirectangular":
      validateRequiredAsset(source.assetId, assets, ["texture", "image"], "Environment lighting source asset", errors);
      break;
    case "hdr":
      validateRequiredAsset(source.assetId, assets, ["hdr"], "Environment lighting source asset", errors);
      break;
    case "cubemap":
      validateCubemapFaces(source.faces, assets, "Environment lighting cubemap", errors);
      break;
  }
}

function validateBackgroundSource(source: Record<string, unknown>, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!BACKGROUND_SOURCE_KINDS.has(String(source.kind))) {
    errors.push("Environment background source kind is unsupported.");
    return;
  }

  switch ((source as unknown as EnvironmentBackgroundSource).kind) {
    case "none":
      rejectUnexpectedAssetFields(source, "Environment background source", errors);
      break;
    case "solid":
      if (!isColorString(source.color)) {
        errors.push("Environment background solid color must be a #rrggbb or rgb(r, g, b) color string.");
      }
      break;
    case "flat-image":
      validateRequiredAsset(source.assetId, assets, ["texture", "image"], "Environment background flat image asset", errors);
      break;
    case "equirectangular":
      validateRequiredAsset(source.assetId, assets, ["texture", "image"], "Environment background equirectangular asset", errors);
      break;
    case "hdr":
      validateRequiredAsset(source.assetId, assets, ["hdr"], "Environment background HDR asset", errors);
      break;
    case "cubemap":
      validateCubemapFaces(source.faces, assets, "Environment background cubemap", errors);
      break;
  }
}

function rejectUnexpectedAssetFields(source: Record<string, unknown>, label: string, errors: string[]): void {
  if ("assetId" in source && source.assetId !== undefined) {
    errors.push(`${label} assetId is only supported for asset-backed sources.`);
  }
  if ("faces" in source && source.faces !== undefined) {
    errors.push(`${label} faces are only supported for cubemap sources.`);
  }
}

function validateCubemapFaces(
  faces: unknown,
  assets: Record<string, AssetReference>,
  label: string,
  errors: string[]
): void {
  if (!Array.isArray(faces)) {
    errors.push(`${label} faces must be an array.`);
    return;
  }
  if (faces.length !== CUBEMAP_FACE_ROLES.length) {
    errors.push(`${label} must include exactly six faces.`);
  }

  const seen = new Set<CubemapFaceRole>();
  for (const face of faces) {
    if (!isPlainRecord(face)) {
      errors.push(`${label} face must be a plain object.`);
      continue;
    }
    if (!CUBEMAP_FACE_ROLE_SET.has(String(face.role) as CubemapFaceRole)) {
      errors.push(`${label} face role is unsupported.`);
      continue;
    }
    const role = face.role as CubemapFaceRole;
    if (seen.has(role)) {
      errors.push(`${label} face role ${role} must not be duplicated.`);
    }
    seen.add(role);
    validateRequiredAsset(face.assetId, assets, ["texture", "image"], `${label} ${role} asset`, errors);
  }

  for (const role of CUBEMAP_FACE_ROLES) {
    if (!seen.has(role)) {
      errors.push(`${label} must include ${role}.`);
    }
  }
}

function validateRequiredAsset(
  assetId: unknown,
  assets: Record<string, AssetReference>,
  allowedKinds: AssetReference["kind"][],
  label: string,
  errors: string[]
): void {
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
    if (!isFiniteNumber(value[axis])) {
      errors.push(`${label}.${axis} must be a finite number.`);
    }
  }
}

function validateRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (!isFiniteRange(value, min, max)) {
    errors.push(`${label} must be a finite number between ${min} and ${max}.`);
  }
}
