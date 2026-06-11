import type { MaterialAssignment } from "../materials/types";
import type { Problem } from "../problems/types";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import {
  createImportedMaterialSlotUnresolvedProblem,
  createImportedTargetUnresolvedProblem
} from "./problems";

export function deriveImportedRemapProblems(snapshot: SceneSnapshot): Problem[] {
  const problems: Problem[] = [];
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "imported" || node.remap?.status !== "unresolved") {
      continue;
    }
    const assetId = snapshot.objects[node.ownerObjectId]?.asset.id;
    problems.push(createImportedTargetUnresolvedProblem(node, assetId));
  }

  for (const assignment of Object.values(snapshot.materials.assignments)) {
    const problem = deriveUnresolvedSlotProblem(snapshot, assignment);
    if (problem) {
      problems.push(problem);
    }
  }

  return uniqueProblems(problems);
}

function deriveUnresolvedSlotProblem(snapshot: SceneSnapshot, assignment: MaterialAssignment): Problem | null {
  const target = assignment.target;
  if (target.kind !== "material-slot") {
    return null;
  }

  const node = Object.values(snapshot.nodes).find((candidate): candidate is SceneImportedGlbNode =>
    candidate.kind === "imported" &&
    candidate.ownerObjectId === target.objectId &&
    (
      getUnresolvedMaterialSlots(candidate).includes(target.slotId) ||
      (
        candidate.remap?.status === "unresolved" &&
        candidate.materialSlots?.some((slot) => slot.slotKey === target.slotId) === true
      )
    )
  );
  if (!node) {
    return null;
  }
  return createImportedMaterialSlotUnresolvedProblem(
    node,
    target.slotId,
    snapshot.objects[node.ownerObjectId]?.asset.id
  );
}

function getUnresolvedMaterialSlots(node: SceneImportedGlbNode): string[] {
  const value = node.remap?.metadata?.unresolvedMaterialSlots;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function uniqueProblems(problems: readonly Problem[]): Problem[] {
  const byId = new Map<string, Problem>();
  for (const problem of problems) {
    byId.set(problem.id, problem);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
