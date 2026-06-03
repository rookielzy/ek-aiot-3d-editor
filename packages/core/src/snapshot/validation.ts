import { validateSceneEnvironment } from "../environment/validation";
import { validateLights } from "../lights/validation";
import { validateMaterialState } from "../materials/validation";
import { validateAuthoredProblemState } from "../problems/validation";
import { isJsonCompatible as isJsonValueCompatible, isPlainRecord, type JsonValue } from "./json";
import { isSupportedAssetKind, isVector } from "./primitives";
import { SNAPSHOT_VERSION, type AssetReference, type SceneNode, type SceneObject, type SceneSnapshot } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateSceneSnapshot(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainRecord(value)) {
    return { ok: false, errors: ["Snapshot must be a plain object."] };
  }

  if (value.version !== SNAPSHOT_VERSION) {
    errors.push(`Unsupported snapshot version: ${String(value.version)}.`);
  }

  if (!isPlainRecord(value.scene) || typeof value.scene.id !== "string" || typeof value.scene.name !== "string") {
    errors.push("Snapshot scene must include string id and name.");
  }

  if (!isPlainRecord(value.objects)) {
    errors.push("Snapshot objects must be a plain object map.");
  } else {
    for (const [id, object] of Object.entries(value.objects)) {
      validateObject(id, object, errors);
    }
  }

  if (!isPlainRecord(value.nodes)) {
    errors.push("Snapshot nodes must be a plain object map.");
  } else {
    for (const [id, node] of Object.entries(value.nodes)) {
      validateNode(id, node, value.objects, value.lights, errors);
    }
  }

  if (!Array.isArray(value.rootNodeIds) || value.rootNodeIds.some((id) => typeof id !== "string")) {
    errors.push("Snapshot rootNodeIds must be an array of node IDs.");
  } else if (isPlainRecord(value.nodes)) {
    validateUniqueIds(value.rootNodeIds, "Root node", errors);
    for (const rootNodeId of value.rootNodeIds) {
      if (!value.nodes[rootNodeId]) {
        errors.push(`Root node ${rootNodeId} must exist in nodes.`);
      }
    }
  }

  if (!Array.isArray(value.rootObjectIds) || value.rootObjectIds.some((id) => typeof id !== "string")) {
    errors.push("Snapshot rootObjectIds must be an array of object IDs.");
  } else if (isPlainRecord(value.objects)) {
    for (const rootObjectId of value.rootObjectIds) {
      if (!value.objects[rootObjectId]) {
        errors.push(`Root object ${rootObjectId} must exist in objects.`);
      }
    }
  }

  validateNodeGraph(value.nodes, value.rootNodeIds, errors);
  validateSelection(value.selection, value.nodes, value.objects, errors);

  if (!isPlainRecord(value.assets)) {
    errors.push("Snapshot assets must be a plain object map.");
  } else {
    for (const [id, asset] of Object.entries(value.assets)) {
      validateAsset(id, asset, errors);
    }
  }

  const objectIds = isPlainRecord(value.objects) ? new Set(Object.keys(value.objects)) : new Set<string>();
  const assets = isPlainRecord(value.assets) ? value.assets as Record<string, AssetReference> : {};
  validateObjectReferences(value.objects, assets, errors);
  validatePayloadCoverage(value.nodes, value.objects, value.lights, errors);
  validateMaterialState(value.materials, { objectIds, assets }, errors);
  validateSceneEnvironment(value.environment, assets, errors);
  validateLights(value.lights, errors);
  validateAuthoredProblemState(value.problems, errors);

  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push("Snapshot metadata must be JSON-compatible.");
  }

  if (!isJsonCompatible(value)) {
    errors.push("Snapshot must be JSON-compatible and must not contain runtime objects.");
  }

  return { ok: errors.length === 0, errors };
}

