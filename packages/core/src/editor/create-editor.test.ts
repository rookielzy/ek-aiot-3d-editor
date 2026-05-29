import { describe, expect, it, vi } from "vitest";
import { createEditor } from "./create-editor";

describe("createEditor", () => {
  it("subscribes to core state and dispatches commands through one API", () => {
    const editor = createEditor();
    const subscriber = vi.fn();
    const unsubscribe = editor.subscribe(subscriber);

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    unsubscribe();
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(editor.getSnapshot().selection.objectId).toBe("object-a");
  });

  it("restores serialized proof-loop state without mounting runtime", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 2, 3] } });
    const serialized = editor.serialize();
    const restored = createEditor();

    restored.restore(serialized);
    restored.dispatch({ type: "select-object", objectId: "object-a" });

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([1, 2, 3]);
    expect(restored.getSnapshot().selection.objectId).toBe("object-a");
  });
});
