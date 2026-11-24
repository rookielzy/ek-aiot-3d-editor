import { isPlainRecord } from "./json";
import type { SceneImportedGlbNode, SceneNode, SceneObjectNode } from "./types";

export const NODE_MOTION_AXES = ["x", "y", "z"] as const;

export type NodeMotionAxis = (typeof NODE_MOTION_AXES)[number];

export interface NodeMotion {
  kind: "continuous-spin";
  axis: NodeMotionAxis;
  degreesPerSecond: number;
}

export const DEFAULT_NODE_MOTION: Readonly<NodeMotion> = Object.freeze({
  kind: "continuous-spin",
  axis: "y",
  degreesPerSecond: 90
});

export function supportsNodeMotion(node: SceneNode | undefined): node is SceneObjectNode | SceneImportedGlbNode {
  return node?.kind === "object" || (node?.kind === "imported" &&
    (node.source?.kind === "node" || node.source?.kind === "mesh" || node.source?.kind === "camera"));
}

export function isNodeMotionAxis(value: unknown): value is NodeMotionAxis {
  return NODE_MOTION_AXES.some((axis) => axis === value);
}

export function isNodeMotionSpeed(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function isNodeMotion(value: unknown): value is NodeMotion {
  return isPlainRecord(value) && value.kind === "continuous-spin" &&
    isNodeMotionAxis(value.axis) && isNodeMotionSpeed(value.degreesPerSecond) &&
    Object.keys(value).length === 3;
}
