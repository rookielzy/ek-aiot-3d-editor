import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createCameraNode, createEmptySnapshot } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";
import { createAuthoredCameraView } from "./defaults";

describe("authored camera contract", () => {
  it("validates JSON-compatible perspective authored cameras with node mirrors", () => {
    const camera = createAuthoredCameraView({
      id: "camera-a",
      name: "Hero",
      projection: { kind: "perspective", fov: 60 },
      position: [1, 2, 3],
      target: [4, 5, 6],
      near: 0.25,
      far: 500,
      metadata: { role: "default" }
    });
    const cameraNode = createCameraNode(camera);
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      cameras: { "camera-a": camera },
      nodes: { [cameraNode.id]: cameraNode },
      rootNodeIds: [cameraNode.id],
      presentation: { defaultCameraId: "camera-a" }
    };

    expect(validateSceneSnapshot(snapshot)).toEqual({ ok: true, errors: [] });
    expect(JSON.parse(JSON.stringify(snapshot)).cameras["camera-a"]).toEqual(camera);
  });

  it("rejects camera payloads without matching camera nodes", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      cameras: { "camera-a": createAuthoredCameraView({ id: "camera-a" }) }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Camera camera-a must be referenced by a camera node.");
  });

  it("rejects camera nodes that reference missing camera payloads", () => {
    const camera = createAuthoredCameraView({ id: "camera-a" });
    const cameraNode = createCameraNode(camera);
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      nodes: { [cameraNode.id]: cameraNode },
      rootNodeIds: [cameraNode.id]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Camera node camera-a camera camera-a must exist in cameras.");
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
  ])("rejects invalid authored camera data: %s", (_label, patch) => {
    const camera = {
      ...createAuthoredCameraView({ id: "camera-a" }),
      ...patch
    };
    const cameraNode = createCameraNode(createAuthoredCameraView({ id: "camera-a" }));
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      cameras: { "camera-a": camera },
      nodes: { [cameraNode.id]: cameraNode },
      rootNodeIds: [cameraNode.id]
    });

    expect(result.ok).toBe(false);
  });

  it.each([
    ["Object3D", new Object3D()],
    ["function", () => undefined],
    ["cyclic object", createCyclicObject()],
    ["Blob", typeof Blob === "undefined" ? new Object3D() : new Blob(["runtime"])]
  ])("rejects runtime metadata as non-JSON-compatible: %s", (_label, value) => {
    const camera = createAuthoredCameraView({
      id: "camera-a",
      metadata: { value } as never
    });
    const cameraNode = createCameraNode(camera);
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      cameras: { "camera-a": camera },
      nodes: { [cameraNode.id]: cameraNode },
      rootNodeIds: [cameraNode.id]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("JSON-compatible");
  });

  it("rejects missing default camera references", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: { defaultCameraId: "missing" }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Default camera missing");
  });

  it("rejects default camera references resolved only through the prototype chain", () => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: { defaultCameraId: "constructor" }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Default camera constructor");
  });

  it.each([
    ["empty map key", ""],
    ["blank map key", "   "]
  ])("rejects %s camera ids", (_label, cameraId) => {
    const camera = createAuthoredCameraView({ id: cameraId });
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      cameras: {
        [cameraId]: camera
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Camera view id must be a non-empty string.");
  });

  it.each([
    ["empty default", ""],
    ["blank default", "   "]
  ])("rejects %s camera defaults", (_label, defaultCameraId) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      presentation: { defaultCameraId }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("defaultCameraId must be a non-empty camera ID or null");
  });

  it.each([
    ["non-object cameras", { cameras: [] }, "Snapshot cameras must be a plain object map."],
    ["non-object presentation", { presentation: null }, "Snapshot presentation must be a plain object."],
    ["non-string defaultCameraId", { presentation: { defaultCameraId: 42 } }, "Snapshot presentation defaultCameraId must be a camera ID or null."],
    [
      "camera key/id mismatch",
      { cameras: { "camera-a": createAuthoredCameraView({ id: "camera-b" }) } },
      "Camera view camera-a must use a matching id field."
    ],
    [
      "missing camera name",
      { cameras: { "camera-a": { ...createAuthoredCameraView({ id: "camera-a" }), name: undefined } } },
      "Camera view camera-a must include a name."
    ]
  ])("reports malformed camera schema: %s", (_label, patch, expected) => {
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
