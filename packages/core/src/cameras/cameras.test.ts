import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";
import { createAuthoredCameraView } from "./defaults";

describe("authored camera view contract", () => {
  it("creates JSON-compatible perspective authored camera views", () => {
    const view = createAuthoredCameraView({
      id: "view-a",
      name: "Hero",
      projection: { kind: "perspective", fov: 60 },
      position: [1, 2, 3],
      target: [4, 5, 6],
      near: 0.25,
      far: 500,
      metadata: { role: "default" }
    });
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: { "view-a": view },
        defaultViewId: "view-a"
      }
    };

    expect(validateSceneSnapshot(snapshot)).toEqual({ ok: true, errors: [] });
    expect(JSON.parse(JSON.stringify(snapshot)).presentation.cameraViews["view-a"]).toEqual(view);
  });

  it.each([
    ["position NaN", { position: [0, Number.NaN, 0] }],
    ["target Infinity", { target: [0, Number.POSITIVE_INFINITY, 0] }],
    ["wrong vector length", { position: [0, 0] }],
    ["fov zero", { projection: { kind: "perspective", fov: 0 } }],
    ["fov 180", { projection: { kind: "perspective", fov: 180 } }],
    ["near zero", { near: 0 }],
    ["far before near", { near: 10, far: 1 }],
    ["unsupported projection", { projection: { kind: "orthographic", fov: 50 } }]
  ])("rejects invalid camera view data: %s", (_label, patch) => {
    const view = {
      ...createAuthoredCameraView({ id: "view-a" }),
      ...patch
    };
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: { "view-a": view },
        defaultViewId: null
      }
    });

    expect(result.ok).toBe(false);
  });

  it.each([
    ["Object3D", new Object3D()],
    ["function", () => undefined],
    ["cyclic object", createCyclicObject()],
    ["Blob", typeof Blob === "undefined" ? new Object3D() : new Blob(["runtime"])]
  ])("rejects runtime metadata as non-JSON-compatible: %s", (_label, value) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: {
          "view-a": createAuthoredCameraView({
            id: "view-a",
            metadata: { value } as never
          })
        },
        defaultViewId: null
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });

  it("rejects missing default camera view references", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: {},
        defaultViewId: "missing"
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Default camera view missing");
  });

  it("rejects default camera view references resolved only through the prototype chain", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: {},
        defaultViewId: "constructor"
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Default camera view constructor");
  });

  it.each([
    ["empty map key", ""],
    ["blank map key", "   "]
  ])("rejects %s camera view ids", (_label, viewId) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: {
          [viewId]: createAuthoredCameraView({ id: viewId })
        },
        defaultViewId: null
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Camera view id must be a non-empty string.");
  });

  it.each([
    ["empty default", ""],
    ["blank default", "   "]
  ])("rejects %s camera view defaults", (_label, defaultViewId) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: {
        cameraViews: {},
        defaultViewId
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("defaultViewId must be a non-empty camera view ID or null");
  });

  it.each([
    ["non-object presentation", { presentation: null }, "Snapshot presentation must be a plain object."],
    ["non-object cameraViews", { presentation: { cameraViews: [], defaultViewId: null } }, "Snapshot presentation cameraViews must be a plain object map."],
    ["non-string defaultViewId", { presentation: { cameraViews: {}, defaultViewId: 42 } }, "Snapshot presentation defaultViewId must be a camera view ID or null."],
    [
      "camera view key/id mismatch",
      { presentation: { cameraViews: { "view-a": createAuthoredCameraView({ id: "view-b" }) }, defaultViewId: null } },
      "Camera view view-a must use a matching id field."
    ],
    [
      "missing camera view name",
      { presentation: { cameraViews: { "view-a": { ...createAuthoredCameraView({ id: "view-a" }), name: undefined } }, defaultViewId: null } },
      "Camera view view-a must include a name."
    ]
  ])("reports malformed presentation schema: %s", (_label, patch, expected) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      ...patch
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(expected);
  });
});

function createCyclicObject(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  value.self = value;
  return value;
}