function validateSelection(selection: unknown, nodes: unknown, objects: unknown, errors: string[]): void {
  if (
    !isPlainRecord(selection) ||
    !(typeof selection.nodeId === "string" || selection.nodeId === null) ||
    !(typeof selection.objectId === "string" || selection.objectId === null)
  ) {
    errors.push("Snapshot selection must include nodeId and objectId strings or null.");
    return;
  }

  if (!Array.isArray(selection.nodeIds) || selection.nodeIds.some((id) => typeof id !== "string")) {
    errors.push("Snapshot selection nodeIds must be an array of node IDs.");
    return;
  }
  if (!Array.isArray(selection.objectIds) || selection.objectIds.some((id) => typeof id !== "string")) {
    errors.push("Snapshot selection objectIds must be an array of object IDs.");
    return;
  }

  const nodeIds = new Set<string>();
  for (const nodeId of selection.nodeIds) {
    if (nodeIds.has(nodeId)) {
      errors.push(`Selected node ${nodeId} must not be duplicated.`);
    }
    nodeIds.add(nodeId);
  }

  if (selection.nodeId !== null && !nodeIds.has(selection.nodeId)) {
    errors.push(`Primary selected node ${selection.nodeId} must be included in selection nodeIds.`);
  }

  const objectIds = new Set<string>();
  for (const objectId of selection.objectIds) {
    if (objectIds.has(objectId)) {
      errors.push(`Selected object ${objectId} must not be duplicated.`);
    }
    objectIds.add(objectId);
  }

  if (selection.objectId !== null && !objectIds.has(selection.objectId)) {
    errors.push(`Primary selected object ${selection.objectId} must be included in selection objectIds.`);
  }

  if (isPlainRecord(nodes)) {
    if (selection.nodeId !== null && !nodes[selection.nodeId]) {
      errors.push(`Selected node ${selection.nodeId} must exist in nodes.`);
    }

    for (const nodeId of nodeIds) {
      if (!nodes[nodeId]) {
        errors.push(`Selected node ${nodeId} must exist in nodes.`);
      }
    }
    validateObjectSelectionMirror(selection, nodes, errors);
  }

  if (!isPlainRecord(objects)) {
    return;
  }

  if (selection.objectId !== null && !objects[selection.objectId]) {
    errors.push(`Selected object ${selection.objectId} must exist in objects.`);
  }

  for (const objectId of objectIds) {
    if (!objects[objectId]) {
      errors.push(`Selected object ${objectId} must exist in objects.`);
    }
  }
}

function validateObjectSelectionMirror(
  selection: Record<string, unknown>,
  nodes: Record<string, unknown>,
  errors: string[]
): void {
  const nodeIds = Array.isArray(selection.nodeIds) ? selection.nodeIds : [];
  const expectedObjectIds = nodeIds
    .map((nodeId) => getObjectIdForNode(nodes, nodeId))
    .filter((objectId): objectId is string => typeof objectId === "string");
  const expectedObjectId = getObjectIdForNode(nodes, selection.nodeId) ?? expectedObjectIds[0] ?? null;
  const objectIds = Array.isArray(selection.objectIds) ? selection.objectIds : [];

  if (selection.objectId !== expectedObjectId) {
    errors.push("Snapshot selection objectId must mirror the primary selected object node.");
  }
  if (
    objectIds.length !== expectedObjectIds.length ||
    objectIds.some((objectId, index) => objectId !== expectedObjectIds[index])
  ) {
    errors.push("Snapshot selection objectIds must mirror selected object nodes.");
  }
}

function getObjectIdForNode(nodes: Record<string, unknown>, nodeId: unknown): string | null {
  if (typeof nodeId !== "string") {
    return null;
  }

  const node = nodes[nodeId];
  if (!isPlainRecord(node) || node.kind !== "object" || typeof node.objectId !== "string") {
    return null;
  }

  return node.objectId;
}

export function assertValidSceneSnapshot(value: unknown): asserts value is SceneSnapshot {
  const result = validateSceneSnapshot(value);
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
}

export function isJsonCompatible(value: unknown, seen = new WeakSet<object>()): value is JsonValue {
  return isJsonValueCompatible(value, seen);
}

function validateAsset(id: string, asset: unknown, errors: string[]): void {
  if (!isPlainRecord(asset)) {
    errors.push(`Asset ${id} must be a plain object.`);
    return;
  }
  if (asset.id !== id) {
    errors.push(`Asset ${id} must use a matching id field.`);
  }
  if (!isSupportedAssetKind(asset.kind)) {
    errors.push(`Asset ${id} kind is unsupported.`);
  }
  if ("label" in asset && asset.label !== undefined && typeof asset.label !== "string") {
    errors.push(`Asset ${id} label must be a string.`);
  }
  if ("metadata" in asset && !isJsonCompatible(asset.metadata)) {
    errors.push(`Asset ${id} metadata must be JSON-compatible.`);
  }
}

