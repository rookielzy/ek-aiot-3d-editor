import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { restoreSnapshot, serializeSnapshot } from "./serialization";

describe("snapshot serialization", () => {
  it("round-trips scene identity, object hierarchy, transforms, selection, and asset references", () => {
    const snapshot: SceneSnapshot = {
      ...createEmptySnapshot("scene-a"),
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

    expect(restoreSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("returns immutable snapshots from serialization boundaries", () => {
    const restored = restoreSnapshot(serializeSnapshot(createEmptySnapshot("scene-a")));

    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.scene)).toBe(true);
  });
});
