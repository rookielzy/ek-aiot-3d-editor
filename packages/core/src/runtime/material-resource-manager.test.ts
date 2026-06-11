import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearSRGBColorSpace,
  MirroredRepeatWrapping,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture
} from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { MaterialResourceManager } from "./material-resource-manager";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

describe("material resource manager", () => {
  it("loads and configures texture slot resources as transient runtime textures", async () => {
    const texture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const manager = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: loader
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const token = manager.beginProjection();

    const result = await manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "map",
      textureSlot: {
        assetId: "texture-a",
        colorSpace: "linear",
        uvSet: 1,
        wrapS: "repeat",
        wrapT: "mirrored-repeat",
        magFilter: "nearest",
        minFilter: "linear",
        transform: {
          offset: [0.25, 0.5],
          repeat: [2, 3],
          rotation: 0.75,
          center: [0.5, 0.25]
        }
      },
      token
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.texture : null).toBe(texture);
    expect(texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(texture.channel).toBe(1);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(MirroredRepeatWrapping);
    expect(texture.magFilter).toBe(NearestFilter);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.offset.toArray()).toEqual([0.25, 0.5]);
    expect(texture.repeat.toArray()).toEqual([2, 3]);
    expect(texture.rotation).toBe(0.75);
    expect(texture.center.toArray()).toEqual([0.5, 0.25]);
    expect(JSON.stringify(snapshot)).not.toContain("/base-color.png");
  });

  it("returns structured runtime problems for unresolved, resolve-failed, and load-failed texture slots", async () => {
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const unresolved = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => null)
    });
    const resolveFailure = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => { throw new Error("resolver down"); })
    });
    const loadFailure = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/bad.png" })),
      textureLoader: { load: vi.fn(async () => { throw new Error("bad texture"); }) }
    });

    const unresolvedResult = await unresolved.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: unresolved.beginProjection()
    });
    const resolveResult = await resolveFailure.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "normalMap",
      textureSlot: { assetId: "texture-a" },
      token: resolveFailure.beginProjection()
    });
    const loadResult = await loadFailure.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "roughnessMap",
      textureSlot: { assetId: "texture-a" },
      token: loadFailure.beginProjection()
    });

    expect(unresolvedResult).toMatchObject({
      ok: false,
      problem: {
        code: "material-texture-asset-unresolved",
        source: "runtime",
        target: { kind: "texture-slot", materialId: "material-a", slot: "map", assetId: "texture-a" },
        objectId: "object-a",
        assetId: "texture-a",
        recoverability: "user-action"
      }
    });
    expect(resolveResult).toMatchObject({
      ok: false,
      problem: { code: "material-texture-asset-resolve-failed", source: "runtime", assetId: "texture-a" }
    });
    expect(loadResult).toMatchObject({
      ok: false,
      problem: { code: "material-texture-asset-load-failed", source: "runtime", assetId: "texture-a" }
    });
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("disposes stale load results when a newer material projection supersedes them", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const staleTexture = createTrackedTexture();
    const currentTexture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = {
      load: vi
        .fn()
        .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
        .mockResolvedValueOnce(currentTexture)
    };
    const manager = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: loader
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const oldToken = manager.beginProjection();
    const pending = manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: oldToken
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const newToken = manager.beginProjection();

    const current = await manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: newToken
    });
    resolveLoad(staleTexture);
    const stale = await pending;

    expect(current).toMatchObject({ ok: true });
    expect(stale).toEqual({ ok: false, stale: true });
    expect(staleTexture.dispose).toHaveBeenCalledTimes(1);
    expect(currentTexture.dispose).not.toHaveBeenCalled();
  });

  it("releases unused texture resources and invalidates pending loads on disposal", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const retainedTexture = createTrackedTexture();
    const clearedTexture = createTrackedTexture();
    const lateTexture = createTrackedTexture();
    const manager = new MaterialResourceManager({
      resolver: new AssetResolverBridge((asset) => ({ uri: `/${asset.id}.png` })),
      textureLoader: {
        load: vi
          .fn()
          .mockResolvedValueOnce(retainedTexture)
          .mockResolvedValueOnce(clearedTexture)
          .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
      }
    });
    const snapshot = {
      ...createEmptySnapshot(),
      assets: {
        "texture-a": { id: "texture-a", kind: "texture" },
        "texture-b": { id: "texture-b", kind: "image" }
      }
    } satisfies SceneSnapshot;
    const token = manager.beginProjection();
    await manager.load({ snapshot, materialId: "material-a", objectId: "object-a", slot: "map", textureSlot: { assetId: "texture-a" }, token });
    await manager.load({ snapshot, materialId: "material-a", objectId: "object-a", slot: "normalMap", textureSlot: { assetId: "texture-b" }, token });
    manager.releaseUnused(token);

    const nextToken = manager.beginProjection();
    await manager.load({ snapshot, materialId: "material-a", objectId: "object-a", slot: "map", textureSlot: { assetId: "texture-a" }, token: nextToken });
    manager.releaseUnused(nextToken);
    const pending = manager.load({ snapshot, materialId: "material-a", objectId: "object-a", slot: "emissiveMap", textureSlot: { assetId: "texture-b" }, token: nextToken });
    await new Promise((resolve) => setTimeout(resolve, 0));

    manager.dispose();
    resolveLoad(lateTexture);
    const result = await pending;

    expect(clearedTexture.dispose).toHaveBeenCalledTimes(1);
    expect(retainedTexture.dispose).toHaveBeenCalledTimes(1);
    expect(lateTexture.dispose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, stale: true });
    expect(manager.size).toBe(0);
  });

  it("invalidates pending loads when their owning object is released", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const texture = createTrackedTexture();
    const manager = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/base-color.png" })),
      textureLoader: {
        load: vi.fn(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
      }
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const token = manager.beginProjection();
    const pending = manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    manager.releaseObjects(new Set());
    resolveLoad(texture);
    const result = await pending;

    expect(result).toEqual({ ok: false, stale: true });
    expect(texture.dispose).toHaveBeenCalledTimes(1);
  });

  it("tracks texture resource owners by assignment target while releasing by object", async () => {
    const texture = createTrackedTexture();
    const manager = new MaterialResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/shared.png" })),
      textureLoader: { load: vi.fn(async () => texture) }
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const firstToken = manager.beginProjection();

    await manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      ownerKey: "material-slot:object-a:slot-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: firstToken
    });
    await manager.load({
      snapshot,
      materialId: "material-b",
      objectId: "object-a",
      ownerKey: "material-slot:object-a:slot-b",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: firstToken
    });
    manager.releaseUnused(firstToken);

    const secondToken = manager.beginProjection();
    await manager.load({
      snapshot,
      materialId: "material-a",
      objectId: "object-a",
      ownerKey: "material-slot:object-a:slot-a",
      slot: "map",
      textureSlot: { assetId: "texture-a" },
      token: secondToken
    });
    manager.releaseUnused(secondToken);

    expect(manager.size).toBe(1);
    expect(texture.dispose).not.toHaveBeenCalled();

    manager.releaseObjects(new Set());

    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(manager.size).toBe(0);
  });
});

function createTrackedTexture(): Texture {
  const texture = new Texture();
  vi.spyOn(texture, "dispose");
  return texture;
}

function snapshotWithAsset(assetId: string, kind: SceneSnapshot["assets"][string]["kind"]): SceneSnapshot {
  return {
    ...createEmptySnapshot(),
    assets: {
      [assetId]: { id: assetId, kind }
    }
  };
}
