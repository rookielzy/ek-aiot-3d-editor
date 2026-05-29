import type { SceneEnvironment } from "./types";

export function createDefaultEnvironment(): SceneEnvironment {
  return {
    mode: "none",
    background: {
      mode: "none"
    },
    environment: {
      intensity: 1,
      rotation: { x: 0, y: 0, z: 0 }
    }
  };
}
