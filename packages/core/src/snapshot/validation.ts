import { SNAPSHOT_VERSION, type JsonValue, type SceneObject, type SceneSnapshot } from "./types";

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
  }

  if (!isPlainRecord(value.selection) || !(typeof value.selection.objectId === "string" || value.selection.objectId === null)) {
    errors.push("Snapshot selection must include an objectId string or null.");
  }

  if (!isPlainRecord(value.assets)) {
    errors.push("Snapshot assets must be a plain object map.");
  } else {
    for (const [id, asset] of Object.entries(value.assets)) {
      if (!isPlainRecord(asset)) {
        errors.push(`Asset ${id} must be a plain object.`);
        continue;
      }
      if (asset.id !== id) {
        errors.push(`Asset ${id} must use a matching id field.`);
      }
      if (asset.kind !== "glb") {
        errors.push(`Asset ${id} must be a GLB asset.`);
      }
      if ("metadata" in asset && !isJsonCompatible(asset.metadata)) {
        errors.push(`Asset ${id} metadata must be JSON-compatible.`);
      }
    }
  }

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
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  let compatible: boolean;
  if (Array.isArray(value)) {
    compatible = value.every((entry) => isJsonCompatible(entry, seen));
  } else if (!isPlainRecord(value)) {
    compatible = false;
  } else {
    compatible = Object.entries(value).every(([key, entry]) => typeof key === "string" && isJsonCompatible(entry, seen));
  }

  seen.delete(value);
  return compatible;
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
