import { createDefaultEnvironment } from "../environment/defaults";
import { createEmptyMaterialState } from "../materials/defaults";
import { createEmptyAuthoredProblemState } from "../problems/defaults";
import { createLightNode, createObjectNode } from "./defaults";
import { immutableClone } from "./immutability";
import {
  SNAPSHOT_VERSION,
  type LegacySceneSnapshot,
  type PreviousSceneSnapshot,
  type SceneNode,
  type SceneSnapshot,
  type SerializedSceneSnapshot,
  type V4SceneSnapshot,
  type V3SceneSnapshot
} from "./types";
import { assertValidSceneSnapshot, type ValidationResult } from "./validation";

export function migrateSerializedSnapshot(serialized: SerializedSceneSnapshot): SceneSnapshot {
  if (serialized.version === SNAPSHOT_VERSION) {
    assertValidSceneSnapshot(serialized);
    return immutableClone(serialized);
  }

  if (serialized.version === 4) {
    const migrated = migrateV4Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 3) {
    const migrated = migrateV3Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 2) {
    const migrated = migrateV2Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 1) {
    const migrated = migrateV1Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  const version = (serialized as { version?: unknown }).version;
  throw new Error(`Unsupported snapshot version: ${String(version)}.`);
}

export function migrateV4Snapshot(serialized: V4SceneSnapshot): SceneSnapshot {
  return {
    ...serialized,
    version: SNAPSHOT_VERSION
  };
}

export function migrateV1Snapshot(serialized: LegacySceneSnapshot): SceneSnapshot {
  return migrateV2Snapshot({
    ...serialized,
    version: 2,
    materials: createEmptyMaterialState(),
    environment: createDefaultEnvironment(),
    lights: {},
    problems: createEmptyAuthoredProblemState()
  });
}

export function migrateV2Snapshot(serialized: PreviousSceneSnapshot): SceneSnapshot {
  const selectedObjectId = serialized.selection.objectId;
  return migrateV3Snapshot({
    ...serialized,
    version: 3,
    selection: {
      objectId: selectedObjectId,
      objectIds: selectedObjectId ? [selectedObjectId] : []
    }
  });
}

export function migrateV3Snapshot(serialized: V3SceneSnapshot): SceneSnapshot {
  const nodes: Record<string, SceneNode> = {};
  const usedNodeIds = new Set<string>();

  for (const object of Object.values(serialized.objects)) {
    nodes[object.id] = createObjectNode(object);
    usedNodeIds.add(object.id);
  }

  const rootNodeIds = serialized.rootObjectIds.filter((objectId) => nodes[objectId]);

  for (const light of Object.values(serialized.lights)) {
    const nodeId = createCollisionSafeLightNodeId(light.id, usedNodeIds);
    nodes[nodeId] = createLightNode(light, nodeId);
    usedNodeIds.add(nodeId);
    rootNodeIds.push(nodeId);
  }

  const nodeIds = serialized.selection.objectIds.filter((objectId) => nodes[objectId]);
  const nodeId = serialized.selection.objectId && nodeIds.includes(serialized.selection.objectId)
    ? serialized.selection.objectId
    : nodeIds[0] ?? null;

  return {
    ...serialized,
    version: SNAPSHOT_VERSION,
    nodes,
    rootNodeIds,
    selection: {
      nodeId,
      nodeIds,
      objectId: nodeId,
      objectIds: nodeIds
    }
  };
}

export function validateSerializedSceneSnapshot(value: unknown): ValidationResult {
  try {
    migrateSerializedSnapshot(value as SerializedSceneSnapshot);
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function createCollisionSafeLightNodeId(lightId: string, usedNodeIds: Set<string>): string {
  if (!usedNodeIds.has(lightId)) {
    return lightId;
  }

  const preferred = `${lightId}:light`;
  if (!usedNodeIds.has(preferred)) {
    return preferred;
  }

  let index = 2;
  let candidate = `${preferred}-${index}`;
  while (usedNodeIds.has(candidate)) {
    index += 1;
    candidate = `${preferred}-${index}`;
  }
  return candidate;
}
