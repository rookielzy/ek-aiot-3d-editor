import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import { buildEnvironmentSection } from "./environment";
import { buildLightSection } from "./lights";
import { buildMaterialSection } from "./material";
import { buildProblemSection } from "./problems";
import { buildTransformSection } from "./transform";
import type { BuildInspectorModelOptions, InspectorModel, InspectorSelectionModel } from "./types";

export function getInspectorSelection(snapshot: SceneSnapshot): InspectorSelectionModel {
  const objectId = snapshot.selection.objectId;
  return {
    objectId,
    object: objectId ? snapshot.objects[objectId] ?? null : null
  };
}

export function buildInspectorModel(snapshot: SceneSnapshot, options: BuildInspectorModelOptions = {}): InspectorModel {
  const runtimeProblems: readonly Problem[] = options.runtimeProblems ?? [];
  return {
    selection: getInspectorSelection(snapshot),
    transform: buildTransformSection(snapshot),
    material: buildMaterialSection(snapshot),
    environment: buildEnvironmentSection(snapshot),
    lights: buildLightSection(snapshot, options.activeLightId),
    problems: buildProblemSection(snapshot, runtimeProblems)
  };
}
