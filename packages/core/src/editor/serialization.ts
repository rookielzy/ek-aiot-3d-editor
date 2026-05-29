import { immutableClone } from "../snapshot/immutability";
import { migrateSerializedSnapshot } from "../snapshot/migrations";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";
import { assertValidSceneSnapshot } from "../snapshot/validation";

export function serializeSnapshot(snapshot: SceneSnapshot): SerializedSceneSnapshot {
  assertValidSceneSnapshot(snapshot);
  return immutableClone(snapshot);
}

export function restoreSnapshot(serialized: SerializedSceneSnapshot): SceneSnapshot {
  return migrateSerializedSnapshot(serialized);
}
