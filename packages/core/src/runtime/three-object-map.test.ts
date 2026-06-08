import { Group, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { ThreeObjectMap } from "./three-object-map";

describe("three object map", () => {
  it("resolves imported targets before owner object ancestors for picking", () => {
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const child = new Object3D();
    owner.add(child);

    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });
    objects.set("imported-a", child, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      pickPriority: 30,
      transformable: true,
      pickable: true
    });

    expect(objects.getTargetForObject(child)).toMatchObject({
      nodeId: "imported-a",
      kind: "imported",
      ownerObjectId: "object-a"
    });
    expect(objects.getId(child)).toBe("imported-a");
  });

  it("uses deterministic pick priority when multiple imported targets alias one object", () => {
    const objects = new ThreeObjectMap();
    const child = new Object3D();

    objects.set("imported-node", child, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      pickPriority: 30,
      transformable: false,
      pickable: true
    });
    objects.set("imported-primitive", child, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      source: { kind: "primitive", path: "meshes/0/primitives/0", meshIndex: 0, primitiveIndex: 0 },
      pickPriority: 60,
      transformable: false,
      pickable: true
    });

    expect(objects.getTargetForObject(child)?.nodeId).toBe("imported-primitive");
  });

  it("ignores runtime-only helpers unless they are explicitly linked pick proxies", () => {
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const helper = new Object3D();
    helper.userData.runtimeOnly = true;
    owner.add(helper);
    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });
    objects.markRuntimeOnly(helper);

    expect(objects.getTargetForObject(helper)).toBeUndefined();

    objects.link("object-a", helper);
    expect(objects.getTargetForObject(helper)?.nodeId).toBe("object-a");
  });

  it("allows GLB child extras named runtimeOnly to fall back to owner picking", () => {
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const child = new Object3D();
    child.userData.runtimeOnly = true;
    owner.add(child);
    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });

    expect(objects.getTargetForObject(child)?.nodeId).toBe("object-a");
  });

  it("keeps unlinked runtime-only helpers from falling through to ancestor picking", () => {
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const helper = new Object3D();
    helper.userData.runtimeOnly = true;
    owner.add(helper);
    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });
    objects.markRuntimeOnly(helper);
    objects.link("object-a", helper);

    expect(objects.getTargetForObject(helper)?.nodeId).toBe("object-a");

    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });

    expect(objects.getTargetForObject(helper)).toBeUndefined();
  });

  it("removes stale imported links without breaking owner mappings", () => {
    const objects = new ThreeObjectMap();
    const owner = new Group();
    const child = new Object3D();
    owner.add(child);
    objects.set("object-a", owner, { kind: "object", objectId: "object-a", pickable: true });
    objects.set("imported-a", child, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      pickPriority: 30,
      transformable: true,
      pickable: true
    });

    objects.delete("imported-a");

    expect(objects.getTargetForObject(child)?.nodeId).toBe("object-a");
    expect(objects.getObject("object-a")).toBe(owner);
  });
});
