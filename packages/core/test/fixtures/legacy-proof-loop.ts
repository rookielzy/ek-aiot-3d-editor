import { createTransform } from "../../src/snapshot/defaults";
import type { LegacySceneSnapshot } from "../../src/snapshot/types";

export function createLegacyProofLoopSnapshot(): LegacySceneSnapshot {
  return {
    version: 1,
    scene: {
      id: "scene-a",
      name: "Legacy scene"
    },
    assets: {
      "asset-a": {
        id: "asset-a",
        kind: "glb",
        label: "Box"
      }
    },
    objects: {
      "object-a": {
        id: "object-a",
        name: "Box",
        kind: "glb",
        parentId: null,
        children: [],
        asset: {
          id: "asset-a",
          kind: "glb",
          label: "Box"
        },
        transform: createTransform({ position: [4, 5, 6] })
      }
    },
    rootObjectIds: ["object-a"],
    selection: {
      objectId: "object-a"
    }
  };
}
