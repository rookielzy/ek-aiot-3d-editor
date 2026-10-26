import { describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { createLightDefinition } from "../lights/defaults";
import { createTransform } from "../snapshot/defaults";
import { createEmptySnapshot, createLightNode } from "../snapshot/defaults";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import type { SceneGroupNode, SceneSnapshot } from "../snapshot/types";
import { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { CommandDispatcher } from "./dispatcher";

describe("select node command", () => {
  it("selects object, group, and light nodes with ordered compatibility mirrors", () => {
    const store = new EditorStore(createMixedNodeSnapshot());
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: ["group-a", "object-a", "ambient-a"],
      primaryNodeId: "ambient-a"
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection).toEqual({
      nodeId: "ambient-a",
      nodeIds: ["group-a", "object-a", "ambient-a"],
      objectId: "object-a",
      objectIds: ["object-a"]
    });
  });

  it("supports replace, add, remove, toggle, clear, and all modes", () => {
    const store = new EditorStore(createMixedNodeSnapshot());
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    expect(dispatcher.dispatch({ type: "select-node", nodeId: "object-a" }).ok).toBe(true);
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a"]);

    dispatcher.dispatch({ type: "select-nodes", mode: "add", nodeIds: ["group-a", "ambient-a"] });
    expect(store.getSnapshot().selection).toMatchObject({
      nodeId: "object-a",
      nodeIds: ["object-a", "group-a", "ambient-a"],
      objectId: "object-a",
      objectIds: ["object-a"]
    });

    dispatcher.dispatch({ type: "select-nodes", mode: "toggle", nodeId: "object-a" });
    expect(store.getSnapshot().selection).toMatchObject({
      nodeId: "group-a",
      nodeIds: ["group-a", "ambient-a"],
      objectId: null,
      objectIds: []
    });

    dispatcher.dispatch({ type: "select-nodes", mode: "remove", nodeId: "group-a" });
    expect(store.getSnapshot().selection).toMatchObject({
      nodeId: "ambient-a",
      nodeIds: ["ambient-a"],
      objectId: null,
      objectIds: []
    });

    dispatcher.dispatch({ type: "select-nodes", mode: "all" });
    expect(store.getSnapshot().selection.nodeIds).toEqual(["group-a", "object-a", "ambient-a"]);
    expect(store.getSnapshot().selection.objectIds).toEqual(["object-a"]);

    dispatcher.dispatch({ type: "select-nodes", mode: "clear" });
    expect(store.getSnapshot().selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("rejects unknown node IDs without publishing partial state", () => {
    const store = new EditorStore(createMixedNodeSnapshot());
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const listener = vi.fn();
    const before = store.getSnapshot();
    store.subscribe(listener);

    const result = dispatcher.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: ["object-a"],
      primaryNodeId: "missing"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Node missing does not exist.");
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps select-object as an object payload compatibility adapter", () => {
    const store = new EditorStore(createMixedNodeSnapshot());
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    expect(dispatcher.dispatch({ type: "select-object", objectId: "object-a" }).ok).toBe(true);
    expect(store.getSnapshot().selection).toEqual({
      nodeId: "object-a",
      nodeIds: ["object-a"],
      objectId: "object-a",
      objectIds: ["object-a"]
    });

    const invalid = dispatcher.dispatch({ type: "select-object", objectId: "ambient-a" });
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toContain("Object ambient-a does not exist.");
  });

  it("derives object-only helpers from mixed node selection", () => {
    const store = new EditorStore(createMixedNodeSnapshot());
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    dispatcher.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: ["group-a", "ambient-a", "object-a"],
      primaryNodeId: "group-a"
    });

    expect(getSelectedObjectIds(store.getSnapshot())).toEqual(["object-a"]);
    expect(getTopLevelSelectedObjectIds(store.getSnapshot())).toEqual(["object-a"]);
  });
});

function createMixedNodeSnapshot(): SceneSnapshot {
  const snapshot = createEmptySnapshot("scene-a");
  const ambient = createLightDefinition("ambient", { id: "ambient-a", name: "Ambient" });
  const group: SceneGroupNode = {
    id: "group-a",
    kind: "group",
    name: "Group",
    parentId: null,
    children: ["object-a"],
    transform: createTransform()
  };

  return {
    ...snapshot,
    version: 9,
    scene: {
      id: "scene-a",
      name: "Scene"
    },
    nodes: {
      "group-a": group,
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Box",
        objectId: "object-a",
        parentId: "group-a",
        children: [],
        transform: createTransform()
      },
      "ambient-a": createLightNode(ambient)
    },
    rootNodeIds: ["group-a", "ambient-a"],
    objects: {
      "object-a": {
        id: "object-a",
        name: "Box",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: createTransform()
      }
    },
    rootObjectIds: ["object-a"],
    selection: {
      nodeId: null,
      nodeIds: [],
      objectId: null,
      objectIds: []
    },
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" }
    },
    materials: {
      definitions: {},
      assignments: {}
    },
    lights: {
      "ambient-a": ambient
    },
    problems: {
      acknowledged: {}
    }
  };
}
