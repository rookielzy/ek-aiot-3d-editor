import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("delete objects command", () => {
  it("removes selected top-level subtrees once and cleans material assignments", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-c", asset: { id: "asset-c" } });
    dispatcher.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#111111" } });
    dispatcher.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-b" }, material: { color: "#222222" } });
    dispatcher.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-c" }, material: { color: "#333333" } });
    dispatcher.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });
    const undoBeforeDelete = history.state.undoCount;

    const result = dispatcher.dispatch({ type: "delete-objects" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-a"]).toBeUndefined();
    expect(result.snapshot.objects["object-b"]).toBeUndefined();
    expect(result.snapshot.objects["object-c"]).toBeTruthy();
    expect(result.snapshot.rootObjectIds).toEqual(["object-c"]);
    expect(result.snapshot.selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
    expect(result.snapshot.materials.assignments["object:object-a"]).toBeUndefined();
    expect(result.snapshot.materials.assignments["object:object-b"]).toBeUndefined();
    expect(result.snapshot.materials.assignments["object:object-c"]).toBeTruthy();
    expect(result.snapshot.assets["asset-a"]).toBeTruthy();
    expect(history.state.undoCount).toBe(undoBeforeDelete + 1);

    dispatcher.undo();
    expect(store.getSnapshot().objects["object-a"]).toBeTruthy();
    expect(store.getSnapshot().objects["object-b"]).toBeTruthy();
  });
});
