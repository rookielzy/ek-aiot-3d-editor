import type { AssetReference } from "../assets/types";
import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import type {
  MaterialAssignment,
  MaterialAssignmentTarget,
  MaterialDefinition,
  MaterialState,
  MeshStandardMaterialOverride,
  TextureSlot,
  TextureSlotName
} from "./types";

const MATERIAL_SIDES = new Set(["front", "back", "double"]);
const TEXTURE_SLOTS = new Set(["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap"]);
const COLOR_SPACES = new Set(["srgb", "linear", "none"]);
const WRAP_MODES = new Set(["clamp-to-edge", "repeat", "mirrored-repeat"]);
const FILTER_MODES = new Set(["nearest", "linear"]);

export function validateMaterialState(
  value: unknown,
  context: { objectIds: Set<string>; assets: Record<string, AssetReference> },
  errors: string[]
): asserts value is MaterialState {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot materials must be a plain object.");
    return;
  }

  if (!isPlainRecord(value.definitions)) {
    errors.push("Snapshot material definitions must be a plain object map.");
  } else {
    for (const [id, definition] of Object.entries(value.definitions)) {
      validateMaterialDefinition(id, definition, context.assets, errors);
    }
  }

  if (!isPlainRecord(value.assignments)) {
    errors.push("Snapshot material assignments must be a plain object map.");
  } else {
    for (const [id, assignment] of Object.entries(value.assignments)) {
      validateMaterialAssignment(id, assignment, value.definitions, context.objectIds, errors);
    }
  }
}

export function validateMaterialDefinition(
  id: string,
  value: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): asserts value is MaterialDefinition {
  if (!isPlainRecord(value)) {
    errors.push(`Material ${id} must be a plain object.`);
    return;
  }

  if (value.id !== id) {
    errors.push(`Material ${id} must use a matching id field.`);
  }
  if (typeof value.name !== "string") {
    errors.push(`Material ${id} must include a name.`);
  }
  if (value.kind !== "mesh-standard") {
    errors.push(`Material ${id} must be a mesh-standard material.`);
  }
  validateMaterialOverride(`Material ${id}`, value.override, assets, errors);
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`Material ${id} metadata must be JSON-compatible.`);
  }
}

export function validateMaterialOverride(
  label: string,
  value: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): asserts value is MeshStandardMaterialOverride {
  if (!isPlainRecord(value)) {
    errors.push(`${label} override must be a plain object.`);
    return;
  }

  validateOptionalColor(value.color, `${label} color`, errors);
  validateOptionalRange(value.metalness, `${label} metalness`, 0, 1, errors);
  validateOptionalRange(value.roughness, `${label} roughness`, 0, 1, errors);
  validateOptionalColor(value.emissive, `${label} emissive`, errors);
  validateOptionalRange(value.emissiveIntensity, `${label} emissive intensity`, 0, Number.POSITIVE_INFINITY, errors);
  validateOptionalRange(value.opacity, `${label} opacity`, 0, 1, errors);
  validateOptionalBoolean(value.transparent, `${label} transparent`, errors);
  validateOptionalRange(value.envMapIntensity, `${label} environment intensity`, 0, Number.POSITIVE_INFINITY, errors);

  if ("side" in value && !MATERIAL_SIDES.has(String(value.side))) {
    errors.push(`${label} side must be front, back, or double.`);
  }

  if ("textures" in value) {
    if (!isPlainRecord(value.textures)) {
      errors.push(`${label} textures must be a plain object map.`);
    } else {
      for (const [slotName, slot] of Object.entries(value.textures)) {
        if (!TEXTURE_SLOTS.has(slotName)) {
          errors.push(`${label} texture slot ${slotName} is unsupported.`);
          continue;
        }
        validateTextureSlot(label, slotName as TextureSlotName, slot, assets, errors);
      }
    }
  }

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`${label} metadata must be JSON-compatible.`);
  }
}

function validateMaterialAssignment(
  id: string,
  value: unknown,
  definitions: unknown,
  objectIds: Set<string>,
  errors: string[]
): asserts value is MaterialAssignment {
  if (!isPlainRecord(value)) {
    errors.push(`Material assignment ${id} must be a plain object.`);
    return;
  }

  if (value.id !== id) {
    errors.push(`Material assignment ${id} must use a matching id field.`);
  }
  if (typeof value.materialId !== "string" || !isPlainRecord(definitions) || !definitions[value.materialId]) {
    errors.push(`Material assignment ${id} must reference an existing material.`);
  }
  validateAssignmentTarget(id, value.target, objectIds, errors);
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`Material assignment ${id} metadata must be JSON-compatible.`);
  }
}

