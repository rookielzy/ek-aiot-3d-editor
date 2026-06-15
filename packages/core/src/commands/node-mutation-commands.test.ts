import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { getWorldNodeTransform } from "../snapshot/transforms";

describe("node mutation commands", () => {
  it("creates empty group nodes as selectable transform targets", () => {
    const editor = createEditor();

    const result = editor.dispatch({
      type: "create-group",
      nodeId: "group-a",
      name: "Assembly",
      transform: { position: [1, 2, 3] },
      select: true
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["group-a"]).toMatchObject({
      id: "group-a",
      kind: "group",
      name: "Assembly",
      parentId: null,
      children: [],
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    });
    expect(result.snapshot.rootNodeIds).toEqual(["group-a"]);
    expect(result.snapshot.selection).toEqual({ nodeId: "group-a", nodeIds: ["group-a"], objectId: null, objectIds: [] });
  });

  it("groups mixed object and light nodes under a new empty group and restores through undo", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a", "point-a"], primaryNodeId: "object-a" });
    const before = editor.getSnapshot();

    const result = editor.dispatch({ type: "group-nodes", nodeId: "group-a", name: "Group A" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["group-a"]).toMatchObject({ kind: "group", children: ["object-a", "point-a"] });
    expect(result.snapshot.nodes["object-a"].parentId).toBe("group-a");
    expect(result.snapshot.nodes["point-a"].parentId).toBe("group-a");
    expect(result.snapshot.rootNodeIds).toEqual(["group-a"]);
    expect(result.snapshot.rootObjectIds).toEqual(["object-a"]);
    expect(result.snapshot.selection).toEqual({ nodeId: "group-a", nodeIds: ["group-a"], objectId: null, objectIds: [] });

    editor.undo();
    expect(editor.getSnapshot()).toEqual(before);
  });

  it("ungroups group nodes by moving children to the group parent", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "outer" });
    editor.dispatch({ type: "create-group", nodeId: "inner", parentId: "outer", transform: { position: [10, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-a", parentId: "inner", asset: { id: "asset-a" }, transform: { position: [2, 0, 0] } });
    const worldBefore = getWorldNodeTransform(editor.getSnapshot(), "object-a").position;

    const result = editor.dispatch({ type: "ungroup-nodes", nodeId: "inner", preserveWorldTransform: true });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["object-a"].parentId).toBe("outer");
    expect(result.snapshot.nodes["inner"].children).toEqual([]);
    expect(result.snapshot.nodes["outer"].children).toEqual(["inner", "object-a"]);
    expect(getWorldNodeTransform(result.snapshot, "object-a").position).toEqual(worldBefore);
    expect(result.snapshot.selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a"], objectId: "object-a", objectIds: ["object-a"] });
  });

  it("reparents nodes with explicit preserve-world transform semantics", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", transform: { position: [10, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [12, 0, 0] } });
    const worldBefore = getWorldNodeTransform(editor.getSnapshot(), "object-a").position;

    const result = editor.dispatch({
      type: "reparent-node",
      nodeId: "object-a",
      parentId: "group-a",
      preserveWorldTransform: true
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["object-a"].parentId).toBe("group-a");
    expect(result.snapshot.nodes["object-a"].transform?.position).toEqual([2, 0, 0]);
    expect(result.snapshot.objects["object-a"].parentId).toBeNull();
    expect(getWorldNodeTransform(result.snapshot, "object-a").position).toEqual(worldBefore);
  });

  it("rejects camera node parenting in both directions", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    const before = editor.getSnapshot();

    const parentCamera = editor.dispatch({ type: "reparent-node", nodeId: "view-a", parentId: "group-a" });
    const childUnderCamera = editor.dispatch({ type: "reparent-node", nodeId: "group-a", parentId: "view-a" });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["view-a", "group-a"], primaryNodeId: "view-a" });
    const groupCamera = editor.dispatch({ type: "group-nodes", nodeId: "group-b" });

    expect(parentCamera.ok).toBe(false);
    expect(childUnderCamera.ok).toBe(false);
    expect(groupCamera.ok).toBe(false);
    expect(editor.getSnapshot().nodes["view-a"].parentId).toBeNull();
    expect(editor.getSnapshot().nodes["view-a"].children).toEqual([]);
    expect(editor.getSnapshot().nodes["group-a"].parentId).toBeNull();
    expect(editor.getSnapshot().rootNodeIds).toEqual(before.rootNodeIds);
  });

  it("rejects explicit reparent transforms for non-transformable light nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    const before = editor.getSnapshot();

    const result = editor.dispatch({
      type: "reparent-node",
      nodeId: "ambient-a",
      parentId: null,
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not support transforms");
    expect(editor.getSnapshot()).toBe(before);
  });

  it("reparents object nodes through the legacy object command", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });

    const result = editor.dispatch({ type: "reparent-object", objectId: "object-b", parentId: "object-a" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-b"].parentId).toBe("object-a");
    expect(result.snapshot.nodes["object-b"].parentId).toBe("object-a");
    expect(result.snapshot.nodes["object-a"].children).toEqual(["object-b"]);
  });

  it("deletes mixed node subtrees and cleans payloads, material assignments, hierarchy, and selection", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", parentId: "group-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#111111" } });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["group-a", "object-a", "point-a"], primaryNodeId: "group-a" });

    const result = editor.dispatch({ type: "delete-nodes", nodeIds: ["group-a"] });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["group-a"]).toBeUndefined();
    expect(result.snapshot.objects["object-a"]).toBeUndefined();
    expect(result.snapshot.lights["point-a"]).toBeUndefined();
    expect(result.snapshot.materials.assignments["object:object-a"]).toBeUndefined();
    expect(result.snapshot.rootNodeIds).toEqual([]);
    expect(result.snapshot.rootObjectIds).toEqual([]);
    expect(result.snapshot.selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("deletes child object nodes without leaving stale object children mirrors", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", parentId: "object-a", asset: { id: "asset-b" } });

    const result = editor.dispatch({ type: "delete-nodes", nodeIds: ["object-b"] });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-a"].children).toEqual([]);
    expect(result.snapshot.nodes["object-a"].children).toEqual([]);
  });
});
