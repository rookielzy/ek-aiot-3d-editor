import { BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";
import { disposeObjectTree } from "./disposal";
import { MaterialProjector } from "./material-projector";
import type { RuntimeNodeTarget } from "./three-object-map";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

describe("material projector", () => {
  it("keeps material edits snapshot-only until projection applies object-level overrides", async () => {
    const original = new MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    const mesh = new Mesh(new BoxGeometry(), original);
    const root = new Group();
    root.add(mesh);
    const snapshot = snapshotWithMaterial({
      override: {
        color: "#336699",
        roughness: 0.25,
        metalness: 0.75,
        opacity: 0.5,
        transparent: true,
        side: "double",
        emissive: "#101820",
        emissiveIntensity: 1.4,
        envMapIntensity: 2.5
      }
    });
    const serialized = JSON.stringify(snapshot);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(),
      textureLoader: { load: vi.fn() }
    });

    expect(mesh.material).toBe(original);
    await projector.project(snapshot, new Map([["object-a", root]]));

    expect(mesh.material).not.toBe(original);
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
    const projected = mesh.material as MeshStandardMaterial;
    expect(projected.color.getHexString()).toBe("336699");
    expect(projected.roughness).toBe(0.25);
    expect(projected.metalness).toBe(0.75);
    expect(projected.opacity).toBe(0.5);
    expect(projected.transparent).toBe(true);
    expect(projected.side).toBe(DoubleSide);
    expect(projected.emissive.getHexString()).toBe("101820");
    expect(projected.emissiveIntensity).toBe(1.4);
    expect(projected.envMapIntensity).toBe(2.5);
    expect(original.color.getHexString()).toBe("ffffff");
    expect(JSON.stringify(snapshot)).toBe(serialized);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("isolates overrides when two objects share the same GLB material source", async () => {
    const shared = new MeshStandardMaterial({ color: "#ffffff" });
    const meshA = new Mesh(new BoxGeometry(), shared);
    const meshB = new Mesh(new BoxGeometry(), shared);
    const objectA = new Group();
    const objectB = new Group();
    objectA.add(meshA);
    objectB.add(meshB);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });

    await projector.project(snapshotWithMaterial({ override: { color: "#ff0000" } }), new Map([["object-a", objectA], ["object-b", objectB]]));

    expect((meshA.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect(meshA.material).not.toBe(shared);
    expect(meshB.material).toBe(shared);
    expect(shared.color.getHexString()).toBe("ffffff");

    projector.dispose();
    disposeObjectTree(objectA);
    disposeObjectTree(objectB);
  });

  it("applies loaded texture slots and disposes projection-owned textures when slots clear", async () => {
    const texture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    root.add(mesh);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: loader
    });
    const withTexture = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { textures: { map: { assetId: "texture-a" } } }
    });
    const cleared = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: {}
    });

    await projector.project(withTexture, new Map([["object-a", root]]));
    expect((mesh.material as MeshStandardMaterial).map).toBe(texture);

    await projector.project(cleared, new Map([["object-a", root]]));

    expect((mesh.material as MeshStandardMaterial).map).toBeNull();
    expect(texture.dispose).toHaveBeenCalledTimes(1);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("surfaces runtime material problems without serializing resolver or loader failures", async () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    const snapshot = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { textures: { normalMap: { assetId: "texture-a" } } }
    });
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(() => { throw new Error("resolver down"); })
    });

    const problems = await projector.project(snapshot, new Map([["object-a", root]]));

    expect(problems).toMatchObject([{
      code: "material-texture-asset-resolve-failed",
      source: "runtime",
      target: { kind: "texture-slot", materialId: "material:object:object-a", slot: "normalMap", assetId: "texture-a" },
      objectId: "object-a",
      assetId: "texture-a"
    }]);
    expect(snapshot.problems.acknowledged).toEqual({});
    expect(JSON.stringify(snapshot)).not.toContain("resolver down");

    projector.dispose();
    disposeObjectTree(root);
  });

  it("keeps newer material projection authoritative when older texture loads resolve late", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const staleTexture = createTrackedTexture();
    const currentTexture = createTrackedTexture();
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    root.add(mesh);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: {
        load: vi
          .fn()
          .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
          .mockResolvedValueOnce(currentTexture)
      }
    });
    const first = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { color: "#111111", textures: { map: { assetId: "texture-a" } } }
    });
    const second = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { color: "#336699", textures: { map: { assetId: "texture-a" } } }
    });
    const firstProjection = projector.project(first, new Map([["object-a", root]]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await projector.project(second, new Map([["object-a", root]]));
    resolveLoad(staleTexture);
    const staleProblems = await firstProjection;

    expect(staleProblems).toEqual([]);
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe("336699");
    expect((mesh.material as MeshStandardMaterial).map).toBe(currentTexture);
    expect(staleTexture.dispose).toHaveBeenCalledTimes(1);
    expect(currentTexture.dispose).not.toHaveBeenCalled();

    projector.dispose();
    disposeObjectTree(root);
  });

  it("restores source materials and disposes projection-owned clones and textures when objects unload", async () => {
    const sourceMaterial = new MeshStandardMaterial();
    const sourceDispose = vi.spyOn(sourceMaterial, "dispose");
    const texture = createTrackedTexture();
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), sourceMaterial);
    root.add(mesh);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: { load: vi.fn(async () => texture) }
    });
    const snapshot = snapshotWithMaterial({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { textures: { map: { assetId: "texture-a" } } }
    });

    await projector.project(snapshot, new Map([["object-a", root]]));
    const projected = mesh.material as MeshStandardMaterial;
    const projectedDispose = vi.spyOn(projected, "dispose");
    projector.releaseObjects(new Set());

    expect(mesh.material).toBe(sourceMaterial);
    expect(projectedDispose).toHaveBeenCalledTimes(1);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();

    projector.dispose();
    disposeObjectTree(root);
  });

  it("does not replace non-MeshStandard materials for supported object-level overrides", async () => {
    const material = new MeshBasicMaterial({ color: "#ffffff" });
    const mesh = new Mesh(new BoxGeometry(), material);
    const root = new Group();
    root.add(mesh);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });

    await projector.project(snapshotWithMaterial({ override: { color: "#ff0000", side: "front" } }), new Map([["object-a", root]]));

    expect(mesh.material).toBe(material);
    expect(material.color.getHexString()).toBe("ffffff");
    expect(material.side).toBe(FrontSide);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("applies slot-level overrides only to the resolved imported material slot", async () => {
    const firstSource = new MeshStandardMaterial({ color: "#ffffff" });
    const secondSource = new MeshStandardMaterial({ color: "#ffffff" });
    const first = new Mesh(new BoxGeometry(), firstSource);
    const second = new Mesh(new BoxGeometry(), secondSource);
    const root = new Group();
    root.add(first, second);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });
    const snapshot = snapshotWithSlotMaterial({ slotId: SLOT_A, override: { color: "#ff0000" } });

    await projector.project(snapshot, targetEntries(root, [
      importedTarget("primitive-a", first)
    ]));

    expect((first.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect(first.material).not.toBe(firstSource);
    expect(second.material).toBe(secondSource);
    expect(secondSource.color.getHexString()).toBe("ffffff");

    projector.dispose();
    disposeObjectTree(root);
  });

  it("lets slot-level overrides win over object-level overrides for the matched slot only", async () => {
    const first = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
    const second = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
    const root = new Group();
    root.add(first, second);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });
    const snapshot = snapshotWithSlotMaterial({
      slotId: SLOT_B,
      objectOverride: { color: "#ff0000", roughness: 0.2 },
      override: { color: "#0000ff" }
    });

    await projector.project(snapshot, targetEntries(root, [
      importedTarget("primitive-b", second, { primitiveIndex: 1, materialIndex: 1 })
    ]));

    expect((first.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect((first.material as MeshStandardMaterial).roughness).toBe(0.2);
    expect((second.material as MeshStandardMaterial).color.getHexString()).toBe("0000ff");
    expect((second.material as MeshStandardMaterial).roughness).toBe(0.2);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("overrides only the resolved material array index for slot assignments", async () => {
    const firstSource = new MeshStandardMaterial({ color: "#ff0000" });
    const secondSource = new MeshStandardMaterial({ color: "#ffffff" });
    const mesh = new Mesh(new BoxGeometry(), [firstSource, secondSource]);
    const root = new Group();
    root.add(mesh);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });
    const snapshot = snapshotWithSlotMaterial({ slotId: SLOT_B, override: { color: "#0000ff" } });

    await projector.project(snapshot, targetEntries(root, [
      importedTarget("primitive-b", mesh, { primitiveIndex: 1, materialIndex: 1 })
    ]));

    const materials = mesh.material as MeshStandardMaterial[];
    expect(materials[0]).toBe(firstSource);
    expect(materials[1]).not.toBe(secondSource);
    expect(materials[1].color.getHexString()).toBe("0000ff");

    projector.dispose();
    disposeObjectTree(root);
  });

  it("reports non-MeshStandard slot targets without replacing their material", async () => {
    const material = new MeshBasicMaterial({ color: "#ffffff" });
    const mesh = new Mesh(new BoxGeometry(), material);
    const root = new Group();
    root.add(mesh);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });

    const problems = await projector.project(
      snapshotWithSlotMaterial({ slotId: SLOT_A, override: { color: "#ff0000" } }),
      targetEntries(root, [importedTarget("primitive-a", mesh)])
    );

    expect(mesh.material).toBe(material);
    expect(problems).toMatchObject([{
      code: "imported-material-slot-projection-failed",
      target: { kind: "imported-material-slot", slotId: SLOT_A }
    }]);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("reports missing runtime slot targets without describing them as reimport remap failures", async () => {
    const root = new Group();
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });

    const problems = await projector.project(
      snapshotWithSlotMaterial({ slotId: SLOT_A, override: { color: "#ff0000" } }),
      targetEntries(root, [])
    );

    expect(problems).toMatchObject([{
      code: "imported-material-slot-unresolved",
      message: `Imported material slot ${SLOT_A} has no matched runtime target.`,
      display: {
        title: "Imported material slot unavailable",
        actionLabel: "Review imported target"
      },
      metadata: { reason: "runtime-target-missing" }
    }]);
    expect(problems[0]?.message).not.toContain("reimport");

    projector.dispose();
    disposeObjectTree(root);
  });

  it("restores a slot to the object-level projection when the slot assignment is removed", async () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
    const root = new Group();
    root.add(mesh);
    const projector = new MaterialProjector({ resolver: new AssetResolverBridge() });
    const withSlot = snapshotWithSlotMaterial({
      slotId: SLOT_A,
      objectOverride: { color: "#ff0000" },
      override: { color: "#0000ff" }
    });
    const withoutSlot = snapshotWithSlotMaterial({
      slotId: SLOT_A,
      objectOverride: { color: "#ff0000" },
      override: { color: "#0000ff" },
      includeSlotAssignment: false
    });

    await projector.project(withSlot, targetEntries(root, [importedTarget("primitive-a", mesh)]));
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe("0000ff");

    await projector.project(withoutSlot, targetEntries(root, [importedTarget("primitive-a", mesh)]));
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");

    projector.dispose();
    disposeObjectTree(root);
  });

  it("loads texture resources for slot assignments and attributes failures to the slot owner", async () => {
    const texture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const root = new Group();
    root.add(mesh);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge((asset) => asset.id === "texture-a" ? { uri: "/slot.png" } : null),
      textureLoader: loader
    });
    const snapshot = snapshotWithSlotMaterial({
      slotId: SLOT_A,
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      override: { textures: { map: { assetId: "texture-a" } } }
    });

    const problems = await projector.project(snapshot, targetEntries(root, [importedTarget("primitive-a", mesh)]));

    expect(problems).toEqual([]);
    expect((mesh.material as MeshStandardMaterial).map).toBe(texture);

    projector.dispose();
    disposeObjectTree(root);
  });

  it("keeps shared slot texture resources alive until every slot owner releases them", async () => {
    const texture = createTrackedTexture();
    const first = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const second = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const root = new Group();
    root.add(first, second);
    const projector = new MaterialProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/shared.png" })),
      textureLoader: { load: vi.fn(async () => texture) }
    });
    const bothSlots = snapshotWithTwoSlotTextures({ includeFirst: true, includeSecond: true });
    const firstOnly = snapshotWithTwoSlotTextures({ includeFirst: true, includeSecond: false });
    const noSlots = snapshotWithTwoSlotTextures({ includeFirst: false, includeSecond: false });
    const entries = targetEntries(root, [
      importedTarget("primitive-a", first),
      importedTarget("primitive-b", second, { primitiveIndex: 1, materialIndex: 1 })
    ]);

    await projector.project(bothSlots, entries);
    await projector.project(firstOnly, entries);

    expect(texture.dispose).not.toHaveBeenCalled();
    expect((first.material as MeshStandardMaterial).map).toBe(texture);
    expect((second.material as MeshStandardMaterial).map).toBeNull();

    await projector.project(noSlots, entries);

    expect(texture.dispose).toHaveBeenCalledTimes(1);

    projector.dispose();
    disposeObjectTree(root);
  });
});

