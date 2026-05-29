import { AmbientLight, DirectionalLight, HemisphereLight, PointLight, Scene, SpotLight } from "three";
import { describe, expect, it } from "vitest";
import { createLightDefinition } from "../lights/defaults";
import type { LightDefinition } from "../lights/types";
import { LightProjector } from "./light-projector";

describe("light projector", () => {
  it("projects ambient lights", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      "light-a": createLightDefinition("ambient", { id: "light-a", color: "#ffffff", intensity: 0.5 })
    });

    const light = projector.get("light-a");
    expect(light).toBeInstanceOf(AmbientLight);
    expect(light?.intensity).toBe(0.5);
    expect(scene.children).toContain(light);
  });

  it("projects hemisphere lights with ground color", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      hemi: createLightDefinition("hemisphere", {
        id: "hemi",
        color: "#ffffff",
        groundColor: "#404040",
        intensity: 0.7
      })
    });

    const light = projector.get("hemi") as HemisphereLight;
    expect(light).toBeInstanceOf(HemisphereLight);
    expect(light.groundColor.getHexString()).toBe("404040");
    expect(light.intensity).toBe(0.7);
  });

  it("projects point lights with transform, distance, and decay", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      point: createLightDefinition("point", {
        id: "point",
        transform: { position: [1, 2, 3] },
        distance: 12,
        decay: 1.5
      })
    });

    const light = projector.get("point") as PointLight;
    expect(light).toBeInstanceOf(PointLight);
    expect(light.position.toArray()).toEqual([1, 2, 3]);
    expect(light.distance).toBe(12);
    expect(light.decay).toBe(1.5);
  });

  it("projects directional light targets as internal runtime objects", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      sun: createLightDefinition("directional", {
        id: "sun",
        transform: { position: [1, 2, 3] },
        target: [4, 5, 6]
      })
    });

    const light = projector.get("sun") as DirectionalLight;
    const target = projector.getTarget("sun");
    expect(light).toBeInstanceOf(DirectionalLight);
    expect(light.position.toArray()).toEqual([1, 2, 3]);
    expect(target?.position.toArray()).toEqual([4, 5, 6]);
    expect(light.target).toBe(target);
    expect(scene.children).toContain(target);
  });

  it("projects spot light fields", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      spot: createLightDefinition("spot", {
        id: "spot",
        transform: { position: [1, 2, 3] },
        target: [0, 1, 0],
        angle: 0.4,
        penumbra: 0.2,
        distance: 10,
        decay: 1
      })
    });

    const light = projector.get("spot") as SpotLight;
    expect(light).toBeInstanceOf(SpotLight);
    expect(light.position.toArray()).toEqual([1, 2, 3]);
    expect(light.target.position.toArray()).toEqual([0, 1, 0]);
    expect(light.angle).toBe(0.4);
    expect(light.penumbra).toBe(0.2);
    expect(light.distance).toBe(10);
    expect(light.decay).toBe(1);
  });

  it("updates and removes runtime lights with snapshot changes", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);
    const first = createLightDefinition("directional", { id: "sun", target: [0, 0, 0] });
    const updated: LightDefinition = {
      ...first,
      intensity: 3,
      target: [1, 1, 1]
    };

    projector.project({ sun: first });
    const runtimeLight = projector.get("sun");
    const runtimeTarget = projector.getTarget("sun");
    projector.project({ sun: updated });

    expect(projector.get("sun")).toBe(runtimeLight);
    expect(projector.get("sun")?.intensity).toBe(3);
    expect(projector.getTarget("sun")).toBe(runtimeTarget);
    expect(projector.getTarget("sun")?.position.toArray()).toEqual([1, 1, 1]);

    projector.project({});
    expect(projector.get("sun")).toBeUndefined();
    expect(runtimeLight?.parent).toBeNull();
    expect(runtimeTarget?.parent).toBeNull();
  });

  it("replaces runtime lights and removes stale targets when a light ID changes kind", () => {
    const scene = new Scene();
    const projector = new LightProjector(scene);

    projector.project({
      shared: createLightDefinition("directional", { id: "shared", target: [0, 0, 0] })
    });
    const oldLight = projector.get("shared");
    const oldTarget = projector.getTarget("shared");
    projector.project({
      shared: createLightDefinition("ambient", { id: "shared", intensity: 0.25 })
    });

    expect(oldLight?.parent).toBeNull();
    expect(oldTarget?.parent).toBeNull();
    expect(projector.get("shared")).toBeInstanceOf(AmbientLight);
    expect(projector.getTarget("shared")).toBeUndefined();
    expect(scene.children).not.toContain(oldTarget);
  });
});
