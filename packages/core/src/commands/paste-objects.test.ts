import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { createClipboardPayload } from "../clipboard/create-clipboard";

describe("paste objects command", () => {
  it("pastes cloned subtrees with fresh IDs, shared assets, isolated material assignments, and one history entry", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#111111" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const payload = createClipboardPayload(editor.getSnapshot());
    const undoBeforePaste = editor.getHistoryState().undoCount;

    const result = editor.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: {
        "object-a": "object-copy-a",
        "object-b": "object-copy-b"
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-copy-a"].asset.id).toBe("asset-a");
    expect(result.snapshot.objects["object-copy-b"].parentId).toBe("object-copy-a");
    expect(result.snapshot.objects["object-copy-a"].children).toEqual(["object-copy-b"]);
    expect(result.snapshot.selection).toEqual({ nodeId: "object-copy-a", nodeIds: ["object-copy-a"], objectId: "object-copy-a", objectIds: ["object-copy-a"] });
    expect(result.snapshot.materials.assignments["object:object-copy-a"].materialId).not.toBe("material:object:object-a");
    expect(result.snapshot.materials.definitions[result.snapshot.materials.assignments["object:object-copy-a"].materialId].override.color).toBe("#111111");
    expect(editor.getHistoryState().undoCount).toBe(undoBeforePaste + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeTruthy();
  });

  it("rejects payloads that reference missing target assets without partial object creation", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    source.dispatch({ type: "select-object", objectId: "object-a" });
    const payload = createClipboardPayload(source.getSnapshot());
    const target = createEditor();
    const before = target.getSnapshot();

    const result = target.dispatch({ type: "paste-objects", payload, objectIdMap: { "object-a": "object-copy-a" } });

    expect(result.ok).toBe(false);
    expect(target.getSnapshot()).toBe(before);
  });
});
