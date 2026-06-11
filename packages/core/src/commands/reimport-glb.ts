import { attachGlbImportManifestMetadata } from "../assets/import-pipeline";
import type { GlbImportRemapPlan, GlbImportTargetRemap, GlbImportUnresolvedSlot } from "../assets/import-remap";
import { createImportedGlbNodesFromDescriptors, cloneImportedGlbNode } from "../imported-targets/create";
import type { ImportedGlbTargetDescriptor } from "../imported-targets/types";
import { createMaterialAssignmentId } from "../materials/defaults";
import type { MaterialAssignment } from "../materials/types";
import { findObjectNodeId } from "../snapshot/nodes";
import { cloneTransform } from "../snapshot/transforms";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import { syncPayloadsFromNodes } from "./node-state";
import type { ReimportGlbCommand } from "./types";

export function applyReimportGlb(snapshot: SceneSnapshot, command: ReimportGlbCommand): SceneSnapshot {
  const owner = snapshot.objects[command.ownerObjectId];
  if (!owner) {
    throw new Error(`Owner object ${command.ownerObjectId} does not exist.`);
  }
  if (owner.kind !== "glb") {
    throw new Error(`Owner object ${command.ownerObjectId} must be GLB-backed.`);
  }
  if (owner.asset.id !== command.assetId) {
    throw new Error(`Owner object ${command.ownerObjectId} asset ${owner.asset.id} does not match reimport asset ${command.assetId}.`);
  }
  if (command.remap.ownerObjectId !== command.ownerObjectId) {
    throw new Error(`Remap owner ${command.remap.ownerObjectId} does not match ${command.ownerObjectId}.`);
  }

  const ownerNodeId = findObjectNodeId(snapshot, command.ownerObjectId);
  const ownerNode = ownerNodeId ? snapshot.nodes[ownerNodeId] : undefined;
  if (!ownerNode || ownerNode.kind !== "object") {
    throw new Error(`Owner object ${command.ownerObjectId} does not have an object node.`);
  }

  const currentImportedNodes = Object.values(snapshot.nodes)
    .filter((node): node is SceneImportedGlbNode => node.kind === "imported" && node.ownerObjectId === command.ownerObjectId);
  const currentImportedById = new Map(currentImportedNodes.map((node) => [node.id, node]));
  const matchedRemapByNodeId = new Map<string, GlbImportTargetRemap>();
  const matchedNodeIds = new Set<string>();
  const matchedDescriptors: ImportedGlbTargetDescriptor[] = [];
  for (const remap of command.remap.targetRemaps) {
    const current = currentImportedById.get(remap.previousNodeId);
    if (!current) {
      throw new Error(`Imported target ${remap.previousNodeId} does not exist.`);
    }
    if (matchedNodeIds.has(current.id)) {
      throw new Error(`Imported target ${current.id} appears more than once in GLB reimport remaps.`);
    }
    matchedNodeIds.add(current.id);
    matchedRemapByNodeId.set(current.id, remap);
    matchedDescriptors.push({
      ...remap.nextDescriptor,
      id: current.id
    });
  }

  const unresolvedNodeIds = new Set<string>();
  for (const unresolved of command.remap.unresolvedTargets) {
    const current = currentImportedById.get(unresolved.nodeId);
    if (!current) {
      throw new Error(`Imported target ${unresolved.nodeId} does not exist.`);
    }
    if (matchedNodeIds.has(current.id) || unresolvedNodeIds.has(current.id)) {
      throw new Error(`Imported target ${current.id} appears more than once in GLB reimport remaps.`);
    }
    unresolvedNodeIds.add(current.id);
  }

  for (const current of currentImportedNodes) {
    if (!matchedNodeIds.has(current.id) && !unresolvedNodeIds.has(current.id)) {
      throw new Error(`Imported target ${current.id} is missing from GLB reimport remaps.`);
    }
  }

  const nextDescriptors = createCollisionSafeReimportDescriptors(
    snapshot,
    currentImportedById,
    matchedNodeIds,
    unresolvedNodeIds,
    matchedDescriptors,
    command.remap.newTargets.map((target) => target.descriptor)
  );
  const descriptorNodes = createImportedGlbNodesFromDescriptors(command.ownerObjectId, ownerNode.id, nextDescriptors);
  const nextImportedNodes: SceneImportedGlbNode[] = Object.values(descriptorNodes).map((node) => {
    const remap = matchedRemapByNodeId.get(node.id);
    if (!remap) {
      return node;
    }
    const current = currentImportedById.get(node.id)!;
    return createMatchedImportedNode(current, node, remap);
  });

  const activeNextNodeIds = new Set(nextImportedNodes.map((node) => node.id));
  for (const unresolved of command.remap.unresolvedTargets) {
    const current = currentImportedById.get(unresolved.nodeId);
    if (!current) {
      throw new Error(`Imported target ${unresolved.nodeId} does not exist.`);
    }
    const parentId = current.parentId && (activeNextNodeIds.has(current.parentId) || unresolvedNodeIds.has(current.parentId))
      ? current.parentId
      : ownerNode.id;
    const next: SceneImportedGlbNode = {
      ...cloneImportedGlbNode(current),
      parentId,
      children: current.children.filter((childId) => unresolvedNodeIds.has(childId)),
      remap: {
        status: "unresolved",
        previousImportKey: unresolved.previousImportKey,
        candidateImportKeys: [...unresolved.candidateImportKeys],
        metadata: { reason: unresolved.reason }
      }
    };
    nextImportedNodes.push(next);
  }
  const unresolvedSlotsByNodeId = groupUnresolvedSlotsByNodeId(command.remap.unresolvedSlots);
  for (let index = 0; index < nextImportedNodes.length; index += 1) {
    const node = nextImportedNodes[index];
    const unresolvedSlots = unresolvedSlotsByNodeId.get(node.id);
    if (!unresolvedSlots || unresolvedSlots.length === 0) {
      continue;
    }
    nextImportedNodes[index] = {
      ...node,
      remap: createSlotRemapMetadata(node.remap, unresolvedSlots.map((slot) => slot.slotKey))
    };
  }
  const importedIds = new Set(currentImportedNodes.map((node) => node.id));
  const nodes: SceneSnapshot["nodes"] = {};
  for (const [nodeId, node] of Object.entries(snapshot.nodes)) {
    if (importedIds.has(nodeId)) {
      continue;
    }
    nodes[nodeId] = {
      ...node,
      children: node.id === ownerNode.id
        ? node.children.filter((childId) => !importedIds.has(childId))
        : node.children.filter((childId) => !importedIds.has(childId))
    };
  }
  for (const node of nextImportedNodes) {
    if (snapshot.nodes[node.id] && !currentImportedById.has(node.id)) {
      throw new Error(`Imported target node ${node.id} already exists.`);
    }
    nodes[node.id] = { ...node, children: [] };
  }
  for (const node of nextImportedNodes) {
    if (!node.parentId || !nodes[node.parentId]) {
      nodes[node.id] = {
        ...nodes[node.id],
        parentId: ownerNode.id
      };
    }
  }
  for (const node of Object.values(nodes)) {
    if (node.kind !== "imported" || node.ownerObjectId !== command.ownerObjectId || node.parentId === ownerNode.id) {
      continue;
    }
    const parent = nodes[node.parentId ?? ""];
    if (parent?.kind === "imported") {
      nodes[parent.id] = {
        ...parent,
        children: [...parent.children, node.id]
      };
    }
  }
  nodes[ownerNode.id] = {
    ...nodes[ownerNode.id],
    children: [
      ...nodes[ownerNode.id].children,
      ...Object.values(nodes)
        .filter((node): node is SceneImportedGlbNode => node.kind === "imported" && node.ownerObjectId === command.ownerObjectId && node.parentId === ownerNode.id)
        .map((node) => node.id)
    ]
  };

  const nextAsset = {
    ...snapshot.assets[command.assetId],
    metadata: attachGlbImportManifestMetadata(snapshot.assets[command.assetId]?.metadata, command.manifest)
  };
  const nextObject = {
    ...owner,
    asset: nextAsset
  };

  const nextSnapshot = syncPayloadsFromNodes({
    ...snapshot,
    assets: {
      ...snapshot.assets,
      [command.assetId]: nextAsset
    },
    objects: {
      ...snapshot.objects,
      [command.ownerObjectId]: nextObject
    },
    nodes,
    materials: remapMaterialAssignments(snapshot, command.remap),
    selection: normalizeSelection(nodes, snapshot.selection)
  });

  for (const nodeId of nextSnapshot.selection.nodeIds) {
    if (!nextSnapshot.nodes[nodeId]) {
      throw new Error(`Selection references missing node ${nodeId}.`);
    }
  }
  return nextSnapshot;
}

