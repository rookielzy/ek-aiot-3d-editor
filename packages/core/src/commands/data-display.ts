import { normalizeNodeSelection } from "../selection/selection";
import { createId, createTransform } from "../snapshot/defaults";
import type { DataDisplayStyle, SceneDataDisplayNode, SceneSnapshot } from "../snapshot/types";
import type { CreateDataDisplayCommand, UpdateDataDisplayStyleCommand } from "./types";

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
