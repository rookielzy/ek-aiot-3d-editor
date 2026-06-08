import { createId } from "../snapshot/defaults";
import { remapImportedGlbOwnerKey } from "../imported-targets/keys";
import { cloneTransform } from "../snapshot/transforms";
import type { LightDefinition } from "../lights/types";
import type { MaterialAssignment, MaterialDefinition } from "../materials/types";
import type { SceneImportedGlbNode, SceneNode, SceneObject, SceneSnapshot } from "../snapshot/types";
import { normalizeNodeSelection } from "../selection/selection";
import { syncPayloadsFromNodes } from "./node-state";
import type { PasteObjectsCommand } from "./types";

export function applyPasteObjects(snapshot: SceneSnapshot, command: PasteObjectsCommand): SceneSnapshot {
  const payload = command.payload;

  switch (payload.kind) {
    case "ek-aiot-3d-editor-objects":
      if (payload.version !== 1) {
        throw new Error("Unsupported clipboard payload.");
      }
      return applyPasteObjectClipboard(snapshot, command);
    case "ek-aiot-3d-editor-nodes":
      if (payload.version !== 2) {
        throw new Error("Unsupported clipboard payload.");
      }
      return applyPasteNodeClipboard(snapshot, command);
    default:
      throw new Error("Unsupported clipboard payload.");
  }
}

function applyPasteObjectClipboard(snapshot: SceneSnapshot, command: PasteObjectsCommand): SceneSnapshot {
  const payload = command.payload;
  if (payload.kind !== "ek-aiot-3d-editor-objects") {
    throw new Error("Unsupported clipboard payload.");
  }
  if (payload.rootObjectIds.length === 0) {
    return snapshot;
  }

  for (const assetId of payload.assetIds) {
    if (!snapshot.assets[assetId]) {
      throw new Error(`Clipboard asset ${assetId} does not exist in the target snapshot.`);
    }
  }

  const idMap = buildObjectIdMap(snapshot, Object.keys(payload.objects), command.objectIdMap);
  const objects: SceneSnapshot["objects"] = { ...snapshot.objects };
  const nodes: SceneSnapshot["nodes"] = { ...snapshot.nodes };

  for (const [sourceId, sourceObject] of Object.entries(payload.objects)) {
    const objectId = idMap[sourceId];
    const parentId = sourceObject.parentId && idMap[sourceObject.parentId] ? idMap[sourceObject.parentId] : null;
    const children = sourceObject.children.map((childId) => idMap[childId]).filter((childId): childId is string => Boolean(childId));
    objects[objectId] = cloneObjectPayload(sourceObject, objectId, parentId, children);
    nodes[objectId] = {
      id: objectId,
      kind: "object",
      name: sourceObject.name,
      objectId,
      parentId,
      children,
      transform: cloneTransform(sourceObject.transform),
      ...(sourceObject.metadata ? { metadata: { ...sourceObject.metadata } } : {})
    };
  }

  const materials = pasteMaterialState(snapshot, payload.materials, idMap);

  const pastedRootIds = payload.rootObjectIds.map((objectId) => idMap[objectId]).filter((objectId): objectId is string => Boolean(objectId));

  const nextSnapshot = syncPayloadsFromNodes({
    ...snapshot,
    objects,
    nodes,
    rootNodeIds: [...snapshot.rootNodeIds, ...pastedRootIds],
    materials
  });

  return {
    ...nextSnapshot,
    selection: normalizeNodeSelection(nextSnapshot, {
      mode: "replace",
      nodeIds: pastedRootIds,
      primaryNodeId: pastedRootIds[0] ?? null
    })
  };
}

