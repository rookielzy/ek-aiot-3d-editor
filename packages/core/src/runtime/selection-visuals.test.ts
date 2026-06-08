import { Mesh, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { RuntimeSelectionVisuals } from "./selection-visuals";
import { ThreeObjectMap } from "./three-object-map";

describe("runtime selection visuals", () => {
  it("uses target selection state when imported targets alias one runtime object", () => {
    const scene = new Object3D();
    const objects = new ThreeObjectMap();
    const shared = new Mesh(undefined, new MeshBasicMaterial());
    objects.set("imported-node", shared, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      pickPriority: 30,
      selected: false,
      primarySelected: false,
      transformable: false,
      pickable: true
    });
    objects.set("imported-primitive", shared, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      source: { kind: "primitive", path: "meshes/0/primitives/0", meshIndex: 0, primitiveIndex: 0 },
      pickPriority: 60,
      selected: true,
      primarySelected: true,
      transformable: false,
      pickable: true
    });

    shared.userData.selected = false;
    shared.userData.primarySelected = false;

    const visuals = new RuntimeSelectionVisuals(scene, objects, {
      enabled: true,
      selectedColor: 0x4f8cff,
      primarySelectedColor: 0xffc247
    });

    expect(visuals.sync()).toBe(true);
    expect(visuals.size).toBe(1);
    expect(scene.children.map((object) => object.userData.sceneNodeId)).toEqual(["imported-primitive"]);

    visuals.dispose();
  });
});
