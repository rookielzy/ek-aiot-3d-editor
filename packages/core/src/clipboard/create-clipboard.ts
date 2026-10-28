import { getSelectedNodeIds, getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { cloneImportedGlbNode } from "../imported-targets/create";
import { collectNodeSubtreeIds, collectObjectSubtreeIds, getTopLevelNodeIds } from "../snapshot/hierarchy";
import { findObjectNodeId } from "../snapshot/nodes";
import { cloneTransform } from "../snapshot/transforms";
import { collectClipboardDataSources } from "../data-sources/clipboard";
import type { LightDefinition } from "../lights/types";
import type { SceneNode, SceneSnapshot } from "../snapshot/types";
import { isJsonCompatible } from "../snapshot/validation";
import type {
  ClipboardLightDefinition,
  ClipboardSceneNode,
  ClipboardSceneObject,
  EditorNodeClipboardPayload,
  EditorObjectClipboardPayload
} from "./types";

export function createClipboardPayload(snapshot: SceneSnapshot, objectIds = getSelectedObjectIds(snapshot)): EditorObjectClipboardPayload {
  const topLevelIds = getTopLevelSelectedObjectIds(snapshot, objectIds);
  const copiedObjectIds = new Set<string>();

  for (const objectId of topLevelIds) {
    for (const subtreeId of collectObjectSubtreeIds(snapshot, objectId)) {
      copiedObjectIds.add(subtreeId);
    }
  }

  const objects: EditorObjectClipboardPayload["objects"] = {};
  const assetIds = new Set<string>();

  for (const objectId of copiedObjectIds) {
    const object = snapshot.objects[objectId];
    assetIds.add(object.asset.id);
    objects[objectId] = cloneClipboardObject(object, object.parentId && copiedObjectIds.has(object.parentId)
      ? object.parentId
      : null, object.children.filter((childId) => copiedObjectIds.has(childId)));
  }

  const materials = collectMaterialClipboardState(snapshot, copiedObjectIds, { includeImportedSlots: false });

  const payload: EditorObjectClipboardPayload = {
    kind: "ek-aiot-3d-editor-objects",
    version: 2,
    rootObjectIds: topLevelIds,
    objects,
    materials,
    assetIds: [...assetIds],
    dataSources: collectClipboardDataSources(snapshot, [...copiedObjectIds])
  };

  return assertClipboardPayload(payload);
}

export function createNodeClipboardPayload(snapshot: SceneSnapshot, nodeIds = getSelectedNodeIds(snapshot)): EditorNodeClipboardPayload {
  const topLevelNodeIds = getTopLevelNodeIds(snapshot, nodeIds);
  const copiedNodeIds = new Set<string>();

  for (const nodeId of topLevelNodeIds) {
    for (const subtreeNodeId of collectNodeSubtreeIds(snapshot, nodeId)) {
      if (snapshot.nodes[subtreeNodeId]?.kind !== "camera") {
        copiedNodeIds.add(subtreeNodeId);
      }
    }
  }

  const nodes: EditorNodeClipboardPayload["nodes"] = {};
  const objects: EditorNodeClipboardPayload["objects"] = {};
  const lights: EditorNodeClipboardPayload["lights"] = {};
  const copiedObjectIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const nodeId of copiedNodeIds) {
    const node = snapshot.nodes[nodeId];
    if (node.kind === "object") {
      copiedObjectIds.add(node.objectId);
      assetIds.add(snapshot.objects[node.objectId].asset.id);
    }
  }

  for (const nodeId of copiedNodeIds) {
    const node = snapshot.nodes[nodeId];
    nodes[nodeId] = cloneClipboardNode(
      node,
      node.parentId && copiedNodeIds.has(node.parentId) ? node.parentId : null,
      node.children.filter((childId) => copiedNodeIds.has(childId))
    );

    if (node.kind === "object") {
      const object = snapshot.objects[node.objectId];
      objects[object.id] = cloneClipboardObject(
        object,
        object.parentId && copiedObjectIds.has(object.parentId) ? object.parentId : null,
        object.children.filter((childId) => copiedObjectIds.has(childId))
      );
    }
    if (node.kind === "light") {
      const light = snapshot.lights[node.lightId];
      lights[light.id] = cloneClipboardLight(light);
    }
  }

  for (const object of Object.values(objects)) {
    object.parentId = object.parentId && objects[object.parentId] ? object.parentId : null;
    object.children = object.children.filter((childId) => Boolean(objects[childId]));
  }

  const payload: EditorNodeClipboardPayload = {
    kind: "ek-aiot-3d-editor-nodes",
    version: 3,
    rootNodeIds: topLevelNodeIds.filter((nodeId) => copiedNodeIds.has(nodeId)),
    nodes,
    objects,
    lights,
    materials: collectMaterialClipboardState(snapshot, copiedObjectIds, { includeImportedSlots: true }),
    assetIds: [...assetIds],
    dataSources: collectClipboardDataSources(snapshot, [...copiedObjectIds])
  };

  return assertClipboardPayload(payload);
}

