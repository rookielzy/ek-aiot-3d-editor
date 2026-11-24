import { supportsNodeMotion } from "../snapshot/node-motion";
import type { SceneSnapshot } from "../snapshot/types";
import type { SetNodeMotionCommand } from "./types";

export function applySetNodeMotion(snapshot: SceneSnapshot, command: SetNodeMotionCommand): SceneSnapshot {
  const node = snapshot.nodes[command.nodeId];
  if (!supportsNodeMotion(node)) {
    throw new Error(`Node ${command.nodeId} does not support motion.`);
  }
  if (command.motion === null) {
    if (!node.motion) return snapshot;
    const next = { ...node };
    delete next.motion;
    return { ...snapshot, nodes: { ...snapshot.nodes, [node.id]: next } };
  }
  if (node.motion && node.motion.kind === command.motion.kind && node.motion.axis === command.motion.axis &&
    node.motion.degreesPerSecond === command.motion.degreesPerSecond) {
    return snapshot;
  }
  return { ...snapshot, nodes: { ...snapshot.nodes, [node.id]: { ...node, motion: command.motion } } };
}
