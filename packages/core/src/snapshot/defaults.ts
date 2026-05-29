import { SNAPSHOT_VERSION, type SceneSnapshot, type Transform } from "./types";

let nextId = 0;

export function createId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId.toString(36)}`;
}

export function createTransform(partial: Partial<Transform> = {}): Transform {
  return {
    position: [...(partial.position ?? [0, 0, 0])] as [number, number, number],
    rotation: [...(partial.rotation ?? [0, 0, 0])] as [number, number, number],
    scale: [...(partial.scale ?? [1, 1, 1])] as [number, number, number]
  };
}

export function createEmptySnapshot(sceneId = createId("scene")): SceneSnapshot {
  const snapshot: SceneSnapshot = {
    version: SNAPSHOT_VERSION,
    scene: {
      id: sceneId,
      name: "Untitled scene"
    },
    objects: {},
    rootObjectIds: [],
    selection: {
      objectId: null
    },
    assets: {}
  };

  return Object.freeze(snapshot);
}
