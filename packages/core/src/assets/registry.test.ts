import { describe, expect, it } from "vitest";
import { AssetRegistry } from "./registry";

describe("asset registry", () => {
  it("creates stable JSON-compatible asset references", () => {
    const registry = new AssetRegistry();
    const fileLike = { name: "box.glb", arrayBuffer: () => new ArrayBuffer(0) };

    const reference = registry.register({
      id: "asset-a",
      label: "Box",
      source: fileLike,
      metadata: { size: 123 }
    });

    expect(reference).toEqual({
      id: "asset-a",
      kind: "glb",
      label: "Box",
      metadata: { size: 123 }
    });
    expect(registry.get("asset-a")?.source).toBe(fileLike);
  });

  it("rejects unsupported asset kinds without registering them", () => {
    const registry = new AssetRegistry();

    expect(() => registry.register({ id: "bad", kind: "video" as unknown as never })).toThrow("Unsupported asset kind");
    expect(registry.get("bad")).toBeUndefined();
  });

  it("rejects non-string labels without registering them", () => {
    const registry = new AssetRegistry();

    expect(() => registry.register({ id: "bad-label", label: 123 as unknown as string })).toThrow("Asset label");
    expect(registry.get("bad-label")).toBeUndefined();
  });
});
