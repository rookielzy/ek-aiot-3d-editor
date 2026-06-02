import { BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { disposeObjectTree } from "./disposal";
import { MaterialProjector } from "./material-projector";
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
