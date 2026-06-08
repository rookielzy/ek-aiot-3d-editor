import type { AssetRegistry } from "../assets/registry";
import { applyCreateImportedGlbTargets } from "./create-imported-glb-targets";
import { createId } from "../snapshot/defaults";
import { reparentNode } from "../snapshot/hierarchy";
import { cloneTransform, normalizeTransform } from "../snapshot/transforms";
import type { SceneObject, SceneObjectNode, SceneSnapshot } from "../snapshot/types";
import { syncPayloadsFromNodes } from "./node-state";
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
  if (snapshot.nodes[objectId]) {
    throw new Error(`Node ${objectId} already exists.`);
  }

  const parentNode = parentId ? snapshot.nodes[parentId] : null;
  if (parentId && !parentNode) {
    throw new Error(`Parent node ${parentId} does not exist.`);
  }
  if (parentNode?.kind === "light") {
    throw new Error(`Parent node ${parentId} cannot contain imported objects.`);
  }

  const transform = cloneTransform(normalizeTransform(command.transform));
  const asset = assets.register(command.asset);
  const object: SceneObject = {
    id: objectId,
    name: command.name ?? asset.label ?? "GLB object",
    kind: "glb",
    parentId: parentNode?.kind === "object" ? parentNode.objectId : null,
    children: [],
    asset,
    transform
  };
  const node: SceneObjectNode = {
    id: objectId,
    kind: "object",
    name: object.name,
    objectId,
    parentId: null,
    children: [],
    transform
  };

  const objects: SceneSnapshot["objects"] = {
    ...snapshot.objects,
    [objectId]: object
  };

  if (parentNode?.kind === "object") {
    const parent = objects[parentNode.objectId];
    objects[parentNode.objectId] = {
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
    rootObjectIds: parentNode?.kind === "object" ? snapshot.rootObjectIds : [...snapshot.rootObjectIds, objectId],
    nodes: {
      ...snapshot.nodes,
      [objectId]: node
    },
    rootNodeIds: [...snapshot.rootNodeIds, objectId]
  };

  const nodeState = parentId
    ? reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, objectId, parentId)
    : { nodes: nextSnapshot.nodes, rootNodeIds: nextSnapshot.rootNodeIds };
  const imported = syncPayloadsFromNodes({
    ...nextSnapshot,
    nodes: nodeState.nodes,
    rootNodeIds: nodeState.rootNodeIds
  });
  return command.expandImportedTargets
    ? applyCreateImportedGlbTargets(imported, { type: "create-imported-glb-targets", ownerObjectId: objectId })
    : imported;
}
