import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { restoreSnapshot, serializeSnapshot } from "../editor/serialization";
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

  it("preserves directional light transform and target intent through serialization", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

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
    const restored = restoreSnapshot(serializeSnapshot(store.getSnapshot()));

    expect(restored.lights.sun).toMatchObject({
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

  it.each([
    ["invalid kind", { id: "bad-kind", kind: "area" }],
    ["non-finite transform", { id: "bad-transform", kind: "point", transform: { position: [0, Number.NaN, 0] } }]
  ])("rejects %s without mutating state", (_label, light) => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const before = store.getSnapshot();
    const undoCount = history.state.undoCount;

    const result = dispatcher.dispatch({
      type: "add-light",
      light: light as never
    });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(history.state.undoCount).toBe(undoCount);
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