function applyPasteNodeClipboard(snapshot: SceneSnapshot, command: PasteObjectsCommand): SceneSnapshot {
  const payload = command.payload;
  if (payload.kind !== "ek-aiot-3d-editor-nodes") {
    throw new Error("Unsupported clipboard payload.");
  }
  if (payload.rootNodeIds.length === 0) {
    return snapshot;
  }

  for (const assetId of payload.assetIds) {
    if (!snapshot.assets[assetId]) {
      throw new Error(`Clipboard asset ${assetId} does not exist in the target snapshot.`);
    }
  }

  const objectIdMap = buildObjectIdMap(snapshot, Object.keys(payload.objects), command.objectIdMap);
  const lightIdMap = buildPayloadIdMap(snapshot.lights, Object.keys(payload.lights), "light");
  const nodeIdMap = buildNodeIdMap(snapshot, Object.keys(payload.nodes), objectIdMap, lightIdMap);
  const nodes: SceneSnapshot["nodes"] = { ...snapshot.nodes };
  const objects: SceneSnapshot["objects"] = { ...snapshot.objects };
  const lights: SceneSnapshot["lights"] = { ...snapshot.lights };

  for (const [sourceId, sourceObject] of Object.entries(payload.objects)) {
    const objectId = objectIdMap[sourceId];
    const parentId = sourceObject.parentId && objectIdMap[sourceObject.parentId] ? objectIdMap[sourceObject.parentId] : null;
    const children = sourceObject.children.map((childId) => objectIdMap[childId]).filter((childId): childId is string => Boolean(childId));
    objects[objectId] = cloneObjectPayload(sourceObject, objectId, parentId, children);
  }

  for (const [sourceId, sourceLight] of Object.entries(payload.lights)) {
    lights[lightIdMap[sourceId]] = cloneLightPayload(sourceLight, lightIdMap[sourceId]);
  }

  for (const [sourceId, sourceNode] of Object.entries(payload.nodes)) {
    const nodeId = nodeIdMap[sourceId];
    const parentId = sourceNode.parentId && nodeIdMap[sourceNode.parentId] ? nodeIdMap[sourceNode.parentId] : null;
    const children = sourceNode.children.map((childId) => nodeIdMap[childId]).filter((childId): childId is string => Boolean(childId));
    nodes[nodeId] = cloneNodePayload(sourceNode, nodeId, parentId, children, objectIdMap, lightIdMap);
  }

  const pastedRootIds = payload.rootNodeIds.map((nodeId) => nodeIdMap[nodeId]).filter((nodeId): nodeId is string => Boolean(nodeId));
  const materials = pasteMaterialState(snapshot, payload.materials, objectIdMap);
  const nextSnapshot = syncPayloadsFromNodes({
    ...snapshot,
    nodes,
    rootNodeIds: [...snapshot.rootNodeIds, ...pastedRootIds],
    objects,
    lights,
    materials
  });

  return {
    ...nextSnapshot,
    selection: normalizeNodeSelection(nextSnapshot, {
      mode: "replace",
      nodeIds: pastedRootIds,
      primaryNodeId: pastedRootIds[0] ?? null
    })
  };
}

function buildObjectIdMap(
  snapshot: SceneSnapshot,
  sourceObjectIds: string[],
  providedMap: Record<string, string> | undefined
): Record<string, string> {
  const idMap: Record<string, string> = {};
  const usedIds = new Set(Object.keys(snapshot.objects));
  for (const sourceId of sourceObjectIds) {
    const providedId = providedMap?.[sourceId];
    const objectId = providedId ?? createId("object");
    if (usedIds.has(objectId)) {
      throw new Error(`Object ${objectId} already exists.`);
    }
    usedIds.add(objectId);
    idMap[sourceId] = objectId;
  }
  return idMap;
}

function buildPayloadIdMap(
  current: Record<string, unknown>,
  sourceIds: string[],
  prefix: string
): Record<string, string> {
  const idMap: Record<string, string> = {};
  const usedIds = new Set(Object.keys(current));
  for (const sourceId of sourceIds) {
    const preferredId = `copy:${sourceId}`;
    const id = usedIds.has(preferredId) ? createId(prefix) : preferredId;
    let candidate = id;
    while (usedIds.has(candidate)) {
      candidate = createId(prefix);
    }
    usedIds.add(candidate);
    idMap[sourceId] = candidate;
  }
  return idMap;
}

function buildNodeIdMap(
  snapshot: SceneSnapshot,
  sourceNodeIds: string[],
  objectIdMap: Record<string, string>,
  lightIdMap: Record<string, string>
): Record<string, string> {
  const idMap: Record<string, string> = {};
  const usedIds = new Set(Object.keys(snapshot.nodes));
  for (const sourceNodeId of sourceNodeIds) {
    const preferredId = objectIdMap[sourceNodeId] ?? lightIdMap[sourceNodeId] ?? `copy:${sourceNodeId}`;
    let nodeId = preferredId;
    while (usedIds.has(nodeId)) {
      nodeId = createId("node");
    }
    usedIds.add(nodeId);
    idMap[sourceNodeId] = nodeId;
  }
  return idMap;
}

