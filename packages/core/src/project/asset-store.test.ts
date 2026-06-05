import { describe, expect, it, vi } from "vitest";
import { ProjectAssetStore } from "./asset-store";

describe("project asset store", () => {
  it("registers transient bytes without leaking them into asset references", async () => {
    const store = new ProjectAssetStore({ createObjectUrl: () => "blob:asset-a" });
    const stored = await store.register({
      asset: { id: "asset-a", kind: "glb", metadata: { durable: true } },
      source: { bytes: new Uint8Array([1, 2, 3]), mimeType: "model/gltf-binary", metadata: { local: true } }
    });

    expect(stored).toMatchObject({
      assetId: "asset-a",
      kind: "glb",
      mimeType: "model/gltf-binary",
      byteSize: 3,
      metadata: { durable: true, local: true }
    });
    expect(store.exportRecord({ id: "asset-a", kind: "glb" }, "assets/asset-a.glb")?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("prefers stored payloads and revokes object urls on replacement and clear", async () => {
    const revoke = vi.fn();
    let nextUrl = 0;
    const store = new ProjectAssetStore({
      createObjectUrl: () => `blob:${++nextUrl}`,
      revokeObjectUrl: revoke
    });

    await store.register({ asset: { id: "asset-a", kind: "glb" }, source: new Uint8Array([1]) });
    expect(store.resolve({ id: "asset-a", kind: "glb" })?.uri).toBe("blob:1");

    await store.register({ asset: { id: "asset-a", kind: "glb" }, source: new Uint8Array([2]) });
    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(store.resolve({ id: "asset-a", kind: "glb" })?.uri).toBe("blob:2");

    store.clear();
    expect(revoke).toHaveBeenCalledWith("blob:2");
  });

  it("reuses an object url until the asset is replaced or cleared", async () => {
    const revoke = vi.fn();
    const createObjectUrl = vi.fn(() => "blob:asset-a");
    const store = new ProjectAssetStore({
      createObjectUrl,
      revokeObjectUrl: revoke
    });

    await store.register({ asset: { id: "asset-a", kind: "glb" }, source: new Uint8Array([1]) });

    expect(store.resolve({ id: "asset-a", kind: "glb" })?.uri).toBe("blob:asset-a");
    expect(store.resolve({ id: "asset-a", kind: "glb" })?.uri).toBe("blob:asset-a");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not resolve payloads for mismatched asset kinds", async () => {
    const store = new ProjectAssetStore({ createObjectUrl: () => "blob:asset-a" });
    await store.register({ asset: { id: "asset-a", kind: "glb" }, source: new Uint8Array([1]) });

    expect(store.resolve({ id: "asset-a", kind: "texture" })).toBeNull();
  });

  it("returns safe payload summaries without bytes, blobs, or object urls", async () => {
    const store = new ProjectAssetStore({ createObjectUrl: () => "blob:asset-a" });
    await store.register({
      asset: { id: "asset-a", kind: "glb", label: "Durable", metadata: { durable: true } },
      source: { bytes: new Uint8Array([1, 2, 3]), mimeType: "model/gltf-binary", label: "Local", metadata: { local: true } }
    });
    store.resolve({ id: "asset-a", kind: "glb" });

    const summaries = store.summaries();

    expect(summaries).toEqual([{
      assetId: "asset-a",
      kind: "glb",
      available: true,
      exportable: true,
      label: "Local",
      mimeType: "model/gltf-binary",
      byteSize: 3,
      checksum: expect.stringMatching(/^fnv1a32-/),
      metadata: { durable: true, local: true }
    }]);
    expect(JSON.stringify(summaries)).not.toContain("blob:");
    expect(JSON.stringify(summaries)).not.toContain("bytes");
    expect(JSON.stringify(summaries)).not.toContain("Blob");
  });

  it("returns safe blob payload summaries without leaking blobs or object urls", async () => {
    const store = new ProjectAssetStore({ createObjectUrl: () => "blob:texture-a" });
    await store.register({
      asset: { id: "texture-a", kind: "texture", label: "Texture" },
      source: { blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), label: "Local Texture" }
    });
    store.resolve({ id: "texture-a", kind: "texture" });

    const summaries = store.summaries();

    expect(summaries).toEqual([{
      assetId: "texture-a",
      kind: "texture",
      available: true,
      exportable: true,
      label: "Local Texture",
      mimeType: "image/png",
      byteSize: 4
    }]);
    expect(JSON.stringify(summaries)).not.toContain("blob:");
    expect(JSON.stringify(summaries)).not.toContain("bytes");
    expect(JSON.stringify(summaries)).not.toContain("Blob");
    expect(JSON.stringify(summaries)).not.toContain("\"uri\"");
  });
});
