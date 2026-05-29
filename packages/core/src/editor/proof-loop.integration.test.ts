import { describe, expect, it } from "vitest";
import { createEditor } from "./create-editor";

describe("proof-loop integration contract", () => {
  it("serializes a stable asset reference, object identity, and transform after GLB import", () => {
    const editor = createEditor();

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Simple box" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 2, 3] } });
    const saved = editor.serialize();

    expect(saved.assets["asset-a"]).toEqual({ id: "asset-a", kind: "glb", label: "Simple box" });
    expect(saved.objects["object-a"].asset.id).toBe("asset-a");
    expect(saved.objects["object-a"].transform.position).toEqual([1, 2, 3]);
  });
});
