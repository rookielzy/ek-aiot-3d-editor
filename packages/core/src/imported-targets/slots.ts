import type { MaterialAssignmentTarget } from "../materials/types";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import type { ImportedGlbMaterialSlotDescriptor, ImportedGlbTargetBindingDescriptor } from "./types";

export interface ImportedGlbMaterialSlotLookup {
  ownerObjectId: string;
  nodeId: string;
  importKey: string;
  slot: ImportedGlbMaterialSlotDescriptor;
  label: string;
}

export function findImportedGlbMaterialSlot(
  snapshot: SceneSnapshot,
  ownerObjectId: string,
  slotKey: string
): ImportedGlbMaterialSlotLookup | null {
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "imported" || node.ownerObjectId !== ownerObjectId) {
      continue;
    }
    const slot = node.materialSlots?.find((candidate) => candidate.slotKey === slotKey);
    if (!slot) {
      continue;
    }
    return {
      ownerObjectId,
      nodeId: node.id,
      importKey: node.importKey,
      slot,
      label: slot.label
    };
  }
  return null;
}

export function collectImportedGlbMaterialSlotTargets(snapshot: SceneSnapshot, nodeIds: ReadonlySet<string>): Set<string> {
  const slotTargets = new Set<string>();
  const removedOwnerIds = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = snapshot.nodes[nodeId];
    if (node?.kind === "object") {
      removedOwnerIds.add(node.objectId);
    }
  }
  for (const nodeId of nodeIds) {
    const node = snapshot.nodes[nodeId];
    if (node?.kind !== "imported") {
      continue;
    }
    if (removedOwnerIds.has(node.ownerObjectId)) {
      continue;
    }
    for (const slot of node.materialSlots ?? []) {
      slotTargets.add(createImportedGlbMaterialSlotTargetKey(node.ownerObjectId, slot.slotKey));
    }
  }
  return slotTargets;
}

export function createImportedGlbMaterialSlotTargetKey(ownerObjectId: string, slotKey: string): string {
  return `${ownerObjectId}\0${slotKey}`;
}

export function isImportedGlbMaterialAssignmentTarget(
  snapshot: SceneSnapshot,
  target: MaterialAssignmentTarget
): boolean {
  return target.kind === "material-slot" &&
    Boolean(findImportedGlbMaterialSlot(snapshot, target.objectId, target.slotId));
}

export function createImportedGlbBindingDescriptor(
  node: SceneImportedGlbNode,
  slotKey?: string
): ImportedGlbTargetBindingDescriptor {
  return {
    nodeId: node.id,
    ownerObjectId: node.ownerObjectId,
    importKey: node.importKey,
    ...(slotKey ? { slotKey } : {})
  };
}
