import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

describe("reparent object command", () => {
  it("rejects cycles when reparenting under a descendant", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    const before = editor.getSnapshot();

    const result = editor.dispatch({ type: "reparent-object", objectId: "object-a", parentId: "object-b" });

    expect(result.ok).toBe(false);
    expect(editor.getSnapshot()).toBe(before);
  });
});
