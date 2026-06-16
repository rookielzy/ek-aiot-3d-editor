import type { SceneEnvironment } from "./types";

export function createDefaultEnvironment(): SceneEnvironment {
  return {
    lighting: {
      source: { kind: "none" },
      intensity: 1,
      rotation: { x: 0, y: 0, z: 0 }
    },
    background: {
      source: { kind: "none" }
    }
  };
}
