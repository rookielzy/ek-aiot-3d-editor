import { createDefaultEnvironment } from "../environment/defaults";
import { createEmptyMaterialState } from "../materials/defaults";
import { createEmptyAuthoredProblemState } from "../problems/defaults";
import { immutableClone } from "./immutability";
import {
  SNAPSHOT_VERSION,
  type LegacySceneSnapshot,
  type PreviousSceneSnapshot,
  type SceneSnapshot,
  type SerializedSceneSnapshot
} from "./types";
import { assertValidSceneSnapshot, type ValidationResult } from "./validation";

export function migrateSerializedSnapshot(serialized: SerializedSceneSnapshot): SceneSnapshot {
  if (serialized.version === SNAPSHOT_VERSION) {
    assertValidSceneSnapshot(serialized);
    return immutableClone(serialized);
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
  return {
    ...serialized,
    version: SNAPSHOT_VERSION,
    selection: {
      objectId: selectedObjectId,
      objectIds: selectedObjectId ? [selectedObjectId] : []
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