function createUniqueId(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  preferredId: string
): string {
  if (!current[preferredId] && !next[preferredId]) {
    return preferredId;
  }
  let candidate = createId("material");
  while (current[candidate] || next[candidate]) {
    candidate = createId("material");
  }
  return candidate;
}

function pasteMaterialState(
  snapshot: SceneSnapshot,
  materials: {
    definitions: Record<string, MaterialDefinition>;
    assignments: Record<string, MaterialAssignment>;
  },
  objectIdMap: Record<string, string>
): SceneSnapshot["materials"] {
  const materialIdMap = new Map<string, string>();
  const definitions = { ...snapshot.materials.definitions };
  for (const [materialId, definition] of Object.entries(materials.definitions)) {
    const nextMaterialId = createUniqueId(snapshot.materials.definitions, definitions, `copy:${materialId}`);
    materialIdMap.set(materialId, nextMaterialId);
    definitions[nextMaterialId] = {
      ...definition,
      id: nextMaterialId,
      name: definition.name,
      override: { ...definition.override, textures: definition.override.textures ? { ...definition.override.textures } : undefined },
      ...(definition.metadata ? { metadata: { ...definition.metadata } } : {})
    };
  }

  const assignments = { ...snapshot.materials.assignments };
  for (const assignment of Object.values(materials.assignments)) {
    const objectId = objectIdMap[assignment.target.objectId];
    if (!objectId) {
      continue;
    }
    const target = assignment.target.kind === "object"
      ? { kind: "object" as const, objectId }
      : {
        kind: "material-slot" as const,
        objectId,
        slotId: remapImportedGlbOwnerKey(assignment.target.slotId, assignment.target.objectId, objectId)
      };
    const nextAssignmentId = target.kind === "object"
      ? `object:${target.objectId}`
      : `material-slot:${target.objectId}:${target.slotId}`;
    assignments[nextAssignmentId] = {
      ...assignment,
      id: nextAssignmentId,
      materialId: materialIdMap.get(assignment.materialId) ?? assignment.materialId,
      target,
      ...(assignment.metadata ? { metadata: { ...assignment.metadata } } : {})
    };
  }

  return {
    definitions,
    assignments
  };
}

function cloneObjectPayload(
  sourceObject: SceneObject,
  id: string,
  parentId: string | null,
  children: string[]
): SceneObject {
  return {
    id,
    name: sourceObject.name,
    kind: "glb",
    parentId,
    children: [...children],
    asset: { ...sourceObject.asset },
    transform: cloneTransform(sourceObject.transform),
    ...(sourceObject.metadata ? { metadata: { ...sourceObject.metadata } } : {})
  };
}

function cloneLightPayload(sourceLight: LightDefinition, id: string): LightDefinition {
  switch (sourceLight.kind) {
    case "ambient":
      return {
        ...sourceLight,
        id,
        ...(sourceLight.metadata ? { metadata: { ...sourceLight.metadata } } : {})
      };
    case "hemisphere":
      return {
        ...sourceLight,
        id,
        ...(sourceLight.metadata ? { metadata: { ...sourceLight.metadata } } : {})
      };
    case "point":
      return {
        ...sourceLight,
        id,
        transform: cloneTransform(sourceLight.transform),
        ...(sourceLight.metadata ? { metadata: { ...sourceLight.metadata } } : {})
      };
    case "directional":
      return {
        ...sourceLight,
        id,
        transform: cloneTransform(sourceLight.transform),
        target: [...sourceLight.target],
        ...(sourceLight.metadata ? { metadata: { ...sourceLight.metadata } } : {})
      };
    case "spot":
      return {
        ...sourceLight,
        id,
        transform: cloneTransform(sourceLight.transform),
        target: [...sourceLight.target],
        ...(sourceLight.metadata ? { metadata: { ...sourceLight.metadata } } : {})
      };
    default:
      return assertNever(sourceLight);
  }
}

