import type { Mesh, Object3D } from "three";
import type { MaterialAssignmentTarget } from "../materials/types";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import type { ImportedGlbMaterialSlotDescriptor } from "../imported-targets/types";
import type { RuntimeNodeTarget } from "./three-object-map";

export type MaterialSlotResolution =
  | MaterialSlotResolved
  | MaterialSlotUnresolved
  | MaterialSlotNonProjectable;

export interface MaterialSlotResolved {
  status: "resolved";
  ownerObjectId: string;
  node: SceneImportedGlbNode;
  slot: ImportedGlbMaterialSlotDescriptor;
  runtimeObject: Object3D;
  mesh: Mesh;
  materialIndex?: number;
}

export interface MaterialSlotUnresolved {
  status: "unresolved";
  ownerObjectId: string;
  slotId: string;
  node?: SceneImportedGlbNode;
  reason: "slot-missing" | "runtime-target-missing";
}

export interface MaterialSlotNonProjectable {
  status: "non-projectable";
  ownerObjectId: string;
  node: SceneImportedGlbNode;
  slot: ImportedGlbMaterialSlotDescriptor;
  runtimeObject?: Object3D;
  reason: "target-missing" | "target-ambiguous" | "target-not-mesh" | "material-index-missing";
}

export function resolveMaterialSlotTarget(
  snapshot: SceneSnapshot,
  target: MaterialAssignmentTarget,
  runtimeTargets: Iterable<RuntimeNodeTarget>
): MaterialSlotResolution {
  if (target.kind !== "material-slot") {
    throw new Error(`Material target ${target.kind} is not a material slot.`);
  }

  const slotNode = findSlotNode(snapshot, target.objectId, target.slotId);
  if (!slotNode) {
    const unresolvedNode = findUnresolvedSlotNode(snapshot, target.objectId, target.slotId);
    return {
      status: "unresolved",
      ownerObjectId: target.objectId,
      slotId: target.slotId,
      ...(unresolvedNode ? { node: unresolvedNode } : {}),
      reason: "slot-missing"
    };
  }

  const runtimeTarget = [...runtimeTargets].find((entry) =>
    entry.kind === "imported" &&
    entry.ownerObjectId === target.objectId &&
    entry.nodeId === slotNode.node.id
  );
  if (!runtimeTarget) {
    return {
      status: "unresolved",
      ownerObjectId: target.objectId,
      slotId: target.slotId,
      node: slotNode.node,
      reason: "runtime-target-missing"
    };
  }
  if (runtimeTarget.matchStatus === "ambiguous") {
    return {
      status: "non-projectable",
      ownerObjectId: target.objectId,
      node: slotNode.node,
      slot: slotNode.slot,
      runtimeObject: runtimeTarget.object,
      reason: "target-ambiguous"
    };
  }
  if (runtimeTarget.matchStatus === "missing") {
    return {
      status: "non-projectable",
      ownerObjectId: target.objectId,
      node: slotNode.node,
      slot: slotNode.slot,
      reason: "target-missing"
    };
  }

  const mesh = findMeshProjectionTarget(runtimeTarget.object);
  if (!mesh) {
    return {
      status: "non-projectable",
      ownerObjectId: target.objectId,
      node: slotNode.node,
      slot: slotNode.slot,
      runtimeObject: runtimeTarget.object,
      reason: "target-not-mesh"
    };
  }

  const materialIndex = resolveMaterialArrayIndex(mesh, slotNode.slot);
  if (Array.isArray(mesh.material) && materialIndex === undefined) {
    return {
      status: "non-projectable",
      ownerObjectId: target.objectId,
      node: slotNode.node,
      slot: slotNode.slot,
      runtimeObject: runtimeTarget.object,
      reason: "material-index-missing"
    };
  }

  return {
    status: "resolved",
    ownerObjectId: target.objectId,
    node: slotNode.node,
    slot: slotNode.slot,
    runtimeObject: runtimeTarget.object,
    mesh,
    ...(materialIndex !== undefined ? { materialIndex } : {})
  };
}

function findSlotNode(
  snapshot: SceneSnapshot,
  ownerObjectId: string,
  slotId: string
): { node: SceneImportedGlbNode; slot: ImportedGlbMaterialSlotDescriptor } | null {
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "imported" || node.ownerObjectId !== ownerObjectId) {
      continue;
    }
    const slot = node.materialSlots?.find((candidate) => candidate.slotKey === slotId);
    if (slot) {
      return { node, slot };
    }
  }
  return null;
}

function findUnresolvedSlotNode(
  snapshot: SceneSnapshot,
  ownerObjectId: string,
  slotId: string
): SceneImportedGlbNode | undefined {
  return Object.values(snapshot.nodes).find((node): node is SceneImportedGlbNode =>
    node.kind === "imported" &&
    node.ownerObjectId === ownerObjectId &&
    unresolvedMaterialSlots(node).includes(slotId)
  );
}

function unresolvedMaterialSlots(node: SceneImportedGlbNode): string[] {
  const value = node.remap?.metadata?.unresolvedMaterialSlots;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function findMeshProjectionTarget(object: Object3D): Mesh | null {
  if (isMeshWithMaterial(object)) {
    return object;
  }

  let mesh: Mesh | null = null;
  object.traverse((entry) => {
    if (!mesh && isMeshWithMaterial(entry)) {
      mesh = entry;
    }
  });
  return mesh;
}

function resolveMaterialArrayIndex(mesh: Mesh, slot: ImportedGlbMaterialSlotDescriptor): number | undefined {
  if (!Array.isArray(mesh.material)) {
    return undefined;
  }
  if (isMaterialArrayIndex(mesh, slot.source.primitiveIndex)) {
    return slot.source.primitiveIndex;
  }
  if (isMaterialArrayIndex(mesh, slot.source.materialIndex)) {
    return slot.source.materialIndex;
  }
  return undefined;
}

function isMaterialArrayIndex(mesh: Mesh, index: number | undefined): index is number {
  return index !== undefined && Array.isArray(mesh.material) && index >= 0 && index < mesh.material.length;
}

function isMeshWithMaterial(object: Object3D): object is Mesh {
  return Boolean((object as Mesh).isMesh && "material" in object);
}
