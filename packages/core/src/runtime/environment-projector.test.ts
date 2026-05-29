import { Color, Scene, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import { EnvironmentProjector } from "./environment-projector";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

describe("environment projector", () => {
  it("projects solid background color without mutating the serialized snapshot", async () => {
    const scene = new Scene();
    const projector = new EnvironmentProjector({
      scene,
      resolver: new AssetResolverBridge()
    });
    const snapshot = {
      ...createEmptySnapshot(),
      environment: {
        ...createEmptySnapshot().environment,
        mode: "solid",
        background: { mode: "solid", color: "#202530", intensity: 0.8 }
      }
    } satisfies SceneSnapshot;
    const before = JSON.stringify(snapshot);

    const problems = await projector.project(snapshot);

    expect(problems).toEqual([]);
    expect(scene.background).toBeInstanceOf(Color);
    expect((scene.background as Color).getHexString()).toBe("202530");
    expect(scene.backgroundIntensity).toBe(0.8);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("projects HDR environment lighting through PMREM with intensity and rotation", async () => {
    const scene = new Scene();
    const rawTexture = new Texture();
    const pmremTexture = new Texture();
    const pmrem: RuntimePmremAdapter = {
      fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose() {} })),
      dispose() {}
    };
    const projector = new EnvironmentProjector({
      scene,
      resolver: new AssetResolverBridge(() => ({ uri: "/studio.hdr" })),
      hdrLoader: { load: vi.fn(async () => rawTexture) },
      pmrem
    });
    const snapshot = snapshotWithEnvironment({
      assets: { "hdr-a": { id: "hdr-a", kind: "hdr" } },
      environment: {
        mode: "hdr",
        background: { mode: "none" },
        environment: { assetId: "hdr-a", intensity: 1.5, rotation: { x: 0.1, y: 0.2, z: 0.3 } }
      }
    });

    const problems = await projector.project(snapshot);

    expect(problems).toEqual([]);
    expect(pmrem.fromEquirectangular).toHaveBeenCalledWith(rawTexture);
    expect(scene.environment).toBe(pmremTexture);
    expect(scene.environmentIntensity).toBe(1.5);
    expect(scene.environmentRotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
  });

  it("projects a shared HDR background and environment without duplicate loads", async () => {
    const scene = new Scene();
    const rawTexture = new Texture();
    const pmremTexture = new Texture();
    const hdrLoader = { load: vi.fn(async () => rawTexture) };
    const projector = new EnvironmentProjector({
      scene,
      resolver: new AssetResolverBridge(() => ({ uri: "/studio.hdr" })),
      hdrLoader,
      pmrem: {
        fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose() {} })),
        dispose() {}
      }
    });
    const snapshot = snapshotWithEnvironment({
      assets: { "hdr-a": { id: "hdr-a", kind: "hdr" } },
      environment: {
        mode: "hdr",
        background: { mode: "hdr", assetId: "hdr-a", intensity: 0.7, blur: 0.2 },
        environment: { assetId: "hdr-a", intensity: 1.5, rotation: { x: 0, y: 1, z: 0 } }
      }
    });

    const problems = await projector.project(snapshot);

    expect(problems).toEqual([]);
    expect(hdrLoader.load).toHaveBeenCalledTimes(1);
    expect(scene.background).toBe(rawTexture);
    expect(scene.environment).toBe(pmremTexture);
    expect(scene.backgroundIntensity).toBe(0.7);
    expect(scene.backgroundBlurriness).toBe(0.2);
    expect(scene.environmentIntensity).toBe(1.5);
  });

  it("projects texture backgrounds with intensity, blur, and rotation", async () => {
    const scene = new Scene();
    const texture = new Texture();
    const textureLoader: RuntimeTextureLoaderAdapter = { load: vi.fn(async () => texture) };
    const projector = new EnvironmentProjector({
      scene,
      resolver: new AssetResolverBridge(() => ({ uri: "/sky.jpg" })),
      textureLoader
    });
    const snapshot = snapshotWithEnvironment({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      environment: {
        mode: "none",
        background: { mode: "texture", assetId: "texture-a", intensity: 0.4, blur: 0.25, rotation: { x: 0, y: 1, z: 0 } },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });

    await projector.project(snapshot);

    expect(scene.background).toBe(texture);
    expect(scene.backgroundIntensity).toBe(0.4);
    expect(scene.backgroundBlurriness).toBe(0.25);
    expect(scene.backgroundRotation.toArray().slice(0, 3)).toEqual([0, 1, 0]);
  });

  it("clears assignments and releases stale resources when switching to none", async () => {
    const scene = new Scene();
    const texture = new Texture();
    vi.spyOn(texture, "dispose");
    const projector = new EnvironmentProjector({
      scene,
      resolver: new AssetResolverBridge(() => ({ uri: "/sky.jpg" })),
      textureLoader: { load: vi.fn(async () => texture) }
    });
    const withTexture = snapshotWithEnvironment({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      environment: {
        mode: "none",
        background: { mode: "texture", assetId: "texture-a" },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    const empty = snapshotWithEnvironment({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      environment: {
        mode: "none",
        background: { mode: "none" },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });

    await projector.project(withTexture);
    await projector.project(empty);

    expect(scene.background).toBeNull();
    expect(scene.environment).toBeNull();
    expect(texture.dispose).toHaveBeenCalledTimes(1);
  });

  it("surfaces derived problems for missing environment assets without mutating snapshot state", async () => {
    const projector = new EnvironmentProjector({
      scene: new Scene(),
      resolver: new AssetResolverBridge(() => null)
    });
    const snapshot = snapshotWithEnvironment({
      assets: { "hdr-a": { id: "hdr-a", kind: "hdr" } },
      environment: {
        mode: "hdr",
        background: { mode: "none" },
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });

    const problems = await projector.project(snapshot);

    expect(problems).toMatchObject([{ code: "environment-asset-unresolved", assetId: "hdr-a" }]);
    expect(snapshot.environment.environment.assetId).toBe("hdr-a");
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("keeps the newer projection authoritative when an older environment load resolves late", async () => {
    let resolveSlowLoad: (texture: Texture) => void = () => {};
    const staleTexture = new Texture();
    vi.spyOn(staleTexture, "dispose");
    const currentTexture = new Texture();
    const projector = new EnvironmentProjector({
      scene: new Scene(),
      resolver: new AssetResolverBridge(() => ({ uri: "/sky.jpg" })),
      textureLoader: {
        load: vi
          .fn()
          .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveSlowLoad = resolve; }))
          .mockResolvedValueOnce(currentTexture)
      }
    });
    const first = snapshotWithEnvironment({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      environment: {
        mode: "none",
        background: { mode: "texture", assetId: "texture-a", intensity: 0.2 },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    const second = snapshotWithEnvironment({
      assets: { "texture-a": { id: "texture-a", kind: "texture" } },
      environment: {
        mode: "none",
        background: { mode: "texture", assetId: "texture-a", intensity: 0.8 },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    const firstProjection = projector.project(first);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await projector.project(second);
    resolveSlowLoad(staleTexture);
    const staleProblems = await firstProjection;

    expect(staleProblems).toEqual([]);
    expect(projector.resourceCount).toBe(1);
    expect(staleTexture.dispose).toHaveBeenCalledTimes(1);
  });
});

function snapshotWithEnvironment(partial: Pick<SceneSnapshot, "assets" | "environment">): SceneSnapshot {
  return {
    ...createEmptySnapshot(),
    assets: partial.assets,
    environment: partial.environment
  };
}
