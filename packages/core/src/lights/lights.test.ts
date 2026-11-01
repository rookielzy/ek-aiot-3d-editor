import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { createLightDefinition } from "./defaults";
import { createEmptySnapshot, createLightNode, createTransform } from "../snapshot/defaults";
import { validateSceneSnapshot } from "../snapshot/validation";

describe("light schema validation", () => {
  it("rejects malformed light colors", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      lights: {
        "light-a": {
          id: "light-a",
          kind: "ambient",
          name: "Bad color",
          color: "white",
          intensity: 1
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("color");
  });

  it("rejects directional lights without target intent", () => {
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      lights: {
        "light-a": {
          id: "light-a",
          kind: "directional",
          name: "Missing target",
          color: "#ffffff",
          intensity: 1,
          transform: createTransform()
        }
      }
    };

    const result = validateSceneSnapshot(snapshot);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("target");
  });

  it("accepts valid shadow settings on directional lights", () => {
    const light = createLightDefinition("directional", {
      id: "light-a",
      shadow: {
        enabled: true,
        mapSize: { width: 1024, height: 2048 },
        bias: -0.0001,
        normalBias: 0.01,
        radius: 2,
        camera: {
          near: 0.25,
          far: 50,
          left: -5,
          right: 5,
          top: 6,
          bottom: -4
        },
        metadata: { note: "durable" }
      }
    });
    const snapshot = {
      ...createEmptySnapshot("scene-a"),
      lights: {
        "light-a": light
      },
      nodes: {
        "light-a": createLightNode(light)
      },
      rootNodeIds: ["light-a"]
    };

    expect(validateSceneSnapshot(snapshot)).toEqual({ ok: true, errors: [], danglingDataReferences: [] });
  });

  it.each([
    ["ambient", { id: "ambient-a", kind: "ambient", name: "Ambient", color: "#ffffff", intensity: 1, shadow: { enabled: true } }],
    ["hemisphere", { id: "hemi-a", kind: "hemisphere", name: "Sky", color: "#ffffff", groundColor: "#222222", intensity: 1, shadow: { enabled: true } }]
  ])("rejects shadow settings on %s lights", (_kind, light) => {
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      lights: {
        [light.id]: light
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("does not support shadow settings");
  });

  it.each([
    ["non power-of-two map size", { mapSize: { width: 1000, height: 1024 } }, "power-of-two"],
    ["oversized map size", { mapSize: { width: 8192, height: 1024 } }, "4096"],
    ["inverted range", { camera: { near: 10, far: 2 } }, "near must be less than far"],
    ["collapsed directional bounds", { camera: { left: 1, right: 1 } }, "left must be less than right"],
    ["runtime metadata", { metadata: { object: new Object3D() } }, "JSON-compatible"]
  ])("rejects invalid shadow settings: %s", (_label, shadowPatch, expected) => {
    const light = createLightDefinition("directional", {
      id: "sun",
      shadow: {
        enabled: true,
        ...shadowPatch
      }
    });
    const result = validateSceneSnapshot({
      ...createEmptySnapshot("scene-a"),
      lights: {
        sun: light
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(expected);
  });
});
