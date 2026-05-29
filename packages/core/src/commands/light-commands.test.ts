import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("light commands", () => {
  it("adds ambient lights as undoable durable authoring data", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "light-a",
        kind: "ambient",
        name: "Fill",
        color: "#ffffff",
        intensity: 0.5
      }
    });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights["light-a"]).toMatchObject({
      id: "light-a",
      kind: "ambient",
      name: "Fill",
      intensity: 0.5
    });
    dispatcher.undo();
    expect(store.getSnapshot().lights["light-a"]).toBeUndefined();
    dispatcher.redo();
    expect(store.getSnapshot().lights["light-a"].kind).toBe("ambient");
  });

  it("serializes directional light transform and target intent", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "sun",
        kind: "directional",
        color: "#ffffff",
        intensity: 2,
        transform: { position: [1, 2, 3] },
        target: [0, 0, 0]
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.lights.sun).toMatchObject({
      kind: "directional",
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      target: [0, 0, 0]
    });
  });

  it("rejects invalid light data without mutating state", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "bad",
        kind: "spot",
        color: "#ffffff",
        intensity: -1,
        angle: Math.PI
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("intensity");
    expect(result.error).toContain("angle");
    expect(store.getSnapshot()).toBe(before);
  });

  it("updates and removes lights through command history", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    dispatcher.dispatch({ type: "update-light", lightId: "point-a", patch: { intensity: 3 } });

    expect(store.getSnapshot().lights["point-a"].intensity).toBe(3);
    dispatcher.undo();
    expect(store.getSnapshot().lights["point-a"].intensity).toBe(1);
    dispatcher.redo();
    expect(store.getSnapshot().lights["point-a"].intensity).toBe(3);

    dispatcher.dispatch({ type: "remove-light", lightId: "point-a" });
    expect(store.getSnapshot().lights["point-a"]).toBeUndefined();
  });
});
