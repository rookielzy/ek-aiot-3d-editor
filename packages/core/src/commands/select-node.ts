import type { SceneSnapshot } from "../snapshot/types";
import { normalizeNodeSelection, selectionEquals } from "../selection/selection";
import type { SelectNodeCommand, SelectNodesCommand } from "./types";

export function applySelectNode(snapshot: SceneSnapshot, command: SelectNodeCommand): SceneSnapshot {
  const selection = normalizeNodeSelection(snapshot, { mode: "replace", nodeId: command.nodeId });
  if (selectionEquals(snapshot.selection, selection)) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection
  };
}

export function applySelectNodes(snapshot: SceneSnapshot, command: SelectNodesCommand): SceneSnapshot {
  const selection = normalizeNodeSelection(snapshot, command);
  if (selectionEquals(snapshot.selection, selection)) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection
  };
}
