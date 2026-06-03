import { describe, expect, it } from "vitest";
import { createEditor } from "./create-editor";

describe("advanced editor operations", () => {
  it("routes copy, paste, duplicate, delete, group, and ungroup through core commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });

    const payload = editor.operations.copy();
    expect(payload?.rootObjectIds).toEqual(["object-a", "object-b"]);
    expect(editor.operations.canPaste()).toBe(true);

    expect(editor.operations.paste({
      ...payload!,
      assetIds: ["asset-a", "asset-b"]
    }).ok).toBe(true);
    expect(editor.operations.duplicate(["object-a"]).ok).toBe(true);
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });
    expect(editor.operations.group(["object-a", "object-b"]).ok).toBe(true);
    expect(editor.operations.ungroup("object-a").ok).toBe(true);
    expect(editor.operations.delete(["object-b"]).ok).toBe(true);
    expect(editor.getSnapshot().objects["object-b"]).toBeUndefined();
  });

  it("clears clipboard on restore", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.operations.copy();
    expect(editor.operations.canPaste()).toBe(true);

    editor.restore(editor.serialize());

    expect(editor.operations.canPaste()).toBe(false);
  });

  it("does not retain an empty selection clipboard payload", () => {
    const editor = createEditor();

    expect(editor.operations.copy()).toBeNull();
    expect(editor.operations.canPaste()).toBe(false);
    expect(editor.operations.paste().ok).toBe(false);
  });

  it("selects and clears all scene nodes through advanced operations", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });

    expect(editor.operations.selectAll().ok).toBe(true);
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", "ambient-a"]);
    expect(editor.getSnapshot().selection.objectIds).toEqual(["object-a"]);

    expect(editor.operations.clearSelection().ok).toBe(true);
    expect(editor.getSnapshot().selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });
});
