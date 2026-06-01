import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { isJsonCompatible } from "../snapshot/validation";
import { createClipboardPayload } from "./create-clipboard";

describe("create clipboard payload", () => {
  it("creates a JSON-compatible selected subtree payload without runtime values", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-b" }, material: { color: "#224466" } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });

    const payload = createClipboardPayload(editor.getSnapshot());

    expect(payload.rootObjectIds).toEqual(["object-a"]);
    expect(Object.keys(payload.objects)).toEqual(["object-a", "object-b"]);
    expect(payload.assetIds).toEqual(["asset-a", "asset-b"]);
    expect(payload.materials.assignments["object:object-b"]).toBeTruthy();
    expect(isJsonCompatible(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("Uint8Array");
    expect(JSON.stringify(payload)).not.toContain("runtime");
  });
});
