import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { getWorldTransform } from "../snapshot/transforms";

describe("ungroup objects command", () => {
  it("moves children to the group parent while preserving world placement", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [10, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a", transform: { position: [2, 0, 0] } });
    const worldBefore = getWorldTransform(editor.getSnapshot(), "object-b").position;
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const undoBeforeUngroup = editor.getHistoryState().undoCount;

    const result = editor.dispatch({ type: "ungroup-objects" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-b"].parentId).toBeNull();
    expect(result.snapshot.objects["object-a"].children).toEqual([]);
    expect(getWorldTransform(result.snapshot, "object-b").position).toEqual(worldBefore);
    expect(result.snapshot.selection).toEqual({ objectId: "object-b", objectIds: ["object-b"] });
    expect(editor.getHistoryState().undoCount).toBe(undoBeforeUngroup + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-b"].parentId).toBe("object-a");
  });
});
