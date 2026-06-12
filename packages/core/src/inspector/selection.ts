import type { Problem } from "../problems/types";
import { deriveImportedRemapProblems } from "../runtime/remap-problems";
import { getSelectedNodeIds, getSelectedObjectIds } from "../selection/selection";
import type { SceneSnapshot } from "../snapshot/types";
import { buildEnvironmentSection } from "./environment";
import { buildLightSection } from "./lights";
import { buildMaterialSection } from "./material";
import { getSelectedNodeTarget } from "./node-targets";
import { buildProblemSection } from "./problems";
import { buildTransformSection } from "./transform";
import type { BuildInspectorModelOptions, InspectorModel, InspectorSelectionModel } from "./types";

export function getInspectorSelection(snapshot: SceneSnapshot): InspectorSelectionModel {
  const nodeId = snapshot.selection.nodeId;
  const nodeIds = getSelectedNodeIds(snapshot);
  const nodeTarget = getSelectedNodeTarget(snapshot);
  const node = nodeTarget.node;
  const objectId = snapshot.selection.objectId;
  const objectIds = getSelectedObjectIds(snapshot);
  return {
    nodeId,
    nodeIds,
    nodeKind: node?.kind ?? null,
    node,
    objectId,
    objectIds,
    lightId: node?.kind === "light" ? node.lightId : null,
    light: nodeTarget.light,
    count: nodeIds.length,
    object: objectId ? snapshot.objects[objectId] ?? null : null,
    transformAvailable: nodeTarget.transformAvailable,
    ...(nodeTarget.transformUnavailableReason ? { transformUnavailableReason: nodeTarget.transformUnavailableReason } : {})
  };
}

export function buildInspectorModel(snapshot: SceneSnapshot, options: BuildInspectorModelOptions = {}): InspectorModel {
  const runtimeProblems = mergeProblems(options.runtimeProblems ?? [], deriveImportedRemapProblems(snapshot));
  return {
    selection: getInspectorSelection(snapshot),
    transform: buildTransformSection(snapshot),
    material: buildMaterialSection(snapshot, runtimeProblems),
    environment: buildEnvironmentSection(snapshot),
    lights: buildLightSection(snapshot, options.activeLightId),
    problems: buildProblemSection(snapshot, runtimeProblems)
  };
}

function mergeProblems(
  left: readonly Problem[],
  right: readonly Problem[]
): Problem[] {
  const byId = new Map<string, Problem>();
  for (const problem of [...left, ...right]) {
    byId.set(problem.id, problem);
  }
  return [...byId.values()];
}
