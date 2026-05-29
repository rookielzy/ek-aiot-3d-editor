import { createId } from "../snapshot/defaults";
import type { MaterialAssignmentTarget, MaterialDefinition, MaterialState, MeshStandardMaterialOverride } from "./types";

export function createEmptyMaterialState(): MaterialState {
  return {
    definitions: {},
    assignments: {}
  };
}

export function createMaterialDefinition(
  override: MeshStandardMaterialOverride,
  options: { id?: string; name?: string } = {}
): MaterialDefinition {
  return {
    id: options.id ?? createId("material"),
    name: options.name ?? "Material",
    kind: "mesh-standard",
    override
  };
}

export function createMaterialAssignmentId(target: MaterialAssignmentTarget): string {
  return target.kind === "object"
    ? `object:${target.objectId}`
    : `material-slot:${target.objectId}:${target.slotId}`;
}
