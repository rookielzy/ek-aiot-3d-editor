import { findObjectNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import { applyReparentNode } from "./reparent-node";
import type { ReparentObjectCommand } from "./types";

export function applyReparentObject(snapshot: SceneSnapshot, command: ReparentObjectCommand): SceneSnapshot {
  if (!snapshot.objects[command.objectId]) {
    throw new Error(`Object ${command.objectId} does not exist.`);
  }
  if (command.parentId && !snapshot.objects[command.parentId]) {
    throw new Error(`Parent object ${command.parentId} does not exist.`);
  }

  const nodeId = findObjectNodeId(snapshot, command.objectId);
  const parentNodeId = command.parentId ? findObjectNodeId(snapshot, command.parentId) : null;
  if (!nodeId) {
    throw new Error(`Object ${command.objectId} does not have a scene node.`);
  }
  if (command.parentId && !parentNodeId) {
    throw new Error(`Parent object ${command.parentId} does not have a scene node.`);
  }

  return applyReparentNode(snapshot, {
    type: "reparent-node",
    nodeId,
    parentId: parentNodeId,
    ...(command.transform ? { transform: command.transform } : {})
  });
}