function cloneNodePayload(
  sourceNode: SceneNode,
  id: string,
  parentId: string | null,
  children: string[],
  objectIdMap: Record<string, string>,
  lightIdMap: Record<string, string>
): SceneNode {
  switch (sourceNode.kind) {
    case "object":
      return {
        id,
        kind: "object",
        name: sourceNode.name,
        objectId: objectIdMap[sourceNode.objectId],
        parentId,
        children,
        transform: cloneTransform(sourceNode.transform),
        ...(sourceNode.metadata ? { metadata: { ...sourceNode.metadata } } : {})
      };
    case "group":
      return {
        id,
        kind: "group",
        name: sourceNode.name,
        parentId,
        children,
        transform: cloneTransform(sourceNode.transform),
        ...(sourceNode.metadata ? { metadata: { ...sourceNode.metadata } } : {})
      };
    case "light":
      return {
        id,
        kind: "light",
        name: sourceNode.name,
        lightId: lightIdMap[sourceNode.lightId],
        parentId,
        children,
        ...(sourceNode.transform ? { transform: cloneTransform(sourceNode.transform) } : {}),
        ...(sourceNode.metadata ? { metadata: { ...sourceNode.metadata } } : {})
      };
    case "imported":
      return remapImportedNodeOwnerKeys({
        id,
        kind: "imported",
        name: sourceNode.name,
        importKey: sourceNode.importKey,
        ownerObjectId: objectIdMap[sourceNode.ownerObjectId] ?? sourceNode.ownerObjectId,
        parentId,
        children,
        source: {
          ...sourceNode.source,
          ...(sourceNode.source.metadata ? { metadata: { ...sourceNode.source.metadata } } : {})
        },
        ...(sourceNode.transform ? { transform: cloneTransform(sourceNode.transform) } : {}),
        ...(sourceNode.materialSlots ? {
          materialSlots: sourceNode.materialSlots.map((slot) => ({
            ...slot,
            source: { ...slot.source },
            ...(slot.metadata ? { metadata: { ...slot.metadata } } : {})
          }))
        } : {}),
        ...(sourceNode.remap ? {
          remap: {
            ...sourceNode.remap,
            ...(sourceNode.remap.candidateImportKeys ? { candidateImportKeys: [...sourceNode.remap.candidateImportKeys] } : {}),
            ...(sourceNode.remap.metadata ? { metadata: { ...sourceNode.remap.metadata } } : {})
          }
        } : {}),
        ...(sourceNode.metadata ? { metadata: { ...sourceNode.metadata } } : {})
      }, sourceNode.ownerObjectId);
    default:
      return assertNever(sourceNode);
  }
}

function remapImportedNodeOwnerKeys(node: SceneImportedGlbNode, sourceOwnerObjectId: string): SceneImportedGlbNode {
  if (node.ownerObjectId === sourceOwnerObjectId) {
    return node;
  }

  const remapped: SceneImportedGlbNode = {
    ...node,
    importKey: remapImportedGlbOwnerKey(node.importKey, sourceOwnerObjectId, node.ownerObjectId)
  };

  if (node.materialSlots) {
    remapped.materialSlots = node.materialSlots.map((slot) => ({
      ...slot,
      slotKey: remapImportedGlbOwnerKey(slot.slotKey, sourceOwnerObjectId, node.ownerObjectId),
      ...(slot.materialImportKey
        ? { materialImportKey: remapImportedGlbOwnerKey(slot.materialImportKey, sourceOwnerObjectId, node.ownerObjectId) }
        : {})
    }));
  }

  if (node.remap) {
    remapped.remap = {
      ...node.remap,
      ...(node.remap.previousImportKey
        ? { previousImportKey: remapImportedGlbOwnerKey(node.remap.previousImportKey, sourceOwnerObjectId, node.ownerObjectId) }
        : {}),
      ...(node.remap.candidateImportKeys
        ? { candidateImportKeys: node.remap.candidateImportKeys.map((importKey) => remapImportedGlbOwnerKey(importKey, sourceOwnerObjectId, node.ownerObjectId)) }
        : {})
    };
  }

  return remapped;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported clipboard value: ${JSON.stringify(value)}`);
}
