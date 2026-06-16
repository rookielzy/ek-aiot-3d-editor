import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { restoreSnapshot, serializeSnapshot } from "../editor/serialization";
import { CommandDispatcher } from "./dispatcher";

describe("light commands", () => {
  it.each([
    ["ambient", false],
    ["directional", true],
    ["hemisphere", false],
    ["point", true],
    ["spot", true]
  ] as const)("adds %s lights with matching node transform capability", (kind, transformable) => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({ type: "add-light", light: { id: `${kind}-a`, kind } });

    expect(result.ok).toBe(true);
    const node = result.snapshot.nodes[`${kind}-a`];
    expect(node).toMatchObject({
      id: `${kind}-a`,
      kind: "light",
      lightId: `${kind}-a`
    });
    expect("transform" in node).toBe(transformable);
  });

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
    expect(store.getSnapshot().nodes["light-a"]).toMatchObject({
      id: "light-a",
      kind: "light",
      lightId: "light-a",
      name: "Fill"
    });
    expect("transform" in store.getSnapshot().nodes["light-a"]).toBe(false);
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
    expect(restored.nodes.sun).toMatchObject({
      kind: "light",
      lightId: "sun",
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
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

  it("updates directional shadow settings through command history", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });

    const result = dispatcher.dispatch({
      type: "update-light",
      lightId: "sun",
      patch: {
        shadow: {
          enabled: true,
          mapSize: { width: 2048, height: 1024 },
          bias: -0.0001,
          normalBias: 0.01,
          radius: 2,
          camera: { near: 0.2, far: 80, left: -8, right: 8, top: 6, bottom: -6 }
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights.sun).toMatchObject({
      kind: "directional",
      shadow: { enabled: true, mapSize: { width: 2048, height: 1024 } }
    });
    expect(store.getSnapshot().nodes.sun).toMatchObject({
      kind: "light",
      lightId: "sun",
      transform: store.getSnapshot().lights.sun.transform
    });
    dispatcher.undo();
    expect(store.getSnapshot().lights.sun).toMatchObject({
      kind: "directional",
      shadow: { enabled: false, mapSize: { width: 1024, height: 1024 } }
    });
    dispatcher.redo();
    expect(store.getSnapshot().lights.sun).toMatchObject({ shadow: { enabled: true } });
  });

  it("rejects shadow updates on ambient lights without mutating history", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    const before = store.getSnapshot();
    const undoCount = history.state.undoCount;

    const result = dispatcher.dispatch({
      type: "update-light",
      lightId: "ambient-a",
      patch: { shadow: { enabled: true } } as never
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not support shadow settings");
    expect(store.getSnapshot()).toBe(before);
    expect(history.state.undoCount).toBe(undoCount);
  });

  it("removes a light node subtree and normalizes selection", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "reparent-node", nodeId: "object-a", parentId: "point-a" });
    dispatcher.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["point-a", "object-a"], primaryNodeId: "point-a" });

    const result = dispatcher.dispatch({ type: "remove-light", lightId: "point-a" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.lights["point-a"]).toBeUndefined();
    expect(result.snapshot.nodes["point-a"]).toBeUndefined();
    expect(result.snapshot.objects["object-a"]).toBeUndefined();
    expect(result.snapshot.selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("does not persist transforms on non-spatial light updates", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });

    const result = dispatcher.dispatch({
      type: "update-light",
      lightId: "ambient-a",
      patch: { transform: { position: [1, 2, 3] } }
    });

    expect(result.ok).toBe(true);
    expect("transform" in store.getSnapshot().lights["ambient-a"]).toBe(false);
    expect("transform" in store.getSnapshot().nodes["ambient-a"]).toBe(false);
  });

  it("does not persist shadows on non-shadow-capable light updates", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });

    const result = dispatcher.dispatch({
      type: "update-light",
      lightId: "ambient-a",
      patch: { intensity: 2 }
    });

    expect(result.ok).toBe(true);
    expect("shadow" in store.getSnapshot().lights["ambient-a"]).toBe(false);
  });
});