function cloneClipboardObject(
  object: SceneSnapshot["objects"][string],
  parentId: string | null,
  children: string[]
): ClipboardSceneObject {
  return {
    ...object,
    originalId: object.id,
    parentId,
    children: [...children],
    asset: { ...object.asset },
    transform: cloneTransform(object.transform),
    ...(object.metadata ? { metadata: { ...object.metadata } } : {})
  };
}

function cloneClipboardNode(
  node: SceneNode,
  parentId: string | null,
  children: string[]
): ClipboardSceneNode {
  switch (node.kind) {
    case "object":
      return {
        ...node,
        originalId: node.id,
        parentId,
        children: [...children],
        transform: cloneTransform(node.transform),
        ...(node.metadata ? { metadata: { ...node.metadata } } : {})
      };
    case "group":
      return {
        ...node,
        originalId: node.id,
        parentId,
        children: [...children],
        transform: cloneTransform(node.transform),
        ...(node.metadata ? { metadata: { ...node.metadata } } : {})
      };
    case "light":
      return {
        ...node,
        originalId: node.id,
        parentId,
        children: [...children],
        ...(node.transform ? { transform: cloneTransform(node.transform) } : {}),
        ...(node.metadata ? { metadata: { ...node.metadata } } : {})
      };
    case "camera":
      throw new Error("Camera nodes cannot be copied to clipboard.");
    case "imported":
      return {
        ...cloneImportedGlbNode(node),
        originalId: node.id,
        parentId,
        children: [...children]
      };
    default:
      return assertNever(node);
  }
}

function cloneClipboardLight(light: LightDefinition): ClipboardLightDefinition {
  switch (light.kind) {
    case "ambient":
      return {
        ...light,
        originalId: light.id,
        ...(light.metadata ? { metadata: { ...light.metadata } } : {})
      };
    case "directional":
      return {
        ...light,
        originalId: light.id,
        transform: cloneTransform(light.transform),
        target: [...light.target],
        ...(light.metadata ? { metadata: { ...light.metadata } } : {})
      };
    case "hemisphere":
      return {
        ...light,
        originalId: light.id,
        ...(light.metadata ? { metadata: { ...light.metadata } } : {})
      };
    case "point":
      return {
        ...light,
        originalId: light.id,
        transform: cloneTransform(light.transform),
        ...(light.metadata ? { metadata: { ...light.metadata } } : {})
      };
    case "spot":
      return {
        ...light,
        originalId: light.id,
        transform: cloneTransform(light.transform),
        target: [...light.target],
        ...(light.metadata ? { metadata: { ...light.metadata } } : {})
      };
    default:
      return assertNever(light);
  }
}

function collectMaterialClipboardState(
  snapshot: SceneSnapshot,
  copiedObjectIds: Set<string>,
  options: { includeImportedSlots: boolean }
): EditorObjectClipboardPayload["materials"] {
  const copiedImportedSlotTargets = options.includeImportedSlots
    ? collectCopiedImportedSlotTargets(snapshot, copiedObjectIds)
    : new Set<string>();
  const materialIds = new Set<string>();
  const assignments = Object.fromEntries(
    Object.entries(snapshot.materials.assignments)
      .filter(([, assignment]) => {
        if (!copiedObjectIds.has(assignment.target.objectId)) {
          return false;
        }
        return assignment.target.kind === "object" ||
          (options.includeImportedSlots && copiedImportedSlotTargets.has(`${assignment.target.objectId}\0${assignment.target.slotId}`));
      })
      .map(([assignmentId, assignment]) => {
        materialIds.add(assignment.materialId);
        return [assignmentId, { ...assignment, target: { ...assignment.target } }];
      })
  );
  const definitions = Object.fromEntries(
    [...materialIds]
      .map((materialId) => snapshot.materials.definitions[materialId])
      .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition))
      .map((definition) => [definition.id, {
        ...definition,
        override: {
          ...definition.override,
          ...(definition.override.textures ? { textures: { ...definition.override.textures } } : {})
        },
        ...(definition.metadata ? { metadata: { ...definition.metadata } } : {})
      }])
  );

  return {
    definitions,
    assignments
  };
}

function collectCopiedImportedSlotTargets(snapshot: SceneSnapshot, copiedObjectIds: Set<string>): Set<string> {
  const copiedNodeIds = new Set<string>();
  for (const objectId of copiedObjectIds) {
    const nodeId = findObjectNodeId(snapshot, objectId);
    if (!nodeId) {
      continue;
    }
    for (const subtreeNodeId of collectNodeSubtreeIds(snapshot, nodeId)) {
      copiedNodeIds.add(subtreeNodeId);
    }
  }

  const slotTargets = new Set<string>();
  for (const nodeId of copiedNodeIds) {
    const node = snapshot.nodes[nodeId];
    if (node?.kind !== "imported" || !copiedObjectIds.has(node.ownerObjectId)) {
      continue;
    }
    for (const slot of node.materialSlots ?? []) {
      slotTargets.add(`${node.ownerObjectId}\0${slot.slotKey}`);
    }
  }
  return slotTargets;
}

function assertClipboardPayload<T extends EditorObjectClipboardPayload | EditorNodeClipboardPayload>(payload: T): T {
  if (!isJsonCompatible(payload)) {
    throw new Error("Clipboard payload must be JSON-compatible.");
  }

  return payload;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported clipboard node: ${JSON.stringify(value)}`);
}
