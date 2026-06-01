import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { validateSerializedSceneSnapshot } from "../snapshot/migrations";
import { createLegacyProofLoopSnapshot } from "../../test/fixtures/legacy-proof-loop";
import { validateSceneSnapshot } from "../snapshot/validation";
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
        objectId: "object-a",
        objectIds: ["object-a"]
      }
    };

    expect(restoreSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("returns immutable snapshots from serialization boundaries", () => {
    const restored = restoreSnapshot(serializeSnapshot(createEmptySnapshot("scene-a")));

    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.scene)).toBe(true);
  });

  it("migrates version 1 proof-loop snapshots to the current schema", () => {
    const legacy = createLegacyProofLoopSnapshot();
    const restored = restoreSnapshot(legacy);

    expect(restored.version).toBe(3);
    expect(restored.scene).toEqual(legacy.scene);
    expect(restored.objects["object-a"].transform.position).toEqual([4, 5, 6]);
    expect(restored.selection.objectId).toBe("object-a");
    expect(restored.selection.objectIds).toEqual(["object-a"]);
    expect(restored.materials).toEqual({ definitions: {}, assignments: {} });
    expect(restored.environment.mode).toBe("none");
    expect(restored.lights).toEqual({});
    expect(restored.problems).toEqual({ acknowledged: {} });
  });

  it("migrates version 2 snapshots to ordered multi-selection", () => {
    const version2 = {
      ...createEmptySnapshot("scene-a"),
      version: 2,
      assets: {
        "asset-a": { id: "asset-a", kind: "glb" }
      },
      objects: {
        "object-a": {
          id: "object-a",
          name: "Box",
          kind: "glb",
          parentId: null,
          children: [],
          asset: { id: "asset-a", kind: "glb" },
          transform: createTransform()
        }
      },
      rootObjectIds: ["object-a"],
      selection: {
        objectId: "object-a"
      }
    } as const;

    const restored = restoreSnapshot(version2);

    expect(restored.version).toBe(3);
    expect(restored.selection).toEqual({ objectId: "object-a", objectIds: ["object-a"] });
  });

  it("validates serialized version 1 snapshots through the migration path", () => {
    const legacy = createLegacyProofLoopSnapshot();

    expect(validateSceneSnapshot(legacy).ok).toBe(false);
    expect(validateSerializedSceneSnapshot(legacy)).toEqual({ ok: true, errors: [] });
  });
});
