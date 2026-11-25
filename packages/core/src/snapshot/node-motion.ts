import { isPlainRecord } from "./json";
import type { SceneImportedGlbNode, SceneNode, SceneObjectNode } from "./types";

export const NODE_MOTION_AXES = ["x", "y", "z"] as const;

export type NodeMotionAxis = (typeof NODE_MOTION_AXES)[number];

export const NODE_MOTION_KINDS = ["continuous-spin", "ping-pong-translation"] as const;

export type NodeMotionKind = (typeof NODE_MOTION_KINDS)[number];

export interface ContinuousSpinMotion {
  kind: "continuous-spin";
  axis: NodeMotionAxis;
  degreesPerSecond: number;
}

export interface PingPongTranslationMotion {
  kind: "ping-pong-translation";
  axis: NodeMotionAxis;
  distance: number;
  durationSeconds: number;
}

export type NodeMotion = ContinuousSpinMotion | PingPongTranslationMotion;

export const DEFAULT_CONTINUOUS_SPIN_MOTION: Readonly<ContinuousSpinMotion> = Object.freeze({
  kind: "continuous-spin",
  axis: "y",
  degreesPerSecond: 90
});

export const DEFAULT_PING_PONG_TRANSLATION_MOTION: Readonly<PingPongTranslationMotion> = Object.freeze({
  kind: "ping-pong-translation",
  axis: "x",
  distance: 1,
  durationSeconds: 2
});

export const DEFAULT_NODE_MOTION: Readonly<NodeMotion> = DEFAULT_CONTINUOUS_SPIN_MOTION;

export function createDefaultNodeMotion(kind: NodeMotionKind): NodeMotion {
  return kind === "ping-pong-translation"
    ? { ...DEFAULT_PING_PONG_TRANSLATION_MOTION }
    : { ...DEFAULT_CONTINUOUS_SPIN_MOTION };
}

export function supportsNodeMotion(node: SceneNode | undefined): node is SceneObjectNode | SceneImportedGlbNode {
  return node?.kind === "object" || (node?.kind === "imported" &&
    (node.source?.kind === "node" || node.source?.kind === "mesh" || node.source?.kind === "camera"));
}

export function isNodeMotionKind(value: unknown): value is NodeMotionKind {
  return NODE_MOTION_KINDS.some((kind) => kind === value);
}

export function isNodeMotionAxis(value: unknown): value is NodeMotionAxis {
  return NODE_MOTION_AXES.some((axis) => axis === value);
}

export function isNodeMotionSpeed(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function isNodeMotionDistance(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

export function isNodeMotionDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isNodeMotion(value: unknown): value is NodeMotion {
  if (!isPlainRecord(value) || !isNodeMotionAxis(value.axis)) return false;
  if (value.kind === "continuous-spin") {
    return isNodeMotionSpeed(value.degreesPerSecond) && Object.keys(value).length === 3;
  }
  if (value.kind === "ping-pong-translation") {
    return isNodeMotionDistance(value.distance) && isNodeMotionDuration(value.durationSeconds) && Object.keys(value).length === 4;
  }
  return false;
}

export function areNodeMotionsEqual(left: NodeMotion | undefined, right: NodeMotion | undefined): boolean {
  if (!left || !right || left.kind !== right.kind || left.axis !== right.axis) return false;
  return left.kind === "continuous-spin"
    ? right.kind === "continuous-spin" && left.degreesPerSecond === right.degreesPerSecond
    : right.kind === "ping-pong-translation" && left.distance === right.distance && left.durationSeconds === right.durationSeconds;
}
