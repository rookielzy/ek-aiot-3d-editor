import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "./history";

describe("command history", () => {
  it("undoes and redoes transform changes deterministically", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());

    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", label: "Box" }
    });
    dispatcher.dispatch({
      type: "set-transform",
      objectId: "object-a",
      transform: { position: [1, 2, 3] }
    });

    expect(history.state.undoCount).toBe(2);
    expect(dispatcher.undo().snapshot.objects["object-a"].transform.position).toEqual([0, 0, 0]);
    expect(dispatcher.redo().snapshot.objects["object-a"].transform.position).toEqual([1, 2, 3]);
  });

  it("clears stale redo history when a new command is executed after undo", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 0, 0] } });
    dispatcher.undo();
    dispatcher.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [2, 0, 0] } });

    expect(history.state.redoCount).toBe(0);
    expect(dispatcher.redo().ok).toBe(false);
  });
});
