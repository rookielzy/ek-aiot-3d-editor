import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "./defaults";
import { isJsonCompatible, validateSceneSnapshot } from "./validation";

describe("scene snapshot contract", () => {
  it("creates a versioned JSON-compatible empty snapshot", () => {
    const snapshot = createEmptySnapshot("scene-a");

    expect(snapshot.version).toBe(2);
    expect(snapshot.scene.id).toBe("scene-a");
    expect(snapshot.materials).toEqual({ definitions: {}, assignments: {} });
    expect(snapshot.environment.mode).toBe("none");
    expect(snapshot.lights).toEqual({});
    expect(snapshot.problems).toEqual({ acknowledged: {} });
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
        objectId: "missing-selection"
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Root object missing-root");
    expect(result.errors.join("\n")).toContain("Selected object missing-selection");
    expect(result.errors.join("\n")).toContain("child missing-child");
    expect(result.errors.join("\n")).toContain("asset missing-asset");
  });

  it("normalizes missing transform fields to default vectors", () => {
    expect(createTransform({ position: [1, 2, 3] })).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
  });
});
