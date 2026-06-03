import { normalizeNodeSelection } from "../selection/selection";
import { cloneTransform, normalizeTransform } from "../snapshot/transforms";
import type { SceneNode, SceneSnapshot, Transform } from "../snapshot/types";

export function nodeSupportsTransform(snapshot: SceneSnapshot, node: SceneNode): boolean {
  if (node.kind === "object" || node.kind === "group") {
    return true;
  }

  const light = snapshot.lights[node.lightId];
  return light?.kind === "directional" || light?.kind === "point" || light?.kind === "spot";
}

export function setNodeTransformInSnapshot(
  snapshot: SceneSnapshot,
  nodeId: string,
  transform: Transform
): SceneSnapshot {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} does not exist.`);
  }
  if (!nodeSupportsTransform(snapshot, node)) {
    throw new Error(`Node ${nodeId} does not support transforms.`);
  }

  return syncPayloadsFromNodes({
    ...snapshot,
    nodes: {
      ...snapshot.nodes,
      [nodeId]: withTransform(node, transform)
    }
  });
}

export function normalizeNodeTransformPatch(node: SceneNode, transform: Partial<Transform>): Transform {
  if (!("transform" in node) || !node.transform) {
    throw new Error(`Node ${node.id} does not support transforms.`);
  }

  return cloneTransform(normalizeTransform({
    ...node.transform,
    ...transform
  }));
}

export function syncPayloadsFromNodes(snapshot: SceneSnapshot): SceneSnapshot {
  const objects = syncObjectsFromNodes(snapshot);
  const lights = syncLightsFromNodes(snapshot);

  return {
    ...snapshot,
    objects,
    rootObjectIds: collectRootObjectIds({ ...snapshot, objects, lights }),
    lights
  };
}

export function normalizeSelectionFromNodeIds(
  snapshot: SceneSnapshot,
  nodeIds: readonly string[],
  primaryNodeId: string | null
): SceneSnapshot["selection"] {
  return normalizeNodeSelection(snapshot, {
    mode: "replace",
    nodeIds,
    primaryNodeId: primaryNodeId && nodeIds.includes(primaryNodeId) ? primaryNodeId : nodeIds[0] ?? null
  });
}

function syncObjectsFromNodes(snapshot: SceneSnapshot): SceneSnapshot["objects"] {
  const objects: SceneSnapshot["objects"] = {};

  for (const [objectId, object] of Object.entries(snapshot.objects)) {
    objects[objectId] = {
      ...object,
      parentId: null,
      children: [],
      transform: cloneTransform(object.transform)
    };
  }

  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "object") {
      continue;
    }

    const object = objects[node.objectId];
    if (!object) {
      continue;
    }

    const parent = node.parentId ? snapshot.nodes[node.parentId] : undefined;
    objects[node.objectId] = {
      ...object,
      name: node.name,
      parentId: parent?.kind === "object" ? parent.objectId : null,
      transform: cloneTransform(node.transform),
      ...(node.metadata ? { metadata: { ...node.metadata } } : {})
    };
  }

  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "object") {
      continue;
    }
    const object = objects[node.objectId];
    if (!object) {
      continue;
    }

    const objectChildren = node.children
      .map((childId) => snapshot.nodes[childId])
      .filter((child): child is SceneNode & { kind: "object" } => child?.kind === "object")
      .map((child) => child.objectId)
      .filter((childObjectId) => Boolean(objects[childObjectId]));

    objects[node.objectId] = {
      ...object,
      children: objectChildren
    };
  }

  return objects;
}

function syncLightsFromNodes(snapshot: SceneSnapshot): SceneSnapshot["lights"] {
  const lights: SceneSnapshot["lights"] = { ...snapshot.lights };

  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind !== "light") {
      continue;
    }

    const light = lights[node.lightId];
    if (!light) {
      continue;
    }

    if (light.kind === "directional" || light.kind === "point" || light.kind === "spot") {
      lights[node.lightId] = {
        ...light,
        name: node.name,
        transform: cloneTransform(node.transform ?? light.transform),
        ...(node.metadata ? { metadata: { ...node.metadata } } : {})
      };
    } else {
      const { transform: _transform, ...nonSpatialLight } = {
        ...light,
        name: node.name,
        ...(node.metadata ? { metadata: { ...node.metadata } } : {})
      };
      lights[node.lightId] = nonSpatialLight;
    }
  }

  return lights;
}

function collectRootObjectIds(snapshot: SceneSnapshot): string[] {
  const rootObjectIds: string[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);

    const node = snapshot.nodes[nodeId];
    if (!node) {
      return;
    }
    if (node.kind === "object" && snapshot.objects[node.objectId]?.parentId === null) {
      rootObjectIds.push(node.objectId);
    }
    for (const childId of node.children) {
      visit(childId);
    }
  };

  for (const nodeId of snapshot.rootNodeIds) {
    visit(nodeId);
  }
  for (const nodeId of Object.keys(snapshot.nodes)) {
    visit(nodeId);
  }

  return rootObjectIds;
}

function withTransform(node: SceneNode, transform: Transform): SceneNode {
  switch (node.kind) {
    case "object":
    case "group":
      return {
        ...node,
        transform: cloneTransform(transform)
      };
    case "light":
      return {
        ...node,
        transform: cloneTransform(transform)
      };
    default:
      return assertNever(node);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported node: ${JSON.stringify(value)}`);
}
