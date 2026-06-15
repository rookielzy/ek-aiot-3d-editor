import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("camera view commands", () => {
  it("creates authored camera views as undoable durable state", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "create-camera-view",
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 65 },
        position: [1, 2, 3],
        target: [0, 1, 0],
        near: 0.2,
        far: 800
      }
    });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().presentation.cameraViews["view-a"]).toMatchObject({
      id: "view-a",
      name: "Hero",
      projection: { kind: "perspective", fov: 65 },
      position: [1, 2, 3],
      target: [0, 1, 0],
      near: 0.2,
      far: 800
    });
    dispatcher.undo();
    expect(store.getSnapshot().presentation.cameraViews["view-a"]).toBeUndefined();
    dispatcher.redo();
    expect(store.getSnapshot().presentation.cameraViews["view-a"].name).toBe("Hero");
  });

  it("generates a stable camera view ID when none is provided", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({ type: "create-camera-view" });

    expect(result.ok).toBe(true);
    const [view] = Object.values(result.snapshot.presentation.cameraViews);
    expect(view.id).toMatch(/^camera-view-/);
    expect(result.snapshot.presentation.cameraViews[view.id]).toBe(view);
  });

  it("generates a non-conflicting camera view ID after restoring existing generated IDs", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "camera-view-1" } });
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "camera-view-2" } });

    const result = dispatcher.dispatch({ type: "create-camera-view" });

    expect(result.ok).toBe(true);
    expect(Object.keys(result.snapshot.presentation.cameraViews)).toHaveLength(3);
    expect(result.snapshot.presentation.cameraViews["camera-view-1"]).toBeDefined();
    expect(result.snapshot.presentation.cameraViews["camera-view-2"]).toBeDefined();
    const generatedIds = Object.keys(result.snapshot.presentation.cameraViews)
      .filter((viewId) => viewId !== "camera-view-1" && viewId !== "camera-view-2");
    expect(generatedIds).toHaveLength(1);
    expect(generatedIds[0]).toMatch(/^camera-view-/);
  });

  it("rejects duplicate camera view creation without mutating state or history", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Original" } });
    dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" });
    const before = store.getSnapshot();
    const undoCount = history.state.undoCount;

    const result = dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Duplicate" } });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(store.getSnapshot().presentation.cameraViews["view-a"].name).toBe("Original");
    expect(store.getSnapshot().presentation.defaultViewId).toBe("view-a");
    expect(history.state.undoCount).toBe(undoCount);
  });

  it("updates camera view fields without changing default selection", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" });

    const result = dispatcher.dispatch({
      type: "update-camera-view",
      viewId: "view-a",
      patch: {
        name: "Detail",
        projection: { fov: 35 },
        position: [5, 6, 7],
        target: [1, 1, 1],
        near: 0.5,
        far: 300
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.presentation.defaultViewId).toBe("view-a");
    expect(result.snapshot.presentation.cameraViews["view-a"]).toMatchObject({
      name: "Detail",
      projection: { kind: "perspective", fov: 35 },
      position: [5, 6, 7],
      target: [1, 1, 1],
      near: 0.5,
      far: 300
    });
  });

  it("sets and clears the default camera view reference", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });

    expect(dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" }).ok).toBe(true);
    expect(store.getSnapshot().presentation.defaultViewId).toBe("view-a");

    expect(dispatcher.dispatch({ type: "set-default-camera-view", viewId: null }).ok).toBe(true);
    expect(store.getSnapshot().presentation.defaultViewId).toBeNull();
  });

  it("clears defaultViewId when the default camera view is deleted", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" });

    const result = dispatcher.dispatch({ type: "delete-camera-view", viewId: "view-a" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.presentation.cameraViews["view-a"]).toBeUndefined();
    expect(result.snapshot.presentation.defaultViewId).toBeNull();
  });

  it.each([
    ["missing update", { type: "update-camera-view", viewId: "missing", patch: { name: "Missing" } }],
    ["missing delete", { type: "delete-camera-view", viewId: "missing" }],
    ["missing default", { type: "set-default-camera-view", viewId: "missing" }],
    ["inherited update", { type: "update-camera-view", viewId: "constructor", patch: { name: "Constructor" } }],
    ["inherited default", { type: "set-default-camera-view", viewId: "constructor" }],
    ["empty create", { type: "create-camera-view", view: { id: "" } }],
    ["empty default", { type: "set-default-camera-view", viewId: "" }],
    ["invalid vector", { type: "create-camera-view", view: { id: "bad", position: [0, Number.NaN, 0] } }],
    ["invalid projection", { type: "create-camera-view", view: { id: "bad", projection: { kind: "perspective", fov: 180 } } }]
  ])("rejects %s without mutating state", (_label, command) => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const before = store.getSnapshot();

    const result = dispatcher.dispatch(command as never);

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(history.state.undoCount).toBe(0);
  });

  it("can batch create a camera view and set it as default atomically", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "batch",
      commands: [
        { type: "create-camera-view", view: { id: "view-a", name: "Hero" } },
        { type: "set-default-camera-view", viewId: "view-a" }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.presentation.defaultViewId).toBe("view-a");
    dispatcher.undo();
    expect(store.getSnapshot().presentation.cameraViews).toEqual({});
    expect(store.getSnapshot().presentation.defaultViewId).toBeNull();
  });
});
