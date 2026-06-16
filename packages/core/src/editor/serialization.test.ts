import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "../snapshot/defaults";
import type { SceneSnapshot, V3SceneSnapshot } from "../snapshot/types";
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
      nodes: {
        "object-a": {
          id: "object-a",
          kind: "object",
          name: "Box",
          objectId: "object-a",
          parentId: null,
          children: [],
          transform: createTransform({ position: [4, 5, 6] })
        }
      },
      rootNodeIds: ["object-a"],
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
        nodeId: "object-a",
        nodeIds: ["object-a"],
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

    expect(restored.version).toBe(7);
    expect(restored.scene).toEqual(legacy.scene);
    expect(restored.objects["object-a"].transform.position).toEqual([4, 5, 6]);
    expect(restored.nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(restored.rootNodeIds).toEqual(["object-a"]);
    expect(restored.selection.nodeId).toBe("object-a");
    expect(restored.selection.nodeIds).toEqual(["object-a"]);
    expect(restored.selection.objectId).toBe("object-a");
    expect(restored.selection.objectIds).toEqual(["object-a"]);
    expect(restored.materials).toEqual({ definitions: {}, assignments: {} });
    expect(restored.environment.lighting.source).toEqual({ kind: "none" });
    expect(restored.environment.background.source).toEqual({ kind: "none" });
    expect(restored.lights).toEqual({});
    expect(restored.cameras).toEqual({});
    expect(restored.presentation).toEqual({ defaultCameraId: null });
    expect(restored.problems).toEqual({ acknowledged: {} });
  });

  it("migrates version 2 snapshots to ordered multi-selection", () => {
    const version2 = {
      version: 2,
      scene: { id: "scene-a", name: "Untitled scene" },
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
      },
      materials: { definitions: {}, assignments: {} },
      environment: createEmptySnapshot("scene-a").environment,
      lights: {},
      problems: { acknowledged: {} }
    } as const;

    const restored = restoreSnapshot(version2);

    expect(restored.version).toBe(7);
    expect(restored.selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a"], objectId: "object-a", objectIds: ["object-a"] });
  });

  it("migrates version 3 object hierarchy, light payloads, and colliding light IDs to nodes", () => {
    const version3: V3SceneSnapshot = {
      version: 3,
      scene: { id: "scene-a", name: "Untitled scene" },
      assets: {
        "asset-a": { id: "asset-a", kind: "glb" },
        "asset-b": { id: "asset-b", kind: "glb" }
      },
      objects: {
        "object-a": {
          id: "object-a",
          name: "Parent",
          kind: "glb",
          parentId: null,
          children: ["light-a"],
          asset: { id: "asset-a", kind: "glb" },
          transform: createTransform({ position: [1, 0, 0] })
        },
        "light-a": {
          id: "light-a",
          name: "Child",
          kind: "glb",
          parentId: "object-a",
          children: [],
          asset: { id: "asset-b", kind: "glb" },
          transform: createTransform({ position: [0, 1, 0] })
        }
      },
      rootObjectIds: ["object-a"],
      selection: { objectId: "light-a", objectIds: ["light-a"] },
      materials: {
        definitions: {
          "material-a": {
            id: "material-a",
            name: "Override",
            kind: "mesh-standard",
            override: { color: "#ffffff" }
          }
        },
        assignments: {
          "object:light-a": {
            id: "object:light-a",
            target: { kind: "object", objectId: "light-a" },
            materialId: "material-a"
          }
        }
      },
      environment: createEmptySnapshot("scene-a").environment,
      lights: {
        "light-a": {
          id: "light-a",
          kind: "ambient",
          name: "Fill",
          color: "#ffffff",
          intensity: 1
        }
      },
      problems: { acknowledged: {} }
    };

    const restored = restoreSnapshot(version3);

    expect(restored.version).toBe(7);
    expect(restored.nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a", children: ["light-a"] });
    expect(restored.nodes["light-a"]).toMatchObject({ kind: "object", objectId: "light-a", parentId: "object-a" });
    expect(restored.nodes["light-a:light"]).toMatchObject({ kind: "light", lightId: "light-a", parentId: null });
    expect(restored.rootNodeIds).toEqual(["object-a", "light-a:light"]);
    expect(restored.lights["light-a"].name).toBe("Fill");
    expect(restored.materials.assignments["object:light-a"].target).toEqual({ kind: "object", objectId: "light-a" });
    expect(restored.selection).toMatchObject({ nodeId: "light-a", nodeIds: ["light-a"], objectId: "light-a", objectIds: ["light-a"] });
  });

  it("validates serialized version 1 snapshots through the migration path", () => {
    const legacy = createLegacyProofLoopSnapshot();

    expect(validateSceneSnapshot(legacy).ok).toBe(false);
    expect(validateSerializedSceneSnapshot(legacy)).toEqual({ ok: true, errors: [] });
  });
});
