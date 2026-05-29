import { validateSceneEnvironment } from "../environment/validation";
import { validateLights } from "../lights/validation";
import { validateMaterialState } from "../materials/validation";
import { validateAuthoredProblemState } from "../problems/validation";
import { isJsonCompatible as isJsonValueCompatible, isPlainRecord, type JsonValue } from "./json";
import { SNAPSHOT_VERSION, type AssetReference, type SceneObject, type SceneSnapshot } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSceneSnapshot(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainRecord(value)) {
    return { ok: false, errors: ["Snapshot must be a plain object."] };
  }

  if (value.version !== SNAPSHOT_VERSION) {
    errors.push(`Unsupported snapshot version: ${String(value.version)}.`);
  }

  if (!isPlainRecord(value.scene) || typeof value.scene.id !== "string" || typeof value.scene.name !== "string") {
    errors.push("Snapshot scene must include string id and name.");
  }

  if (!isPlainRecord(value.objects)) {
    errors.push("Snapshot objects must be a plain object map.");
  } else {
    for (const [id, object] of Object.entries(value.objects)) {
      validateObject(id, object, errors);
    }
  }

  if (!Array.isArray(value.rootObjectIds) || value.rootObjectIds.some((id) => typeof id !== "string")) {
    errors.push("Snapshot rootObjectIds must be an array of object IDs.");
  } else if (isPlainRecord(value.objects)) {
    for (const rootObjectId of value.rootObjectIds) {
      if (!value.objects[rootObjectId]) {
        errors.push(`Root object ${rootObjectId} must exist in objects.`);
      }
    }
  }

  if (!isPlainRecord(value.selection) || !(typeof value.selection.objectId === "string" || value.selection.objectId === null)) {
    errors.push("Snapshot selection must include an objectId string or null.");
  } else if (value.selection.objectId !== null && isPlainRecord(value.objects) && !value.objects[value.selection.objectId]) {
    errors.push(`Selected object ${value.selection.objectId} must exist in objects.`);
  }

  if (!isPlainRecord(value.assets)) {
    errors.push("Snapshot assets must be a plain object map.");
  } else {
    for (const [id, asset] of Object.entries(value.assets)) {
      validateAsset(id, asset, errors);
    }
  }

  const objectIds = isPlainRecord(value.objects) ? new Set(Object.keys(value.objects)) : new Set<string>();
  const assets = isPlainRecord(value.assets) ? value.assets as Record<string, AssetReference> : {};
  validateObjectReferences(value.objects, assets, errors);
  validateMaterialState(value.materials, { objectIds, assets }, errors);
  validateSceneEnvironment(value.environment, assets, errors);
  validateLights(value.lights, errors);
  validateAuthoredProblemState(value.problems, errors);

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push("Snapshot metadata must be JSON-compatible.");
  }

  if (!isJsonCompatible(value)) {
    errors.push("Snapshot must be JSON-compatible and must not contain runtime objects.");
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidSceneSnapshot(value: unknown): asserts value is SceneSnapshot {
  const result = validateSceneSnapshot(value);
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
}

export function isJsonCompatible(value: unknown, seen = new WeakSet<object>()): value is JsonValue {
  return isJsonValueCompatible(value, seen);
}

function validateAsset(id: string, asset: unknown, errors: string[]): void {
  if (!isPlainRecord(asset)) {
    errors.push(`Asset ${id} must be a plain object.`);
    return;
  }
  if (asset.id !== id) {
    errors.push(`Asset ${id} must use a matching id field.`);
  }
  if (asset.kind !== "glb" && asset.kind !== "texture" && asset.kind !== "hdr" && asset.kind !== "image") {
    errors.push(`Asset ${id} kind is unsupported.`);
  }
  if ("metadata" in asset && !isJsonCompatible(asset.metadata)) {
    errors.push(`Asset ${id} metadata must be JSON-compatible.`);
  }
}

function validateObject(id: string, object: unknown, errors: string[]): void {
  if (!isPlainRecord(object)) {
    errors.push(`Object ${id} must be a plain object.`);
    return;
  }

  const sceneObject = object as Partial<SceneObject>;

  if (sceneObject.id !== id) {
    errors.push(`Object ${id} must use a matching id field.`);
  }
  if (sceneObject.kind !== "glb") {
    errors.push(`Object ${id} must be a GLB-backed object.`);
  }
  if (typeof sceneObject.name !== "string") {
    errors.push(`Object ${id} must include a name.`);
  }
  if (!(typeof sceneObject.parentId === "string" || sceneObject.parentId === null)) {
    errors.push(`Object ${id} parentId must be string or null.`);
  }
  if (!Array.isArray(sceneObject.children) || sceneObject.children.some((childId) => typeof childId !== "string")) {
    errors.push(`Object ${id} children must be string IDs.`);
  }
  if (!isPlainRecord(sceneObject.asset) || typeof sceneObject.asset.id !== "string" || sceneObject.asset.kind !== "glb") {
    errors.push(`Object ${id} must include a GLB asset reference.`);
  }
  if (!isTransform(sceneObject.transform)) {
    errors.push(`Object ${id} transform must include position, rotation, and scale vectors.`);
  }
  if ("metadata" in object && !isJsonCompatible(object.metadata)) {
    errors.push(`Object ${id} metadata must be JSON-compatible.`);
  }
}

function validateObjectReferences(objects: unknown, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!isPlainRecord(objects)) {
    return;
  }

  for (const [id, object] of Object.entries(objects)) {
    if (!isPlainRecord(object)) {
      continue;
    }
    if (typeof object.parentId === "string" && !objects[object.parentId]) {
      errors.push(`Object ${id} parent ${object.parentId} must exist.`);
    }
    if (Array.isArray(object.children)) {
      for (const childId of object.children) {
        if (typeof childId === "string" && !objects[childId]) {
          errors.push(`Object ${id} child ${childId} must exist.`);
        }
      }
    }
    if (isPlainRecord(object.asset) && typeof object.asset.id === "string" && !assets[object.asset.id]) {
      errors.push(`Object ${id} asset ${object.asset.id} must exist in assets.`);
    }
  }
}

function isTransform(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isVector(value.position) &&
    isVector(value.rotation) &&
    isVector(value.scale)
  );
}

function isVector(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