function createCollisionSafeReimportDescriptors(
  snapshot: SceneSnapshot,
  currentImportedById: ReadonlyMap<string, SceneImportedGlbNode>,
  matchedNodeIds: ReadonlySet<string>,
  unresolvedNodeIds: ReadonlySet<string>,
  matchedDescriptors: readonly ImportedGlbTargetDescriptor[],
  newDescriptors: readonly ImportedGlbTargetDescriptor[]
): ImportedGlbTargetDescriptor[] {
  const usedNodeIds = new Set<string>();
  for (const nodeId of Object.keys(snapshot.nodes)) {
    if (!currentImportedById.has(nodeId) || matchedNodeIds.has(nodeId) || unresolvedNodeIds.has(nodeId)) {
      usedNodeIds.add(nodeId);
    }
  }

  const descriptors: ImportedGlbTargetDescriptor[] = [];
  const importKeys = new Set<string>();
  for (const descriptor of matchedDescriptors) {
    if (importKeys.has(descriptor.importKey)) {
      throw new Error(`Imported target import key ${descriptor.importKey} appears more than once in GLB reimport remaps.`);
    }
    importKeys.add(descriptor.importKey);
    descriptors.push(descriptor);
  }

  for (const descriptor of newDescriptors) {
    if (importKeys.has(descriptor.importKey)) {
      throw new Error(`Imported target import key ${descriptor.importKey} appears more than once in GLB reimport remaps.`);
    }
    importKeys.add(descriptor.importKey);
    descriptors.push({
      ...descriptor,
      id: allocateCollisionSafeNodeId(descriptor.id, usedNodeIds)
    });
  }

  return descriptors;
}

