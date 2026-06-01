import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { getWorldTransform } from "../snapshot/transforms";

describe("group objects command", () => {
  it("groups selected root objects under the primary object and preserves world placement for translation", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [10, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [12, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-c", asset: { id: "asset-c" }, transform: { position: [14, 0, 0] } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b", "object-c"], primaryObjectId: "object-a" });
    const worldBefore = getWorldTransform(editor.getSnapshot(), "object-b").position;
    const undoBeforeGroup = editor.getHistoryState().undoCount;

    const result = editor.dispatch({ type: "group-objects" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-b"].parentId).toBe("object-a");
    expect(result.snapshot.objects["object-c"].parentId).toBe("object-a");
    expect(result.snapshot.objects["object-a"].children).toEqual(["object-b", "object-c"]);
    expect(getWorldTransform(result.snapshot, "object-b").position).toEqual(worldBefore);
    expect(editor.getHistoryState().undoCount).toBe(undoBeforeGroup + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-b"].parentId).toBeNull();
  });

  it("rejects ancestor selections that would make the primary a non-top-level group root", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-b" });
    const before = editor.getSnapshot();

    const result = editor.dispatch({ type: "group-objects" });

    expect(result.ok).toBe(false);
    expect(editor.getSnapshot()).toBe(before);
  });
});
