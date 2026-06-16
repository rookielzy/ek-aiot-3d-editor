import { describe, expect, it } from "vitest";
import { createLightDefinition } from "../lights/defaults";
import { createEmptySnapshot } from "../snapshot/defaults";
import { deriveLightingDiagnostics } from "./lighting-diagnostics";
import type { RuntimeLightShadowSummary } from "./light-projector";

describe("lighting diagnostics", () => {
  it("warns for enabled point light shadows and high effective map cost", () => {
    const snapshot = createSnapshot({
      lights: {
        point: createLightDefinition("point", {
          id: "point",
          name: "Point preview",
          shadow: { enabled: true, mapSize: { width: 2048, height: 2048 } }
        })
      }
    });

    const problems = deriveLightingDiagnostics(snapshot, createSummary({
      lightId: "point",
      kind: "point",
      faces: 6,
      width: 2048,
      height: 2048,
      near: 0.5,
      far: 25
    }));

    expect(problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "lighting-point-shadow-cost",
      "lighting-shadow-map-high",
      "lighting-shadow-budget-high"
    ]));
    expect(problems).toContainEqual(expect.objectContaining({
      target: { kind: "light", lightId: "point" },
      metadata: expect.objectContaining({ faces: 6 })
    }));
  });

  it("diagnoses broad directional shadow bounds and ranges", () => {
    const snapshot = createSnapshot({
      lights: {
        sun: createLightDefinition("directional", {
          id: "sun",
          name: "Sun",
          shadow: {
            enabled: true,
            camera: { near: 0.1, far: 500, left: -40, right: 40, top: 30, bottom: -30 }
          }
        })
      }
    });

    const problems = deriveLightingDiagnostics(snapshot, createSummary({
      lightId: "sun",
      kind: "directional",
      faces: 1,
      width: 1024,
      height: 1024,
      near: 0.1,
      far: 500,
      left: -40,
      right: 40,
      top: 30,
      bottom: -30
    }));

    expect(problems.map((problem) => problem.code)).toEqual([
      "lighting-directional-shadow-bounds-broad",
      "lighting-shadow-camera-range-broad"
    ]);
  });

  it("reports missing renderer shadow map capability without mutating authored state", () => {
    const snapshot = createSnapshot({
      lights: {
        spot: createLightDefinition("spot", {
          id: "spot",
          shadow: { enabled: true }
        })
      }
    });

    const problems = deriveLightingDiagnostics(snapshot, createSummary({
      lightId: "spot",
      kind: "spot",
      faces: 1,
      width: 1024,
      height: 1024,
      near: 0.5,
      far: 100
    }), { rendererShadowMapAvailable: false });

    expect(problems).toContainEqual(expect.objectContaining({
      code: "lighting-shadow-renderer-missing",
      target: { kind: "scene", sceneId: snapshot.scene.id }
    }));
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("does not emit diagnostics when no shadows are enabled", () => {
    const snapshot = createSnapshot({
      lights: {
        sun: createLightDefinition("directional", { id: "sun" })
      }
    });

    const problems = deriveLightingDiagnostics(snapshot, {
      enabled: false,
      entries: [{
        lightId: "sun",
        kind: "directional",
        enabled: false,
        faces: 1,
        mapSize: { width: 4096, height: 4096 },
        texelCost: 4096 * 4096,
        camera: { near: 0.5, far: 500, left: -50, right: 50, top: 50, bottom: -50 }
      }],
      totalTexelCost: 0
    });

    expect(problems).toEqual([]);
  });
});

function createSummary(input: {
  lightId: string;
  kind: "directional" | "point" | "spot";
  faces: number;
  width: number;
  height: number;
  near: number;
  far: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}): RuntimeLightShadowSummary {
  return {
    enabled: true,
    entries: [{
      lightId: input.lightId,
      kind: input.kind,
      enabled: true,
      faces: input.faces,
      mapSize: { width: input.width, height: input.height },
      texelCost: input.width * input.height * input.faces,
      camera: {
        near: input.near,
        far: input.far,
        ...(input.left !== undefined ? { left: input.left } : {}),
        ...(input.right !== undefined ? { right: input.right } : {}),
        ...(input.top !== undefined ? { top: input.top } : {}),
        ...(input.bottom !== undefined ? { bottom: input.bottom } : {})
      }
    }],
    totalTexelCost: input.width * input.height * input.faces
  };
}

function createSnapshot(snapshot: Pick<ReturnType<typeof createEmptySnapshot>, "lights">): ReturnType<typeof createEmptySnapshot> {
  return {
    ...createEmptySnapshot("scene-a"),
    lights: snapshot.lights
  };
}
