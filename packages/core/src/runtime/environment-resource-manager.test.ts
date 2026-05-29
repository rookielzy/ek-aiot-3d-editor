import { Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { EnvironmentResourceManager } from "./environment-resource-manager";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

describe("environment resource manager", () => {
  it("reuses an environment texture within the active projection", async () => {
    const texture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.jpg" })),
      textureLoader: loader
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const token = manager.beginProjection();

    const first = await manager.load({ snapshot, assetId: "texture-a", kind: "texture", role: "background", token });
    const second = await manager.load({ snapshot, assetId: "texture-a", kind: "texture", role: "background", token });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(manager.size).toBe(1);
    expect(texture.dispose).not.toHaveBeenCalled();
  });

  it("returns a structured runtime problem for unresolved environment assets", async () => {
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => null)
    });
    const snapshot = snapshotWithAsset("hdr-a", "hdr");
    const token = manager.beginProjection();

    const result = await manager.load({ snapshot, assetId: "hdr-a", kind: "hdr", role: "environment", token });

    expect(result).toMatchObject({
      ok: false,
      problem: {
        code: "environment-asset-unresolved",
        source: "runtime",
        target: { kind: "environment", assetId: "hdr-a" },
        assetId: "hdr-a",
        recoverability: "user-action",
        display: { title: "Environment asset could not be resolved" },
        metadata: { role: "environment" }
      }
    });
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("disposes stale load results when a newer projection supersedes them", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const staleTexture = createTrackedTexture();
    const currentTexture = createTrackedTexture();
    const loader: RuntimeTextureLoaderAdapter = {
      load: vi
        .fn()
        .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
        .mockResolvedValueOnce(currentTexture)
    };
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.jpg" })),
      textureLoader: loader
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const tokenA = manager.beginProjection();
    const pending = manager.load({ snapshot, assetId: "texture-a", kind: "texture", role: "background", token: tokenA });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loader.load).toHaveBeenCalledTimes(1);
    const tokenB = manager.beginProjection();

    const current = await manager.load({ snapshot, assetId: "texture-a", kind: "texture", role: "background", token: tokenB });
    resolveLoad(staleTexture);
    const stale = await pending;

    expect(current.ok).toBe(true);
    expect(stale).toEqual({ ok: false, stale: true });
    expect(staleTexture.dispose).toHaveBeenCalledTimes(1);
    expect(currentTexture.dispose).not.toHaveBeenCalled();
  });

  it("disposes raw textures, PMREM targets, and PMREM internals on shutdown", async () => {
    const texture = createTrackedTexture();
    const pmremTexture = createTrackedTexture();
    const pmremDispose = vi.fn();
    const adapterDispose = vi.fn();
    const pmrem: RuntimePmremAdapter = {
      fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose: pmremDispose })),
      dispose: adapterDispose
    };
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.hdr" })),
      hdrLoader: { load: vi.fn(async () => texture) },
      pmrem
    });
    const snapshot = snapshotWithAsset("hdr-a", "hdr");
    const token = manager.beginProjection();

    await manager.load({ snapshot, assetId: "hdr-a", kind: "hdr", role: "environment", token, pmrem: true });
    manager.dispose();

    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(pmremDispose).toHaveBeenCalledTimes(1);
    expect(adapterDispose).toHaveBeenCalledTimes(1);
  });

  it("invalidates pending loads on disposal and disposes late results", async () => {
    let resolveLoad: (texture: Texture) => void = () => {};
    const texture = createTrackedTexture();
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.jpg" })),
      textureLoader: {
        load: vi.fn(() => new Promise<Texture>((resolve) => { resolveLoad = resolve; }))
      }
    });
    const snapshot = snapshotWithAsset("texture-a", "texture");
    const token = manager.beginProjection();
    const pending = manager.load({ snapshot, assetId: "texture-a", kind: "texture", role: "background", token });
    await new Promise((resolve) => setTimeout(resolve, 0));

    manager.dispose();
    resolveLoad(texture);
    const result = await pending;

    expect(result).toEqual({ ok: false, stale: true });
    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(manager.size).toBe(0);
  });

  it("reports structured problems when resolution, loading, or PMREM generation fails", async () => {
    const snapshot = snapshotWithAsset("hdr-a", "hdr");
    const resolveFailure = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => { throw new Error("resolver down"); })
    });
    const loadFailure = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.hdr" })),
      hdrLoader: { load: vi.fn(async () => { throw new Error("bad hdr"); }) }
    });
    const pmremFailure = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.hdr" })),
      hdrLoader: { load: vi.fn(async () => new Texture()) },
      pmrem: {
        fromEquirectangular: vi.fn(() => { throw new Error("pmrem failed"); }),
        dispose() {}
      }
    });

    const resolveResult = await resolveFailure.load({
      snapshot,
      assetId: "hdr-a",
      kind: "hdr",
      role: "environment",
      token: resolveFailure.beginProjection()
    });
    const loadResult = await loadFailure.load({
      snapshot,
      assetId: "hdr-a",
      kind: "hdr",
      role: "environment",
      token: loadFailure.beginProjection()
    });
    const pmremResult = await pmremFailure.load({
      snapshot,
      assetId: "hdr-a",
      kind: "hdr",
      role: "environment",
      token: pmremFailure.beginProjection(),
      pmrem: true
    });

    expect(resolveResult).toMatchObject({ ok: false, problem: { code: "environment-asset-resolve-failed", source: "runtime", assetId: "hdr-a" } });
    expect(loadResult).toMatchObject({ ok: false, problem: { code: "environment-asset-load-failed", source: "runtime", assetId: "hdr-a" } });
    expect(pmremResult).toMatchObject({ ok: false, problem: { code: "environment-pmrem-failed", source: "runtime", assetId: "hdr-a" } });
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("reuses resources across repeated projections and releases PMREM when only raw background remains", async () => {
    const texture = createTrackedTexture();
    const pmremDispose = vi.fn();
    const loader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const manager = new EnvironmentResourceManager({
      resolver: new AssetResolverBridge(() => ({ uri: "/env.hdr" })),
      hdrLoader: loader,
      pmrem: {
        fromEquirectangular: vi.fn(() => ({ texture: new Texture(), dispose: pmremDispose })),
        dispose() {}
      }
    });
    const snapshot = snapshotWithAsset("hdr-a", "hdr");
    const firstToken = manager.beginProjection();
    await manager.load({ snapshot, assetId: "hdr-a", kind: "hdr", role: "background", token: firstToken });
    await manager.load({ snapshot, assetId: "hdr-a", kind: "hdr", role: "environment", token: firstToken, pmrem: true });
    manager.releaseUnused(firstToken);

    const secondToken = manager.beginProjection();
    await manager.load({ snapshot, assetId: "hdr-a", kind: "hdr", role: "background", token: secondToken });
    manager.releaseUnused(secondToken);

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(pmremDispose).toHaveBeenCalledTimes(1);
    expect(texture.dispose).not.toHaveBeenCalled();
    expect(manager.size).toBe(1);
  });
});

function createTrackedTexture(): Texture {
  const texture = new Texture();
  vi.spyOn(texture, "dispose");
  return texture;
}

function snapshotWithAsset(assetId: string, kind: SceneSnapshot["assets"][string]["kind"]): SceneSnapshot {
  const snapshot = createEmptySnapshot();
  return {
    ...snapshot,
    assets: {
      [assetId]: { id: assetId, kind }
    }
  };
}
