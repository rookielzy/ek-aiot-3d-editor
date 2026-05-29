import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("set transform command", () => {
  it("applies, undoes, and redoes object transform values", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [3, 2, 1] } });

    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([3, 2, 1]);
    dispatcher.undo();
    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    dispatcher.redo();
    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([3, 2, 1]);
  });

  it("records one committed transform command after multiple previews", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const afterImport = history.state.undoCount;

    // Runtime preview moves transient Three.js objects; only commit dispatches durable state.
    dispatcher.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [5, 0, 0] } });

    expect(history.state.undoCount).toBe(afterImport + 1);
  });
});
