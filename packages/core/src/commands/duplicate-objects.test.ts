import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

describe("duplicate objects command", () => {
  it("duplicates the current selection as one undoable operation", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const undoBeforeDuplicate = editor.getHistoryState().undoCount;

    const result = editor.dispatch({
      type: "duplicate-objects",
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-copy-a"].asset.id).toBe("asset-a");
    expect(result.snapshot.selection).toEqual({ objectId: "object-copy-a", objectIds: ["object-copy-a"] });
    expect(editor.getHistoryState().undoCount).toBe(undoBeforeDuplicate + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeTruthy();
  });
});
