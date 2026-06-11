import { findImportedGlbMaterialSlot } from "../imported-targets/slots";
import { createMaterialAssignmentId, createMaterialDefinition } from "../materials/defaults";
import type { MaterialAssignmentTarget, MaterialPatch, MaterialTexturePatch, MeshStandardMaterialOverride, TextureSlot, TextureSlotName } from "../materials/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { SetMaterialCommand } from "./types";

export function applySetMaterial(snapshot: SceneSnapshot, command: SetMaterialCommand): SceneSnapshot {
  const expectedAssignmentId = createMaterialAssignmentId(command.target);
  if (command.assignmentId && command.assignmentId !== expectedAssignmentId) {
    throw new Error(`Material assignment ${command.assignmentId} does not match target ${expectedAssignmentId}.`);
  }

  const assignmentId = expectedAssignmentId;
  const existingAssignment = snapshot.materials.assignments[assignmentId];
  assertMaterialTargetExists(snapshot, command.target, Boolean(existingAssignment));
  if (existingAssignment && !sameTarget(existingAssignment.target, command.target)) {
    throw new Error(`Material assignment ${assignmentId} target cannot be changed.`);
  }
  const materialId = command.materialId ?? existingAssignment?.materialId ?? `material:${assignmentId}`;
  const existingMaterial = snapshot.materials.definitions[materialId];
  const override = mergeMaterialOverride(existingMaterial?.override ?? {}, command.material);
  const material = existingMaterial
    ? {
        ...existingMaterial,
        name: command.materialName ?? existingMaterial.name,
        override
      }
    : createMaterialDefinition(override, { id: materialId, name: command.materialName });

  return {
    ...snapshot,
    materials: {
      definitions: {
        ...snapshot.materials.definitions,
        [material.id]: material
      },
      assignments: {
        ...snapshot.materials.assignments,
        [assignmentId]: {
          id: assignmentId,
          materialId: material.id,
          target: command.target
        }
      }
    }
  };
}

function assertMaterialTargetExists(
  snapshot: SceneSnapshot,
  target: MaterialAssignmentTarget,
  allowStaleSlot: boolean
): void {
  if (!snapshot.objects[target.objectId]) {
    throw new Error(`Material target object ${target.objectId} does not exist.`);
  }
  if (
    target.kind === "material-slot" &&
    !allowStaleSlot &&
    !findImportedGlbMaterialSlot(snapshot, target.objectId, target.slotId)
  ) {
    throw new Error(`Material target slot ${target.slotId} does not exist on object ${target.objectId}.`);
  }
}

function sameTarget(left: MaterialAssignmentTarget, right: MaterialAssignmentTarget): boolean {
  if (left.kind !== right.kind || left.objectId !== right.objectId) {
    return false;
  }
  return left.kind === "object" || left.slotId === (right as typeof left).slotId;
}

function mergeMaterialOverride(
  current: MeshStandardMaterialOverride,
  patch: MaterialPatch
): MeshStandardMaterialOverride {
  const { textures, ...rest } = patch;
  return {
    ...current,
    ...rest,
    textures: textures ? mergeTextureSlots(current.textures, textures) : current.textures ?? {}
  };
}

function mergeTextureSlots(
  current: Partial<Record<TextureSlotName, TextureSlot>> | undefined,
  patch: MaterialTexturePatch
): Partial<Record<TextureSlotName, TextureSlot>> {
  const next = { ...(current ?? {}) };
  for (const [slotName, slot] of Object.entries(patch) as [TextureSlotName, TextureSlot | null][]) {
    if (slot === null) {
      delete next[slotName];
    } else {
      next[slotName] = slot;
    }
  }
  return next;
}