function allocateCollisionSafeNodeId(preferredId: string, usedNodeIds: Set<string>): string {
  if (!usedNodeIds.has(preferredId)) {
    usedNodeIds.add(preferredId);
    return preferredId;
  }

  let index = 2;
  let candidate = `${preferredId}-${index}`;
  while (usedNodeIds.has(candidate)) {
    index += 1;
    candidate = `${preferredId}-${index}`;
  }
  usedNodeIds.add(candidate);
  return candidate;
}

function createMatchedImportedNode(
  current: SceneImportedGlbNode,
  nextNode: SceneImportedGlbNode,
  remap: GlbImportTargetRemap
): SceneImportedGlbNode {
  const node: SceneImportedGlbNode = {
    ...nextNode,
    ...(current.transform ? { transform: cloneTransform(current.transform) } : {})
  };
  if (remap.kind === "exact") {
    return node;
  }
  return {
    ...node,
    remap: createSlotRemapMetadata({
      status: "resolved",
      previousImportKey: remap.previousImportKey,
      metadata: {
        kind: remap.kind,
        confidence: remap.confidence,
        reason: remap.reason
      }
    }, [])
  };
}

function groupUnresolvedSlotsByNodeId(
  unresolvedSlots: readonly GlbImportUnresolvedSlot[]
): Map<string, GlbImportUnresolvedSlot[]> {
  const byNodeId = new Map<string, GlbImportUnresolvedSlot[]>();
  for (const slot of unresolvedSlots) {
    byNodeId.set(slot.nodeId, [...(byNodeId.get(slot.nodeId) ?? []), slot]);
  }
  return byNodeId;
}

function createSlotRemapMetadata(
  base: SceneImportedGlbNode["remap"] | undefined,
  unresolvedSlotKeys: readonly string[]
): SceneImportedGlbNode["remap"] | undefined {
  if (unresolvedSlotKeys.length === 0) {
    return base;
  }
  return {
    ...(base ?? {}),
    metadata: {
      ...(base?.metadata ?? {}),
      unresolvedMaterialSlots: [...unresolvedSlotKeys].sort()
    }
  };
}

function remapMaterialAssignments(
  snapshot: SceneSnapshot,
  remap: GlbImportRemapPlan
): SceneSnapshot["materials"] {
  const slotKeyRemaps = new Map(remap.slotRemaps.map((slot) => [slot.previousSlotKey, slot.nextSlotKey]));
  if (slotKeyRemaps.size === 0) {
    return snapshot.materials;
  }

  const assignments: SceneSnapshot["materials"]["assignments"] = {};
  for (const assignment of Object.values(snapshot.materials.assignments)) {
    const nextAssignment = remapMaterialAssignment(assignment, remap.ownerObjectId, slotKeyRemaps);
    if (assignments[nextAssignment.id]) {
      throw new Error(`Material assignment ${nextAssignment.id} would collide after GLB reimport.`);
    }
    assignments[nextAssignment.id] = nextAssignment;
  }
  return {
    definitions: snapshot.materials.definitions,
    assignments
  };
}

function remapMaterialAssignment(
  assignment: MaterialAssignment,
  ownerObjectId: string,
  slotKeyRemaps: ReadonlyMap<string, string>
): MaterialAssignment {
  if (
    assignment.target.kind !== "material-slot" ||
    assignment.target.objectId !== ownerObjectId ||
    !slotKeyRemaps.has(assignment.target.slotId)
  ) {
    return assignment;
  }

  const target = {
    ...assignment.target,
    slotId: slotKeyRemaps.get(assignment.target.slotId)!
  };
  const id = createMaterialAssignmentId(target);
  return {
    ...assignment,
    id,
    target
  };
}

function normalizeSelection(
  nodes: SceneSnapshot["nodes"],
  selection: SceneSnapshot["selection"]
): SceneSnapshot["selection"] {
  const nodeIds = selection.nodeIds.filter((nodeId) => Boolean(nodes[nodeId]));
  const nodeId = selection.nodeId && nodeIds.includes(selection.nodeId) ? selection.nodeId : nodeIds[0] ?? null;
  const objectIds: string[] = [];
  for (const selectedNodeId of nodeIds) {
    const node = nodes[selectedNodeId];
    if (node?.kind === "object") {
      objectIds.push(node.objectId);
    }
  }
  return {
    nodeId,
    nodeIds,
    objectId: objectIds.includes(selection.objectId ?? "") ? selection.objectId : objectIds[0] ?? null,
    objectIds
  };
}
