import { transformEquals } from "../snapshot/transforms";
import type { SceneSnapshot } from "../snapshot/types";
import { normalizeNodeTransformPatch, setNodeTransformInSnapshot } from "./node-state";
import type { SetNodeTransformCommand } from "./types";

export function applySetNodeTransform(snapshot: SceneSnapshot, command: SetNodeTransformCommand): SceneSnapshot {
  const node = snapshot.nodes[command.nodeId];
  if (!node) {
    throw new Error(`Node ${command.nodeId} does not exist.`);
  }

  const nextTransform = normalizeNodeTransformPatch(node, command.transform);
  if (node.transform && transformEquals(node.transform, nextTransform)) {
    return snapshot;
  }

  return setNodeTransformInSnapshot(snapshot, command.nodeId, nextTransform);
}