function validateObject(id: string, object: unknown, errors: string[]): void {
  if (!isPlainRecord(object)) {
    errors.push(`Object ${id} must be a plain object.`);
    return;
  }

  const sceneObject = object as Partial<SceneObject>;

  if (sceneObject.id !== id) {
    errors.push(`Object ${id} must use a matching id field.`);
  }
  if (sceneObject.kind !== "glb") {
    errors.push(`Object ${id} must be a GLB-backed object.`);
  }
  if (typeof sceneObject.name !== "string") {
    errors.push(`Object ${id} must include a name.`);
  }
  if (!(typeof sceneObject.parentId === "string" || sceneObject.parentId === null)) {
    errors.push(`Object ${id} parentId must be string or null.`);
  }
  if (!Array.isArray(sceneObject.children) || sceneObject.children.some((childId) => typeof childId !== "string")) {
    errors.push(`Object ${id} children must be string IDs.`);
  }
  if (!isPlainRecord(sceneObject.asset) || typeof sceneObject.asset.id !== "string" || sceneObject.asset.kind !== "glb") {
    errors.push(`Object ${id} must include a GLB asset reference.`);
  }
  if (!isTransform(sceneObject.transform)) {
    errors.push(`Object ${id} transform must include position, rotation, and scale vectors.`);
  }
  if ("metadata" in object && !isJsonCompatible(object.metadata)) {
    errors.push(`Object ${id} metadata must be JSON-compatible.`);
  }
}

function validateNode(id: string, node: unknown, objects: unknown, lights: unknown, errors: string[]): void {
  if (!isPlainRecord(node)) {
    errors.push(`Node ${id} must be a plain object.`);
    return;
  }

  const sceneNode = node as Partial<SceneNode>;
  if (sceneNode.id !== id) {
    errors.push(`Node ${id} must use a matching id field.`);
  }
  if (sceneNode.kind !== "object" && sceneNode.kind !== "group" && sceneNode.kind !== "light") {
    errors.push(`Node ${id} kind is unsupported.`);
  }
  if (typeof sceneNode.name !== "string") {
    errors.push(`Node ${id} must include a name.`);
  }
  if (!(typeof sceneNode.parentId === "string" || sceneNode.parentId === null)) {
    errors.push(`Node ${id} parentId must be string or null.`);
  }
  if (!Array.isArray(sceneNode.children) || sceneNode.children.some((childId) => typeof childId !== "string")) {
    errors.push(`Node ${id} children must be string IDs.`);
  } else {
    validateUniqueIds(sceneNode.children, `Node ${id} child`, errors);
  }
  if ("metadata" in node && !isJsonCompatible(node.metadata)) {
    errors.push(`Node ${id} metadata must be JSON-compatible.`);
  }

  switch (sceneNode.kind) {
    case "object":
      if (typeof sceneNode.objectId !== "string") {
        errors.push(`Object node ${id} must reference an objectId.`);
      } else if (isPlainRecord(objects) && !objects[sceneNode.objectId]) {
        errors.push(`Object node ${id} object ${sceneNode.objectId} must exist in objects.`);
      }
      if (!isTransform(sceneNode.transform)) {
        errors.push(`Object node ${id} transform must include position, rotation, and scale vectors.`);
      }
      break;
    case "group":
      if (!isTransform(sceneNode.transform)) {
        errors.push(`Group node ${id} transform must include position, rotation, and scale vectors.`);
      }
      break;
    case "light":
      if (typeof sceneNode.lightId !== "string") {
        errors.push(`Light node ${id} must reference a lightId.`);
      } else if (isPlainRecord(lights) && !lights[sceneNode.lightId]) {
        errors.push(`Light node ${id} light ${sceneNode.lightId} must exist in lights.`);
      }
      validateLightNodeTransform(id, sceneNode, lights, errors);
      break;
  }
}

function validateLightNodeTransform(
  id: string,
  node: Partial<SceneNode>,
  lights: unknown,
  errors: string[]
): void {
  if (node.kind !== "light") {
    return;
  }

  if ("transform" in node && node.transform !== undefined && !isTransform(node.transform)) {
    errors.push(`Light node ${id} transform must include position, rotation, and scale vectors.`);
    return;
  }

  const light = typeof node.lightId === "string" && isPlainRecord(lights) ? lights[node.lightId] : undefined;
  if (!isPlainRecord(light)) {
    return;
  }

  switch (light.kind) {
    case "directional":
    case "point":
    case "spot":
      if (!isTransform(node.transform)) {
        errors.push(`Light node ${id} transform must include position, rotation, and scale vectors.`);
      }
      break;
    case "ambient":
    case "hemisphere":
      if ("transform" in node && node.transform !== undefined) {
        errors.push(`Light node ${id} transform is only supported for directional, point, and spot lights.`);
      }
      break;
  }
}

