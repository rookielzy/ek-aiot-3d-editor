import { DirectionalLight, Object3D, PointLight } from "three";
import { describe, expect, it } from "vitest";
import { IDLE_VIEWPORT_SNAP_FEEDBACK, type ViewportHelperVisibility } from "../editor/viewport-helper-state";
import { ThreeObjectMap } from "./three-object-map";
import { RuntimeLightHelpers } from "./light-helpers";

describe("runtime light helpers", () => {
  it("creates runtime-only light gizmos, target helpers, and shadow camera helpers", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const light = new DirectionalLight("#ffffff", 1);
    const target = new Object3D();
    light.target = target;
    light.castShadow = true;
    light.position.set(1, 2, 3);
    target.position.set(4, 5, 6);
    objects.set("sun-node", light, {
      kind: "light",
      lightId: "sun",
      transformable: true,
      pickable: true
    });
    const helpers = new RuntimeLightHelpers(scene, objects);

    helpers.setState(createState({
      lightGizmos: true,
      lightTargets: true,
      shadowCameras: true
    }));

    expect(scene.children.map((child) => child.userData.lightHelper).sort()).toEqual([
      "lightGizmos",
      "lightTargets",
      "shadowCameras"
    ]);
    expect(scene.children.every((child) => child.userData.runtimeOnly)).toBe(true);
    expect(scene.children.every((child) => objects.getTargetForObject(child) === undefined)).toBe(true);
    expect(helpers.size).toBe(3);

    helpers.dispose();

    expect(scene.children).toHaveLength(0);
  });

  it("updates and disposes helpers from visibility and shadow state", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const light = new PointLight("#ffffff", 1);
    light.castShadow = true;
    objects.set("point-node", light, {
      kind: "light",
      lightId: "point",
      transformable: true,
      pickable: true
    });
    const helpers = new RuntimeLightHelpers(scene, objects);

    helpers.setState(createState({ lightGizmos: true, shadowCameras: true }));
    expect(scene.children.map((child) => child.userData.lightHelper).sort()).toEqual(["lightGizmos", "shadowCameras"]);

    light.castShadow = false;
    helpers.sync();
    expect(scene.children.map((child) => child.userData.lightHelper)).toEqual(["lightGizmos"]);

    helpers.setState(createState({ lightGizmos: false, shadowCameras: false }));
    expect(scene.children).toHaveLength(0);
  });

  it("removes helpers when the owning light target is gone", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const light = new PointLight("#ffffff", 1);
    objects.set("point-node", light, {
      kind: "light",
      lightId: "point",
      transformable: true,
      pickable: true
    });
    const helpers = new RuntimeLightHelpers(scene, objects);

    helpers.setState(createState({ lightGizmos: true }));
    expect(scene.children).toHaveLength(1);

    objects.delete("point-node");
    helpers.sync();

    expect(scene.children).toHaveLength(0);
    expect(helpers.size).toBe(0);
  });
});

function createState(patch: Partial<ViewportHelperVisibility>) {
  return {
    visibility: {
      grid: false,
      floor: false,
      axes: false,
      selectionBounds: false,
      hover: false,
      snapFeedback: false,
      lightGizmos: false,
      lightTargets: false,
      shadowCameras: false,
      ...patch
    },
    hoverNodeId: null,
    snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
  };
}
