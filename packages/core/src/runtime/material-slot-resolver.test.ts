import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { createEmptySnapshot, createTransform } from "../snapshot/defaults";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import type { RuntimeNodeTarget } from "./three-object-map";
import { resolveMaterialSlotTarget } from "./material-slot-resolver";

describe("runtime material slot resolver", () => {
  it("resolves a durable slot assignment to an imported primitive runtime mesh", () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const snapshot = snapshotWithImportedSlot();
    const result = resolveMaterialSlotTarget(
      snapshot,
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      [runtimeTarget(mesh)]
    );

    expect(result).toMatchObject({
      status: "resolved",
      ownerObjectId: "object-a",
      node: { id: "primitive-a", importKey: "glb:object-a/primitive:meshes/0/primitives/0" },
      slot: { slotKey: SLOT_ID },
      mesh
    });
  });

  it("returns material array index when a slot points at an indexed material on the runtime mesh", () => {
    const mesh = new Mesh(new BoxGeometry(), [
      new MeshStandardMaterial({ color: "#ff0000" }),
      new MeshStandardMaterial({ color: "#0000ff" })
    ]);
    const snapshot = snapshotWithImportedSlot({
      slot: {
        source: {
          kind: "material-slot",
          path: "meshes/0/primitives/1",
          meshIndex: 0,
          primitiveIndex: 1,
          materialIndex: 1
        }
      }
    });

    const result = resolveMaterialSlotTarget(
      snapshot,
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      [runtimeTarget(mesh)]
    );

    expect(result).toMatchObject({
      status: "resolved",
      mesh,
      materialIndex: 1
    });
  });

  it("returns unresolved state from matched remap metadata without throwing", () => {
    const snapshot = snapshotWithImportedSlot({
      node: {
        materialSlots: [],
        remap: {
          status: "resolved",
          previousImportKey: "glb:object-a/primitive:legacy",
          metadata: { unresolvedMaterialSlots: [SLOT_ID] }
        }
      }
    });

    const result = resolveMaterialSlotTarget(
      snapshot,
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      []
    );

    expect(result).toMatchObject({
      status: "unresolved",
      reason: "slot-missing",
      node: { id: "primitive-a" },
      slotId: SLOT_ID
    });
  });

  it("returns unresolved when the imported slot descriptor exists but no runtime target is registered", () => {
    const result = resolveMaterialSlotTarget(
      snapshotWithImportedSlot(),
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      []
    );

    expect(result).toMatchObject({
      status: "unresolved",
      reason: "runtime-target-missing",
      node: { id: "primitive-a" }
    });
  });

  it("returns non-projectable when the runtime target cannot supply a mesh", () => {
    const group = new Group();
    const result = resolveMaterialSlotTarget(
      snapshotWithImportedSlot(),
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      [runtimeTarget(group)]
    );

    expect(result).toMatchObject({
      status: "non-projectable",
      reason: "target-not-mesh",
      runtimeObject: group
    });
  });

  it("returns non-projectable when a material array slot cannot resolve an array index", () => {
    const mesh = new Mesh(new BoxGeometry(), [
      new MeshStandardMaterial({ color: "#ff0000" }),
      new MeshStandardMaterial({ color: "#0000ff" })
    ]);
    const snapshot = snapshotWithImportedSlot({
      slot: {
        source: {
          kind: "material-slot",
          path: "meshes/0/primitives/4",
          meshIndex: 0,
          primitiveIndex: 4,
          materialIndex: 9
        }
      }
    });

    const result = resolveMaterialSlotTarget(
      snapshot,
      { kind: "material-slot", objectId: "object-a", slotId: SLOT_ID },
      [runtimeTarget(mesh)]
    );

    expect(result).toMatchObject({
      status: "non-projectable",
      reason: "material-index-missing"
    });
  });
});

const SLOT_ID = "glb:object-a/slot:meshes/0/primitives/0:material-0";

function snapshotWithImportedSlot(options: {
  node?: Partial<SceneImportedGlbNode>;
  slot?: Partial<NonNullable<SceneImportedGlbNode["materialSlots"]>[number]>;
} = {}): SceneSnapshot {
  const slot = {
    slotKey: SLOT_ID,
    label: "Red",
    source: {
      kind: "material-slot" as const,
      path: "meshes/0/primitives/0",
      meshIndex: 0,
      primitiveIndex: 0,
      materialIndex: 0
    },
    ...options.slot
  };
  const node: SceneImportedGlbNode = {
    id: "primitive-a",
    kind: "imported",
    name: "Primitive",
    parentId: "object-a",
    children: [],
    ownerObjectId: "object-a",
    importKey: "glb:object-a/primitive:meshes/0/primitives/0",
    source: { kind: "primitive", path: "meshes/0/primitives/0", meshIndex: 0, primitiveIndex: 0 },
    materialSlots: [slot],
    ...options.node
  };

  return {
    ...createEmptySnapshot("scene-a"),
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" }
    },
    objects: {
      "object-a": {
        id: "object-a",
        name: "Object A",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: createTransform()
      }
    },
    nodes: {
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Object A",
        objectId: "object-a",
        parentId: null,
        children: ["primitive-a"],
        transform: createTransform()
      },
      "primitive-a": node
    },
    rootNodeIds: ["object-a"],
    rootObjectIds: ["object-a"]
  };
}

function runtimeTarget(object: Group | Mesh): RuntimeNodeTarget {
  return {
    nodeId: "primitive-a",
    kind: "imported",
    object,
    ownerObjectId: "object-a",
    importKey: "glb:object-a/primitive:meshes/0/primitives/0",
    source: { kind: "primitive", path: "meshes/0/primitives/0", meshIndex: 0, primitiveIndex: 0 },
    matchStatus: "matched",
    transformable: false,
    pickable: true
  };
}
