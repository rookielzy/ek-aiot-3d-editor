import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

describe("project asset replacement", () => {
  it("replaces payload for an existing asset id without retargeting snapshot references", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = await editor.replaceAsset({ assetId: "asset-a", source: new Uint8Array([4, 5, 6]) });

    expect(result.ok).toBe(true);
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    const exported = editor.exportProject();
    expect(exported.ok).toBe(true);
    expect(exported.manifest?.assets["asset-a"].byteSize).toBe(3);
  });

  it("rejects kind mismatches without changing the project store", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1]) } });
    const before = editor.exportProject();

    const result = await editor.replaceAsset({ assetId: "asset-a", kind: "texture", source: new Uint8Array([2]) });

    expect(result.ok).toBe(false);
    expect(editor.exportProject().manifest?.assets["asset-a"].checksum).toBe(before.manifest?.assets["asset-a"].checksum);
  });
});
