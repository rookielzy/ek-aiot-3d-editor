import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { createEmptySnapshot, createTransform } from "./defaults";
import type { SceneSnapshot } from "./types";
import { isJsonCompatible, validateSceneSnapshot } from "./validation";

describe("scene snapshot contract", () => {
  it("creates a versioned JSON-compatible empty snapshot", () => {
    const snapshot = createEmptySnapshot("scene-a");

    expect(snapshot.version).toBe(4);
    expect(snapshot.scene.id).toBe("scene-a");
    expect(snapshot.nodes).toEqual({});
    expect(snapshot.rootNodeIds).toEqual([]);
    expect(snapshot.materials).toEqual({ definitions: {}, assignments: {} });
    expect(snapshot.environment.mode).toBe("none");
    expect(snapshot.lights).toEqual({});
    expect(snapshot.problems).toEqual({ acknowledged: {} });
    expect(snapshot.selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
    expect(isJsonCompatible(snapshot)).toBe(true);
    expect(validateSceneSnapshot(snapshot)).toEqual({ ok: true, errors: [] });
  });

  it("rejects browser and runtime objects before serialization", () => {
    const runtimeObject = new URL("blob:https://example.test/runtime");
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      metadata: {
        runtimeObject
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });

  it.each([
    ["function", () => undefined],
    ["Object3D", new Object3D()],
    ["class instance", new (class RuntimeValue {})()],
    ["object URL", new URL("blob:https://example.test/runtime")],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY]
  ])("rejects %s metadata as non-JSON-compatible", (_label, value) => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      metadata: { value }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });

  it("rejects File and Blob metadata when browser constructors are available", () => {
    const values = [
      typeof Blob === "undefined" ? undefined : new Blob(["runtime"]),
      typeof File === "undefined" ? undefined : new File(["runtime"], "runtime.txt")
    ].filter((value): value is Blob | File => Boolean(value));

    for (const value of values) {
      const result = validateSceneSnapshot({
        ...createEmptySnapshot("scene-a"),
        metadata: { value }
      });

      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toContain("JSON-compatible");
    }
  });

  it("rejects circular metadata as non-JSON-compatible", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      metadata: circular
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });

  it("rejects missing object, asset, and selection references", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      nodes: {
        "object-a": {
          id: "object-a",
          kind: "object",
          name: "Broken",
          objectId: "object-a",
          parentId: null,
          children: ["missing-child"],
          transform: createTransform()
        }
      },
      rootNodeIds: ["missing-root"],
      objects: {
        "object-a": {
          id: "object-a",
          name: "Broken",
          kind: "glb",
          parentId: null,
          children: ["missing-child"],
          asset: { id: "missing-asset", kind: "glb" },
          transform: createTransform()
        }
      },
      rootObjectIds: ["missing-root"],
      selection: {
        nodeId: "missing-selection",
        nodeIds: ["missing-selection", "missing-selection"],
        objectId: "missing-selection",
        objectIds: ["missing-selection", "missing-selection"]
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Root node missing-root");
    expect(result.errors.join("\n")).toContain("Selected node missing-selection");
    expect(result.errors.join("\n")).toContain("Root object missing-root");
    expect(result.errors.join("\n")).toContain("Selected object missing-selection");
    expect(result.errors.join("\n")).toContain("must not be duplicated");
    expect(result.errors.join("\n")).toContain("child missing-child");
    expect(result.errors.join("\n")).toContain("asset missing-asset");
  });

  it("rejects primary selection outside the ordered selected IDs", () => {
    const snapshot: SceneSnapshot = {
      ...createValidObjectSnapshot(),
      selection: {
        nodeId: "object-b",
        nodeIds: ["object-a"],
        objectId: "object-b",
        objectIds: ["object-a"]
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Primary selected node object-b");
    expect(result.errors.join("\n")).toContain("Primary selected object object-b");
  });

  it.each([
    ["missing payload", (snapshot: SceneSnapshot) => ({ ...snapshot, nodes: { ...snapshot.nodes, "object-a": { ...snapshot.nodes["object-a"], objectId: "missing" } } })],
    ["duplicate child", (snapshot: SceneSnapshot) => ({ ...snapshot, nodes: { ...snapshot.nodes, "object-a": { ...snapshot.nodes["object-a"], children: ["object-b", "object-b"] } } })],
    ["child-parent mismatch", (snapshot: SceneSnapshot) => ({ ...snapshot, nodes: { ...snapshot.nodes, "object-a": { ...snapshot.nodes["object-a"], children: ["object-b"] }, "object-b": { ...snapshot.nodes["object-b"], parentId: null } } })],
    ["cycle", (snapshot: SceneSnapshot) => ({ ...snapshot, nodes: { ...snapshot.nodes, "object-a": { ...snapshot.nodes["object-a"], parentId: "object-b", children: ["object-b"] }, "object-b": { ...snapshot.nodes["object-b"], parentId: "object-a", children: ["object-a"] } }, rootNodeIds: [] })],
    ["invalid root", (snapshot: SceneSnapshot) => ({ ...snapshot, rootNodeIds: ["missing"] })],
    ["invalid transform", (snapshot: SceneSnapshot) => ({ ...snapshot, nodes: { ...snapshot.nodes, "object-a": { ...snapshot.nodes["object-a"], transform: { position: [0, Number.NaN, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } } })],
    ["duplicate selection", (snapshot: SceneSnapshot) => ({ ...snapshot, selection: { nodeId: "object-a", nodeIds: ["object-a", "object-a"], objectId: "object-a", objectIds: ["object-a"] } })],
    ["object selection mirror mismatch", (snapshot: SceneSnapshot) => ({ ...snapshot, selection: { nodeId: "object-a", nodeIds: ["object-a"], objectId: "object-b", objectIds: ["object-b"] } })]
  ])("rejects invalid node graph: %s", (_label, mutate) => {
    const result = validateSceneSnapshot(mutate(createValidObjectSnapshot()));

    expect(result.ok).toBe(false);
  });

  it("rejects non-string asset labels", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      assets: {
        "asset-a": {
          id: "asset-a",
          kind: "glb",
          label: 123
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("label must be a string");
  });

  it("normalizes missing transform fields to default vectors", () => {
    expect(createTransform({ position: [1, 2, 3] })).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
  });
});

function createValidObjectSnapshot(): SceneSnapshot {
  const snapshot = createEmptySnapshot("scene-a");
  return {
    ...snapshot,
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" },
      "asset-b": { id: "asset-b", kind: "glb" }
    },
    nodes: {
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "A",
        objectId: "object-a",
        parentId: null,
        children: [],
        transform: createTransform()
      },
      "object-b": {
        id: "object-b",
        kind: "object",
        name: "B",
        objectId: "object-b",
        parentId: null,
        children: [],
        transform: createTransform()
      }
    },
    rootNodeIds: ["object-a", "object-b"],
    objects: {
      "object-a": {
        id: "object-a",
        name: "A",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: createTransform()
      },
      "object-b": {
        id: "object-b",
        name: "B",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-b", kind: "glb" },
        transform: createTransform()
      }
    },
    rootObjectIds: ["object-a", "object-b"]
  };
}
