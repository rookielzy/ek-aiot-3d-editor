import { createDefaultEnvironment } from "../environment/defaults";
import { createEmptyMaterialState } from "../materials/defaults";
import { createEmptyAuthoredProblemState } from "../problems/defaults";
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
    assets: {},
    materials: createEmptyMaterialState(),
    environment: createDefaultEnvironment(),
    lights: {},
    problems: createEmptyAuthoredProblemState()
  };

  return Object.freeze(snapshot);
}
