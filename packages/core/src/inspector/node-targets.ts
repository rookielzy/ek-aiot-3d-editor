import type { LightDefinition } from "../lights/types";
import { createTransform } from "../snapshot/defaults";
import type { SceneNode, SceneSnapshot, Transform } from "../snapshot/types";

export interface SelectedNodeTarget {
  node: SceneNode | null;
  light: LightDefinition | null;
  transform: Transform | null;
  transformAvailable: boolean;
  transformUnavailableReason?: string;
}

export function getSelectedNodeTarget(snapshot: SceneSnapshot): SelectedNodeTarget {
  const node = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] ?? null : null;
  if (!node) {
    return {
      node: null,
      light: null,
      transform: null,
      transformAvailable: false,
      transformUnavailableReason: "Select a transformable node to edit transform."
    };
  }

  const transform = node.kind === "imported"
    ? node.transform ?? createTransform()
    : "transform" in node ? node.transform ?? null : null;
  if (transform) {
    return {
      node,
      light: node.kind === "light" ? snapshot.lights[node.lightId] ?? null : null,
      transform,
      transformAvailable: true
    };
  }

  const light = node.kind === "light" ? snapshot.lights[node.lightId] ?? null : null;
  return {
    node,
    light,
    transform: null,
    transformAvailable: false,
    transformUnavailableReason: light ? `${formatLightKind(light.kind)} lights do not have transform controls.` : "Selected node cannot be transformed."
  };
}

function formatLightKind(kind: LightDefinition["kind"]): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
