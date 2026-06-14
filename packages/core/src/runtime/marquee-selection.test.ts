import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { RuntimeMarqueeSelection } from "./marquee-selection";
import { ThreeObjectMap } from "./three-object-map";

describe("runtime marquee selection", () => {
  it("selects pickable targets intersecting a viewport rectangle in deterministic screen order", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const topLeft = createBox(-1, 0.7, 0);
    const bottomRight = createBox(1, -0.7, 0);
    const outside = createBox(4, 0, 0);

    objects.set("object-b", bottomRight, { kind: "object", objectId: "object-b", pickable: true });
    objects.set("object-a", topLeft, { kind: "object", objectId: "object-a", pickable: true });
    objects.set("object-c", outside, { kind: "object", objectId: "object-c", pickable: true });

    const result = select(camera, objects, { left: 40, top: 35, right: 160, bottom: 165, width: 120, height: 130 });

    expect(result.nodeIds).toEqual(["object-a", "object-b"]);
    expect(result.primaryNodeId).toBe("object-a");
  });

  it("treats reversed rectangles the same as forward rectangles", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    objects.set("object-a", createBox(0, 0, 0), { kind: "object", objectId: "object-a", pickable: true });

    const forward = select(camera, objects, { left: 80, top: 80, right: 120, bottom: 120, width: 40, height: 40 });
    const reversed = select(camera, objects, { left: 120, top: 120, right: 80, bottom: 80, width: -40, height: -40 });

    expect(reversed.nodeIds).toEqual(forward.nodeIds);
  });

  it("uses object position fallback for empty group targets", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const group = new Group();
    group.position.set(0, 0, 0);
    objects.set("group-a", group, { kind: "group", pickable: true });

    const result = select(camera, objects, { left: 90, top: 90, right: 110, bottom: 110, width: 20, height: 20 });

    expect(result.nodeIds).toEqual(["group-a"]);
  });

  it("excludes helpers, problem targets, non-pickable targets, and targets outside the frustum", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const helper = createBox(0, 0, 0);
    helper.userData.runtimeOnly = true;
    const problem = createBox(0, 0, 0);
    problem.userData.problem = true;

    objects.set("helper-a", helper, { kind: "object", objectId: "helper-a", pickable: true });
    objects.set("problem-a", problem, { kind: "object", objectId: "problem-a", pickable: true });
    objects.set("disabled-a", createBox(0, 0, 0), { kind: "object", objectId: "disabled-a", pickable: false });
    objects.set("behind-a", createBox(0, 0, 12), { kind: "object", objectId: "behind-a", pickable: true });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual([]);
  });

  it("keeps the highest-priority target for shared imported/object mappings", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const mesh = createBox(0, 0, 0);

    objects.set("object-a", mesh, { kind: "object", objectId: "object-a", pickable: true, pickPriority: 10 });
    objects.set("imported-a", mesh, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      transformable: true,
      pickable: true,
      pickPriority: 30
    });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual(["imported-a"]);
  });

  it("keeps the more specific child target when owner and imported targets overlap", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const child = createBox(0, 0, 0);
    owner.add(child);

    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true, pickPriority: 10 });
    objects.set("imported-a", child, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      transformable: true,
      pickable: true,
      pickPriority: 20
    });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual(["imported-a"]);
  });

  it("keeps child object targets instead of selecting their broad group ancestor", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const group = new Group();
    const child = createBox(0, 0, 0);
    group.add(child);

    objects.set("group-a", group, { kind: "group", pickable: true, pickPriority: 5 });
    objects.set("object-a", child, { kind: "object", objectId: "object-a", pickable: true, pickPriority: 10 });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual(["object-a"]);
  });

  it("excludes hidden targets and targets under hidden parents", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();
    const hidden = createBox(0, 0, 0);
    hidden.visible = false;
    const hiddenParent = new Group();
    hiddenParent.visible = false;
    const child = createBox(0, 0, 0);
    hiddenParent.add(child);

    objects.set("hidden-a", hidden, { kind: "object", objectId: "hidden-a", pickable: true });
    objects.set("child-a", child, { kind: "object", objectId: "child-a", pickable: true });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual([]);
  });

  it("orders equal screen positions by pick priority before stable node ID", () => {
    const camera = createCamera();
    const objects = new ThreeObjectMap();

    objects.set("object-b", createBox(0, 0, 0), { kind: "object", objectId: "object-b", pickable: true, pickPriority: 10 });
    objects.set("light-a", createBox(0, 0, 0), { kind: "light", lightId: "light-a", pickable: true, pickPriority: 20 });
    objects.set("object-a", createBox(0, 0, 0), { kind: "object", objectId: "object-a", pickable: true, pickPriority: 10 });

    const result = select(camera, objects, { left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });

    expect(result.nodeIds).toEqual(["light-a", "object-a", "object-b"]);
  });
});

function select(camera: PerspectiveCamera, objects: ThreeObjectMap, rect: Parameters<RuntimeMarqueeSelection["select"]>[0]) {
  return new RuntimeMarqueeSelection({
    camera,
    objects,
    viewport: { width: 200, height: 200 }
  }).select(rect);
}

function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

function createBox(x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return mesh;
}