function validateAssignmentTarget(id: string, value: unknown, objectIds: Set<string>, errors: string[]): asserts value is MaterialAssignmentTarget {
  if (!isPlainRecord(value)) {
    errors.push(`Material assignment ${id} target must be a plain object.`);
    return;
  }

  if (value.kind === "object") {
    if (typeof value.objectId !== "string" || !objectIds.has(value.objectId)) {
      errors.push(`Material assignment ${id} target object must exist.`);
    }
    return;
  }

  if (value.kind === "material-slot") {
    if (typeof value.objectId !== "string" || !objectIds.has(value.objectId)) {
      errors.push(`Material assignment ${id} target object must exist.`);
    }
    if (typeof value.slotId !== "string") {
      errors.push(`Material assignment ${id} target slotId must be a string.`);
    }
    return;
  }

  errors.push(`Material assignment ${id} target kind is unsupported.`);
}

function validateTextureSlot(
  label: string,
  slotName: TextureSlotName,
  value: unknown,
  assets: Record<string, AssetReference>,
  errors: string[]
): asserts value is TextureSlot {
  if (!isPlainRecord(value)) {
    errors.push(`${label} texture slot ${slotName} must be a plain object.`);
    return;
  }

  if (typeof value.assetId !== "string" || !assets[value.assetId]) {
    errors.push(`${label} texture slot ${slotName} must reference an existing asset.`);
  } else if (assets[value.assetId].kind !== "texture" && assets[value.assetId].kind !== "image") {
    errors.push(`${label} texture slot ${slotName} must reference a texture or image asset.`);
  }

  if ("colorSpace" in value && !COLOR_SPACES.has(String(value.colorSpace))) {
    errors.push(`${label} texture slot ${slotName} colorSpace is unsupported.`);
  }
  if ("uvSet" in value && (!Number.isInteger(value.uvSet) || Number(value.uvSet) < 0)) {
    errors.push(`${label} texture slot ${slotName} uvSet must be a non-negative integer.`);
  }
  if ("wrapS" in value && !WRAP_MODES.has(String(value.wrapS))) {
    errors.push(`${label} texture slot ${slotName} wrapS is unsupported.`);
  }
  if ("wrapT" in value && !WRAP_MODES.has(String(value.wrapT))) {
    errors.push(`${label} texture slot ${slotName} wrapT is unsupported.`);
  }
  if ("magFilter" in value && !FILTER_MODES.has(String(value.magFilter))) {
    errors.push(`${label} texture slot ${slotName} magFilter is unsupported.`);
  }
  if ("minFilter" in value && !FILTER_MODES.has(String(value.minFilter))) {
    errors.push(`${label} texture slot ${slotName} minFilter is unsupported.`);
  }
  if ("transform" in value) {
    validateTextureTransform(`${label} texture slot ${slotName}`, value.transform, errors);
  }
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`${label} texture slot ${slotName} metadata must be JSON-compatible.`);
  }
}

function validateTextureTransform(label: string, value: unknown, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${label} transform must be a plain object.`);
    return;
  }

  validateOptionalVector2(value.offset, `${label} offset`, errors);
  validateOptionalVector2(value.repeat, `${label} repeat`, errors);
  validateOptionalFiniteNumber(value.rotation, `${label} rotation`, errors);
  validateOptionalVector2(value.center, `${label} center`, errors);
}

function validateOptionalColor(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !/^(#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/.test(value)) {
    errors.push(`${label} must be a #rrggbb or rgb(r, g, b) color string.`);
  }
}

function validateOptionalRange(value: unknown, label: string, min: number, max: number, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${label} must be a finite number between ${min} and ${max}.`);
  }
}

function validateOptionalFiniteNumber(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
  }
}

function validateOptionalBoolean(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    errors.push(`${label} must be a boolean.`);
  }
}

function validateOptionalVector2(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    errors.push(`${label} must contain two finite numbers.`);
  }
}