function validateObjectReferences(objects: unknown, assets: Record<string, AssetReference>, errors: string[]): void {
  if (!isPlainRecord(objects)) {
    return;
  }

  for (const [id, object] of Object.entries(objects)) {
    if (!isPlainRecord(object)) {
      continue;
    }
    if (typeof object.parentId === "string" && !objects[object.parentId]) {
      errors.push(`Object ${id} parent ${object.parentId} must exist.`);
    }
    if (Array.isArray(object.children)) {
      for (const childId of object.children) {
        if (typeof childId === "string" && !objects[childId]) {
          errors.push(`Object ${id} child ${childId} must exist.`);
        }
      }
    }
    if (isPlainRecord(object.asset) && typeof object.asset.id === "string" && !assets[object.asset.id]) {
      errors.push(`Object ${id} asset ${object.asset.id} must exist in assets.`);
    }
  }
}

function validatePayloadCoverage(nodes: unknown, objects: unknown, lights: unknown, errors: string[]): void {
  if (!isPlainRecord(nodes)) {
    return;
  }

  const objectIdsWithNodes = new Set<string>();
  const lightIdsWithNodes = new Set<string>();
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!isPlainRecord(node)) {
      continue;
    }
    if (node.kind === "object" && typeof node.objectId === "string") {
      if (objectIdsWithNodes.has(node.objectId)) {
        errors.push(`Object ${node.objectId} must not be referenced by multiple object nodes.`);
      }
      objectIdsWithNodes.add(node.objectId);
    }
    if (node.kind === "light" && typeof node.lightId === "string") {
      if (lightIdsWithNodes.has(node.lightId)) {
        errors.push(`Light ${node.lightId} must not be referenced by multiple light nodes.`);
      }
      lightIdsWithNodes.add(node.lightId);
    }
  }

  if (isPlainRecord(objects)) {
    for (const objectId of Object.keys(objects)) {
      if (!objectIdsWithNodes.has(objectId)) {
        errors.push(`Object ${objectId} must be referenced by an object node.`);
      }
    }
  }

  if (isPlainRecord(lights)) {
    for (const lightId of Object.keys(lights)) {
      if (!lightIdsWithNodes.has(lightId)) {
        errors.push(`Light ${lightId} must be referenced by a light node.`);
      }
    }
  }
}

function validateNodeGraph(nodes: unknown, rootNodeIds: unknown, errors: string[]): void {
  if (!isPlainRecord(nodes) || !Array.isArray(rootNodeIds)) {
    return;
  }

  const rootSet = new Set(rootNodeIds.filter((id): id is string => typeof id === "string"));
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!isPlainRecord(node)) {
      continue;
    }
    if (node.parentId === null && !rootSet.has(nodeId)) {
      errors.push(`Node ${nodeId} with no parent must be listed in rootNodeIds.`);
    }
    if (typeof node.parentId === "string") {
      const parent = nodes[node.parentId];
      if (!parent) {
        errors.push(`Node ${nodeId} parent ${node.parentId} must exist.`);
      } else if (isPlainRecord(parent) && Array.isArray(parent.children) && !parent.children.includes(nodeId)) {
        errors.push(`Node ${nodeId} parent ${node.parentId} must include it as a child.`);
      }
      if (rootSet.has(nodeId)) {
        errors.push(`Root node ${nodeId} must not have a parent.`);
      }
    }
    if (Array.isArray(node.children)) {
      for (const childId of node.children) {
        if (typeof childId !== "string") {
          continue;
        }
        const child = nodes[childId];
        if (!child) {
          errors.push(`Node ${nodeId} child ${childId} must exist.`);
        } else if (isPlainRecord(child) && child.parentId !== nodeId) {
          errors.push(`Node ${nodeId} child ${childId} must reference ${nodeId} as parent.`);
        }
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      errors.push(`Node graph must not contain cycles at ${nodeId}.`);
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }
    const node = nodes[nodeId];
    if (!isPlainRecord(node) || !Array.isArray(node.children)) {
      return;
    }
    visiting.add(nodeId);
    for (const childId of node.children) {
      if (typeof childId === "string") {
        visit(childId);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of Object.keys(nodes)) {
    visit(nodeId);
  }
}

function validateUniqueIds(ids: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push(`${label} ${id} must not be duplicated.`);
    }
    seen.add(id);
  }
}

function isTransform(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    isVector(value.position, 3) &&
    isVector(value.rotation, 3) &&
    isVector(value.scale, 3)
  );
}
