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
    expect(store.getSnapshot().cameras["view-a"]).toMatchObject({
      id: "view-a",
      name: "Hero",
      projection: { kind: "perspective", fov: 65 },
      position: [1, 2, 3],
      target: [0, 1, 0],
      near: 0.2,
      far: 800
    });
    dispatcher.undo();
    expect(store.getSnapshot().cameras["view-a"]).toBeUndefined();
    dispatcher.redo();
    expect(store.getSnapshot().cameras["view-a"].name).toBe("Hero");
  });

  it("generates a stable camera view ID when none is provided", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({ type: "create-camera-view" });

    expect(result.ok).toBe(true);
    const [view] = Object.values(result.snapshot.cameras);
    expect(view.id).toMatch(/^camera-view-/);
    expect(result.snapshot.cameras[view.id]).toBe(view);
  });

  it("uses a non-conflicting camera node ID when the camera ID is already a node ID", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-group", nodeId: "view-a" });

    const result = dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });

    expect(result.ok).toBe(true);
    expect(result.snapshot.cameras["view-a"]).toBeDefined();
    expect(result.snapshot.nodes["view-a"]).toMatchObject({ kind: "group" });
    expect(result.snapshot.nodes["view-a:camera"]).toMatchObject({ kind: "camera", cameraId: "view-a" });
  });

  it("generates a non-conflicting camera view ID after restoring existing generated IDs", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "camera-view-1" } });
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "camera-view-2" } });

    const result = dispatcher.dispatch({ type: "create-camera-view" });

    expect(result.ok).toBe(true);
    expect(Object.keys(result.snapshot.cameras)).toHaveLength(3);
    expect(result.snapshot.cameras["camera-view-1"]).toBeDefined();
    expect(result.snapshot.cameras["camera-view-2"]).toBeDefined();
    const generatedIds = Object.keys(result.snapshot.cameras)
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
    expect(store.getSnapshot().cameras["view-a"].name).toBe("Original");
    expect(store.getSnapshot().presentation.defaultCameraId).toBe("view-a");
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
    expect(result.snapshot.presentation.defaultCameraId).toBe("view-a");
    expect(result.snapshot.cameras["view-a"]).toMatchObject({
      name: "Detail",
      projection: { kind: "perspective", fov: 35 },
      position: [5, 6, 7],
      target: [1, 1, 1],
      near: 0.5,
      far: 300
    });
  });

  it("rejects unsupported projection kind updates without mutating state or history", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    const before = store.getSnapshot();
    const undoCount = history.state.undoCount;

    const result = dispatcher.dispatch({
      type: "update-camera-view",
      viewId: "view-a",
      patch: { projection: { kind: "orthographic" } as never }
    });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(history.state.undoCount).toBe(undoCount);
  });

  it("sets and clears the default camera view reference", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });

    expect(dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" }).ok).toBe(true);
    expect(store.getSnapshot().presentation.defaultCameraId).toBe("view-a");

    expect(dispatcher.dispatch({ type: "set-default-camera-view", viewId: null }).ok).toBe(true);
    expect(store.getSnapshot().presentation.defaultCameraId).toBeNull();
  });

  it("clears defaultCameraId when the default camera view is deleted", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    dispatcher.dispatch({ type: "set-default-camera-view", viewId: "view-a" });

    const result = dispatcher.dispatch({ type: "delete-camera-view", viewId: "view-a" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.cameras["view-a"]).toBeUndefined();
    expect(result.snapshot.presentation.defaultCameraId).toBeNull();
  });

  it("keeps camera nodes as root leaves and deletes only the camera mirror", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const reparentUnderCamera = dispatcher.dispatch({ type: "reparent-node", nodeId: "object-a", parentId: "view-a" });
    const reparentCamera = dispatcher.dispatch({ type: "reparent-node", nodeId: "view-a", parentId: "object-a" });
    dispatcher.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["view-a"], primaryNodeId: "view-a" });

    const result = dispatcher.dispatch({ type: "delete-camera-view", viewId: "view-a" });

    expect(reparentUnderCamera.ok).toBe(false);
    expect(reparentCamera.ok).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.snapshot.cameras["view-a"]).toBeUndefined();
    expect(result.snapshot.nodes["view-a"]).toBeUndefined();
    expect(result.snapshot.objects["object-a"]).toBeDefined();
    expect(result.snapshot.selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("syncs camera node position but rejects rotation and scale transforms", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "create-camera-view", view: { id: "view-a", position: [0, 2, 5], target: [0, 0, 0] } });

    const moved = dispatcher.dispatch({
      type: "set-node-transform",
      nodeId: "view-a",
      transform: { position: [3, 4, 5] }
    });
    const beforeInvalid = store.getSnapshot();
    const undoCount = history.state.undoCount;
    const rotated = dispatcher.dispatch({
      type: "set-node-transform",
      nodeId: "view-a",
      transform: { rotation: [0, 1, 0] }
    });

    expect(moved.ok).toBe(true);
    expect(moved.snapshot.cameras["view-a"].position).toEqual([3, 4, 5]);
    expect(moved.snapshot.cameras["view-a"].target).toEqual([0, 0, 0]);
    expect(rotated.ok).toBe(false);
    expect(store.getSnapshot()).toBe(beforeInvalid);
    expect(history.state.undoCount).toBe(undoCount);
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
    expect(result.snapshot.presentation.defaultCameraId).toBe("view-a");
    dispatcher.undo();
    expect(store.getSnapshot().cameras).toEqual({});
    expect(store.getSnapshot().presentation.defaultCameraId).toBeNull();
  });
});
