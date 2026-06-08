import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createEditor } from "./create-editor";

describe("advanced editor operations", () => {
  it("routes copy, paste, duplicate, delete, group, and ungroup through core commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });

    const payload = editor.operations.copy();
    expect(payload?.kind).toBe("ek-aiot-3d-editor-objects");
    expect(payload?.kind === "ek-aiot-3d-editor-objects" ? payload.rootObjectIds : []).toEqual(["object-a", "object-b"]);
    expect(editor.operations.canPaste()).toBe(true);

    expect(editor.operations.paste({
      ...payload!,
      assetIds: ["asset-a", "asset-b"]
    }).ok).toBe(true);
    expect(editor.operations.duplicate(["object-a"]).ok).toBe(true);
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });
    expect(editor.operations.group(["object-a", "object-b"]).ok).toBe(true);
    expect(editor.operations.ungroup("object-a").ok).toBe(true);
    expect(editor.operations.delete(["object-b"]).ok).toBe(true);
    expect(editor.getSnapshot().objects["object-b"]).toBeUndefined();
  });

  it("clears clipboard on restore", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.operations.copy();
    expect(editor.operations.canPaste()).toBe(true);

    editor.restore(editor.serialize());

    expect(editor.operations.canPaste()).toBe(false);
  });

  it("does not retain an empty selection clipboard payload", () => {
    const editor = createEditor();

    expect(editor.operations.copy()).toBeNull();
    expect(editor.operations.canPaste()).toBe(false);
    expect(editor.operations.paste().ok).toBe(false);
  });

  it("keeps object-only operation compatibility for default object selections", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [10, 0, 0] } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [12, 0, 0] } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });

    expect(editor.operations.duplicate().ok).toBe(true);
    expect(editor.getSnapshot().selection.objectId).not.toBe("object-a");
    expect(editor.getSnapshot().selection.objectIds).toHaveLength(2);

    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });
    expect(editor.operations.group().ok).toBe(true);
    expect(editor.getSnapshot().nodes["object-b"].parentId).toBe("object-a");
    expect(editor.getSnapshot().selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a", "object-b"], objectId: "object-a", objectIds: ["object-a", "object-b"] });
  });

  it("selects and clears all scene nodes through advanced operations", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });

    expect(editor.operations.selectAll().ok).toBe(true);
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", "ambient-a"]);
    expect(editor.getSnapshot().selection.objectIds).toEqual(["object-a"]);

    expect(editor.operations.clearSelection().ok).toBe(true);
    expect(editor.getSnapshot().selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("copies, duplicates, deletes, and groups current node selections by default", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a", "point-a"], primaryNodeId: "object-a" });

    const payload = editor.operations.copy();
    expect(payload?.kind).toBe("ek-aiot-3d-editor-nodes");
    expect(editor.operations.duplicate().ok).toBe(true);
    const duplicatedObjectNodeId = editor.getSnapshot().selection.nodeId;
    expect(duplicatedObjectNodeId).not.toBeNull();
    expect(duplicatedObjectNodeId ? editor.getSnapshot().nodes[duplicatedObjectNodeId]?.kind : null).toBe("object");
    expect(editor.getSnapshot().nodes["copy:point-a"]).toMatchObject({ kind: "light", lightId: "copy:point-a" });

    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a", "point-a"], primaryNodeId: "object-a" });
    expect(editor.operations.group().ok).toBe(true);
    const groupId = editor.getSnapshot().selection.nodeId;
    expect(groupId ? editor.getSnapshot().nodes[groupId]?.kind : null).toBe("group");

    expect(editor.operations.delete().ok).toBe(true);
    expect(groupId ? editor.getSnapshot().nodes[groupId] : undefined).toBeUndefined();
    expect(editor.getSnapshot().objects["object-a"]).toBeUndefined();
    expect(editor.getSnapshot().lights["point-a"]).toBeUndefined();
  });

  it("uses node clipboard semantics for object selections with imported descendants", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        metadata: attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
          gltf: {
            parser: {
              json: {
                nodes: [{ mesh: 0 }],
                meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }]
              }
            }
          }
        }))
      },
      expandImportedTargets: true
    });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const payload = editor.operations.copy();
    const duplicated = editor.operations.duplicate();
    const duplicatedObjectId = duplicated.snapshot.selection.objectId;

    expect(payload?.kind).toBe("ek-aiot-3d-editor-nodes");
    expect(duplicated.ok).toBe(true);
    expect(duplicatedObjectId).not.toBeNull();
    expect(Object.values(duplicated.snapshot.nodes).some((node) =>
      node.kind === "imported" &&
      node.ownerObjectId === duplicatedObjectId &&
      node.importKey.startsWith(`glb:${duplicatedObjectId}/`)
    )).toBe(true);
  });
});