function createTrackedTexture(): Texture {
  const texture = new Texture();
  vi.spyOn(texture, "dispose");
  return texture;
}

function snapshotWithMaterial(options: {
  assets?: SceneSnapshot["assets"];
  override: SceneSnapshot["materials"]["definitions"][string]["override"];
}): SceneSnapshot {
  return {
    ...createEmptySnapshot(),
    objects: {
      "object-a": {
        id: "object-a",
        name: "Object A",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    rootObjectIds: ["object-a"],
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" },
      ...(options.assets ?? {})
    },
    materials: {
      definitions: {
        "material:object:object-a": {
          id: "material:object:object-a",
          name: "Object A material",
          kind: "mesh-standard",
          override: options.override
        }
      },
      assignments: {
        "object:object-a": {
          id: "object:object-a",
          materialId: "material:object:object-a",
          target: { kind: "object", objectId: "object-a" }
        }
      }
    }
  };
}

const SLOT_A = "glb:object-a/slot:meshes/0/primitives/0:material-0";
const SLOT_B = "glb:object-a/slot:meshes/0/primitives/1:material-1";

function snapshotWithSlotMaterial(options: {
  assets?: SceneSnapshot["assets"];
  slotId: string;
  override: SceneSnapshot["materials"]["definitions"][string]["override"];
  objectOverride?: SceneSnapshot["materials"]["definitions"][string]["override"];
  includeSlotAssignment?: boolean;
}): SceneSnapshot {
  const slotMaterialId = `material:material-slot:object-a:${options.slotId}`;
  const slotAssignmentId = `material-slot:object-a:${options.slotId}`;
  const objectAssignment = options.objectOverride
    ? {
        "object:object-a": {
          id: "object:object-a",
          materialId: "material:object:object-a",
          target: { kind: "object" as const, objectId: "object-a" }
        }
      }
    : {};
  const slotAssignment = options.includeSlotAssignment === false
    ? {}
    : {
        [slotAssignmentId]: {
          id: slotAssignmentId,
          materialId: slotMaterialId,
          target: { kind: "material-slot" as const, objectId: "object-a", slotId: options.slotId }
        }
      };

  return {
    ...createEmptySnapshot(),
    objects: {
      "object-a": {
        id: "object-a",
        name: "Object A",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    nodes: {
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Object A",
        objectId: "object-a",
        parentId: null,
        children: ["primitive-a", "primitive-b"],
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      },
      "primitive-a": importedNode("primitive-a", SLOT_A, 0, 0),
      "primitive-b": importedNode("primitive-b", SLOT_B, 1, 1)
    },
    rootNodeIds: ["object-a"],
    rootObjectIds: ["object-a"],
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" },
      ...(options.assets ?? {})
    },
    materials: {
      definitions: {
        ...(options.objectOverride
          ? {
              "material:object:object-a": {
                id: "material:object:object-a",
                name: "Object A material",
                kind: "mesh-standard" as const,
                override: options.objectOverride
              }
            }
          : {}),
        [slotMaterialId]: {
          id: slotMaterialId,
          name: "Slot material",
          kind: "mesh-standard",
          override: options.override
        }
      },
      assignments: {
        ...objectAssignment,
        ...slotAssignment
      }
    }
  };
}

function snapshotWithTwoSlotTextures(options: { includeFirst: boolean; includeSecond: boolean }): SceneSnapshot {
  const first = snapshotWithSlotMaterial({
    slotId: SLOT_A,
    assets: { "texture-a": { id: "texture-a", kind: "texture" } },
    override: { textures: { map: { assetId: "texture-a" } } },
    includeSlotAssignment: options.includeFirst
  });
  const secondSlotMaterialId = `material:material-slot:object-a:${SLOT_B}`;
  const secondSlotAssignmentId = `material-slot:object-a:${SLOT_B}`;
  return {
    ...first,
    materials: {
      definitions: {
        ...first.materials.definitions,
        [secondSlotMaterialId]: {
          id: secondSlotMaterialId,
          name: "Second slot material",
          kind: "mesh-standard",
          override: { textures: { map: { assetId: "texture-a" } } }
        }
      },
      assignments: {
        ...first.materials.assignments,
        ...(options.includeSecond
          ? {
              [secondSlotAssignmentId]: {
                id: secondSlotAssignmentId,
                materialId: secondSlotMaterialId,
                target: { kind: "material-slot", objectId: "object-a", slotId: SLOT_B }
              }
            }
          : {})
      }
    }
  };
}

function importedNode(
  nodeId: string,
  slotId: string,
  primitiveIndex: number,
  materialIndex: number
): SceneImportedGlbNode {
  return {
    id: nodeId,
    kind: "imported",
    name: `Primitive ${primitiveIndex}`,
    parentId: "object-a",
    children: [],
    ownerObjectId: "object-a",
    importKey: `glb:object-a/primitive:meshes/0/primitives/${primitiveIndex}`,
    source: { kind: "primitive", path: `meshes/0/primitives/${primitiveIndex}`, meshIndex: 0, primitiveIndex },
    materialSlots: [{
      slotKey: slotId,
      label: `Material ${materialIndex}`,
      source: {
        kind: "material-slot",
        path: `meshes/0/primitives/${primitiveIndex}`,
        meshIndex: 0,
        primitiveIndex,
        materialIndex
      }
    }]
  };
}

function targetEntries(root: Object3D, imported: RuntimeNodeTarget[]): [string, RuntimeNodeTarget][] {
  return [
    ["object-a", {
      nodeId: "object-a",
      kind: "object",
      object: root,
      objectId: "object-a",
      transformable: true,
      pickable: true
    }],
    ...imported.map((target): [string, RuntimeNodeTarget] => [target.nodeId, target])
  ];
}

function importedTarget(
  nodeId: string,
  object: Object3D,
  options: { primitiveIndex?: number; materialIndex?: number } = {}
): RuntimeNodeTarget {
  const primitiveIndex = options.primitiveIndex ?? 0;
  return {
    nodeId,
    kind: "imported",
    object,
    ownerObjectId: "object-a",
    importKey: `glb:object-a/primitive:meshes/0/primitives/${primitiveIndex}`,
    source: {
      kind: "primitive",
      path: `meshes/0/primitives/${primitiveIndex}`,
      meshIndex: 0,
      primitiveIndex,
      ...(options.materialIndex !== undefined ? { materialIndex: options.materialIndex } : {})
    },
    matchStatus: "matched",
    transformable: false,
    pickable: true
  };
}
