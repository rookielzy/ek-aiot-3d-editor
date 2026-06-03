import type { AssetRegistry } from "../assets/registry";
import { createId } from "../snapshot/defaults";
import { addObjectNode } from "../snapshot/nodes";
import { cloneTransform, normalizeTransform } from "../snapshot/transforms";
import type { SceneObject, SceneSnapshot } from "../snapshot/types";
import type { ImportGlbCommand } from "./types";

export function applyImportGlb(snapshot: SceneSnapshot, command: ImportGlbCommand, assets: AssetRegistry): SceneSnapshot {
  const objectId = command.objectId ?? createId("object");
  const parentId = command.parentId ?? null;

  if (command.asset.kind && command.asset.kind !== "glb") {
    throw new Error("import-glb requires a GLB asset.");
  }

  if (snapshot.objects[objectId]) {
    throw new Error(`Object ${objectId} already exists.`);
  }

  if (parentId && !snapshot.objects[parentId]) {
    throw new Error(`Parent object ${parentId} does not exist.`);
  }

  const transform = cloneTransform(normalizeTransform(command.transform));
  const asset = assets.register(command.asset);
  const object: SceneObject = {
    id: objectId,
    name: command.name ?? asset.label ?? "GLB object",
    kind: "glb",
    parentId,
    children: [],
    asset,
    transform
  };

  const objects: SceneSnapshot["objects"] = {
    ...snapshot.objects,
    [objectId]: object
  };

  if (parentId) {
    const parent = objects[parentId];
    objects[parentId] = {
      ...parent,
      children: [...parent.children, objectId]
    };
  }

  const nextSnapshot = {
    ...snapshot,
    assets: {
      ...snapshot.assets,
      [asset.id]: asset
    },
    objects,
    rootObjectIds: parentId ? snapshot.rootObjectIds : [...snapshot.rootObjectIds, objectId]
  };

  return {
    ...nextSnapshot,
    ...addObjectNode(nextSnapshot, objectId)
  };
}
