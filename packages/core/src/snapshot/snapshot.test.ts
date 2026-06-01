import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { createEmptySnapshot, createTransform } from "./defaults";
import { isJsonCompatible, validateSceneSnapshot } from "./validation";

describe("scene snapshot contract", () => {
  it("creates a versioned JSON-compatible empty snapshot", () => {
    const snapshot = createEmptySnapshot("scene-a");

    expect(snapshot.version).toBe(3);
    expect(snapshot.scene.id).toBe("scene-a");
    expect(snapshot.materials).toEqual({ definitions: {}, assignments: {} });
    expect(snapshot.environment.mode).toBe("none");
    expect(snapshot.lights).toEqual({});
    expect(snapshot.problems).toEqual({ acknowledged: {} });
    expect(snapshot.selection).toEqual({ objectId: null, objectIds: [] });
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
        objectId: "missing-selection",
        objectIds: ["missing-selection", "missing-selection"]
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Root object missing-root");
    expect(result.errors.join("\n")).toContain("Selected object missing-selection");
    expect(result.errors.join("\n")).toContain("must not be duplicated");
    expect(result.errors.join("\n")).toContain("child missing-child");
    expect(result.errors.join("\n")).toContain("asset missing-asset");
  });

  it("rejects primary selection outside the ordered selected IDs", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      assets: {
        "asset-a": { id: "asset-a", kind: "glb" },
        "asset-b": { id: "asset-b", kind: "glb" }
      },
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
      rootObjectIds: ["object-a", "object-b"],
      selection: {
        objectId: "object-b",
        objectIds: ["object-a"]
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Primary selected object object-b");
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
