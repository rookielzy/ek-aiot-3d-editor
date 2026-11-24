import { Vector3 } from "three";
import type { Editor } from "../editor/editor-api";
import { normalizeNodeSelection } from "../selection/selection";
import { createId, createTransform } from "../snapshot/defaults";
import { isDataDisplayAnchor } from "../snapshot/nodes";
import { getWorldNodeMatrix } from "../snapshot/transforms";
import type { DataDisplayStyle, SceneDataDisplayNode, SceneSnapshot } from "../snapshot/types";
import type { CreateDataDisplayCommand, SetDataDisplayAnchorCommand, UpdateDataDisplayStyleCommand } from "./types";

const defaultStyle: DataDisplayStyle = {
  width: 176,
  height: 60,
  backgroundColor: "#111827",
  borderColor: "#64748b",
  fontSize: 16,
  textColor: "#f8fafc"
};

export function applyCreateDataDisplay(snapshot: SceneSnapshot, command: CreateDataDisplayCommand): SceneSnapshot {
  let id = command.nodeId ?? createId("data-display");
  while (!command.nodeId && Object.hasOwn(snapshot.nodes, id)) id = createId("data-display");
  if (snapshot.nodes[id]) throw new Error(`Node ${id} already exists.`);
  if (!Object.hasOwn(snapshot.dataSources.connections, command.source.connectionId)) {
    throw new Error(`Connection ${command.source.connectionId} does not exist.`);
  }
  const node: SceneDataDisplayNode = {
    id,
    kind: "data-display",
    name: command.name,
    parentId: null,
    children: [],
    transform: createTransform({ position: command.position }),
    source: { connectionId: command.source.connectionId, deviceId: command.source.deviceId, fieldKey: command.source.fieldKey },
    style: defaultStyle
  };
  const next = { ...snapshot, nodes: { ...snapshot.nodes, [id]: node }, rootNodeIds: [...snapshot.rootNodeIds, id] };
  return { ...next, selection: normalizeNodeSelection(next, { mode: "replace", nodeId: id }) };
}

export function applyUpdateDataDisplayStyle(snapshot: SceneSnapshot, command: UpdateDataDisplayStyleCommand): SceneSnapshot {
  const node = snapshot.nodes[command.nodeId];
  if (node?.kind !== "data-display") throw new Error(`Data display ${command.nodeId} does not exist.`);
  if (Object.entries(command.style).every(([key, value]) => node.style[key as keyof DataDisplayStyle] === value)) return snapshot;
  return { ...snapshot, nodes: { ...snapshot.nodes, [node.id]: { ...node, style: { ...node.style, ...command.style } } } };
}

export function applySetDataDisplayAnchor(snapshot: SceneSnapshot, command: SetDataDisplayAnchorCommand): SceneSnapshot {
  const node = snapshot.nodes[command.nodeId];
  if (node?.kind !== "data-display") throw new Error(`Data display ${command.nodeId} does not exist.`);
  if (command.anchorNodeId === (node.anchorNodeId ?? null)) return snapshot;
  if (command.anchorNodeId !== null) {
    if (!isDataDisplayAnchor(snapshot.nodes[command.anchorNodeId])) throw new Error("Choose a model or group node.");
    const attached = { ...node, anchorNodeId: command.anchorNodeId, transform: createTransform() };
    return { ...snapshot, nodes: { ...snapshot.nodes, [node.id]: attached } };
  }

  const previousAnchor = node.anchorNodeId ? snapshot.nodes[node.anchorNodeId] : undefined;
  const position = command.worldPosition ?? (previousAnchor && isDataDisplayAnchor(previousAnchor)
    ? new Vector3(...node.transform.position).applyMatrix4(getWorldNodeMatrix(snapshot, previousAnchor.id)).toArray()
    : node.transform.position);
  const detached = { ...node, transform: createTransform({ position }) };
  delete detached.anchorNodeId;
  return { ...snapshot, nodes: { ...snapshot.nodes, [node.id]: detached } };
}

export function buildSetDataDisplayAnchorCommand(
  editor: Editor, node: SceneDataDisplayNode, anchorNodeId: string | null
): SetDataDisplayAnchorCommand {
  const anchor = anchorNodeId === null && node.anchorNodeId && isDataDisplayAnchor(editor.getSnapshot().nodes[node.anchorNodeId])
    ? editor.getRuntime()?.getNodeTarget(node.anchorNodeId) : undefined;
  return {
    type: "set-data-display-anchor",
    nodeId: node.id,
    anchorNodeId,
    ...(anchor ? { worldPosition: anchor.localToWorld(new Vector3(...node.transform.position)).toArray() } : {})
  };
}

export function getDataDisplayAnchorOptions(snapshot: SceneSnapshot): { value: string; label: string }[] {
  return Object.values(snapshot.nodes).filter(isDataDisplayAnchor).map((node) => {
    const path = [node.name];
    let parentId = node.parentId;
    while (parentId && snapshot.nodes[parentId]) {
      const parent = snapshot.nodes[parentId]!;
      path.unshift(parent.name);
      parentId = parent.parentId;
    }
    return { value: node.id, label: path.join(" / ") };
  });
}
