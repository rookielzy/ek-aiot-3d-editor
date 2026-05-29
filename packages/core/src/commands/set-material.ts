import { createMaterialAssignmentId, createMaterialDefinition } from "../materials/defaults";
import type { MaterialAssignmentTarget, MeshStandardMaterialOverride } from "../materials/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { SetMaterialCommand } from "./types";

export function applySetMaterial(snapshot: SceneSnapshot, command: SetMaterialCommand): SceneSnapshot {
  assertMaterialTargetExists(snapshot, command.target);

  const assignmentId = command.assignmentId ?? createMaterialAssignmentId(command.target);
  const existingAssignment = snapshot.materials.assignments[assignmentId];
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

function assertMaterialTargetExists(snapshot: SceneSnapshot, target: MaterialAssignmentTarget): void {
  if (!snapshot.objects[target.objectId]) {
    throw new Error(`Material target object ${target.objectId} does not exist.`);
  }
}

function mergeMaterialOverride(
  current: MeshStandardMaterialOverride,
  patch: Partial<MeshStandardMaterialOverride>
): MeshStandardMaterialOverride {
  return {
    ...current,
    ...patch,
    textures: patch.textures
      ? {
          ...current.textures,
          ...patch.textures
        }
      : current.textures ?? {}
  };
}
