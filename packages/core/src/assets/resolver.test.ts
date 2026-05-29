import { describe, expect, it } from "vitest";
import { ProjectAssetStore } from "../project/asset-store";
import { AssetResolverBridge } from "./resolver";

describe("asset resolver bridge", () => {
  it("uses host-provided resolution without persisting resolver output", async () => {
    const bridge = new AssetResolverBridge((asset) => ({
      uri: `/assets/${asset.id}.glb`,
      metadata: { token: "runtime-only" }
    }));

    await expect(bridge.resolve({ id: "asset-a", kind: "glb" })).resolves.toEqual({
      uri: "/assets/asset-a.glb",
      metadata: { token: "runtime-only" }
    });
  });

  it("creates a problem for unresolved assets", async () => {
    const bridge = new AssetResolverBridge(() => null);

    await expect(bridge.problemForMissing({ id: "asset-a", kind: "glb" }, "object-a")).resolves.toMatchObject({
      code: "asset-unresolved",
      assetId: "asset-a",
      target: { kind: "object", objectId: "object-a" },
      recoverability: "user-action"
    });
  });

  it("prefers packaged project payloads before host-provided resolution", async () => {
    const store = new ProjectAssetStore({ createObjectUrl: () => "blob:packaged" });
    await store.register({ asset: { id: "asset-a", kind: "glb" }, source: new Uint8Array([1]) });
    const bridge = new AssetResolverBridge(() => ({ uri: "/host.glb" }), store);

    await expect(bridge.resolve({ id: "asset-a", kind: "glb" })).resolves.toMatchObject({
      uri: "blob:packaged",
      metadata: expect.objectContaining({ packageAsset: true })
    });
  });
});
