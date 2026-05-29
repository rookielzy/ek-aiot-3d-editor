import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../../assets/registry";
import { CommandDispatcher } from "../../commands/dispatcher";
import { EditorStore } from "../../editor/store";
import { CommandHistory } from "../../history/history";
import { TransformTransaction } from "./transform-transaction";

describe("transform transaction", () => {
  it("commits one transform command after multiple previews", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const object = new Object3D();
    const transaction = new TransformTransaction({ objectId: "object-a", object, dispatcher });

    transaction.preview({ position: [1, 0, 0] });
    transaction.preview({ position: [2, 0, 0] });
    const result = transaction.commit();

    expect(result?.ok).toBe(true);
    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([2, 0, 0]);
    expect(history.state.undoCount).toBe(2);
  });

  it("restores runtime transform and leaves history unchanged on cancel", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const object = new Object3D();
    object.position.set(4, 5, 6);
    const transaction = new TransformTransaction({ objectId: "object-a", object, dispatcher });

    transaction.preview({ position: [10, 0, 0] });
    transaction.cancel();

    expect(object.position.toArray()).toEqual([4, 5, 6]);
    expect(history.state.undoCount).toBe(0);
  });

  it("commits only the active mode field", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const object = new Object3D();
    const transaction = new TransformTransaction({ objectId: "object-a", object, dispatcher, mode: "scale" });

    transaction.preview({ position: [9, 9, 9], scale: [2, 2, 2] });
    transaction.commit();

    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    expect(store.getSnapshot().objects["object-a"].transform.scale).toEqual([2, 2, 2]);
  });
});
