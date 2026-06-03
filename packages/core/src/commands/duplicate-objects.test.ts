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
    expect(result.snapshot.selection).toEqual({ nodeId: "object-copy-a", nodeIds: ["object-copy-a"], objectId: "object-copy-a", objectIds: ["object-copy-a"] });
    expect(editor.getHistoryState().undoCount).toBe(undoBeforeDuplicate + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeTruthy();
  });

  it("preserves legacy object-only duplicate behavior when object IDs are provided", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", parentId: "group-a", asset: { id: "asset-a" } });

    const result = editor.dispatch({
      type: "duplicate-objects",
      objectIds: ["object-a"],
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["group-a"]).toMatchObject({ kind: "group", children: ["object-a"] });
    expect(result.snapshot.nodes["object-copy-a"]).toMatchObject({ kind: "object", objectId: "object-copy-a", parentId: null });
    expect(result.snapshot.rootNodeIds).toEqual(["group-a", "object-copy-a"]);
  });
});
