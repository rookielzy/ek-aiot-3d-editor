import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createEditor } from "../editor/create-editor";
import { createMaterialAssignmentId } from "../materials/defaults";
import { createClipboardPayload, createNodeClipboardPayload } from "../clipboard/create-clipboard";

describe("paste objects command", () => {
  it("pastes cloned subtrees with fresh IDs, shared assets, isolated material assignments, and one history entry", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#111111" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const payload = createClipboardPayload(editor.getSnapshot());
    const undoBeforePaste = editor.getHistoryState().undoCount;

    const result = editor.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: {
        "object-a": "object-copy-a",
        "object-b": "object-copy-b"
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-copy-a"].asset.id).toBe("asset-a");
    expect(result.snapshot.objects["object-copy-b"].parentId).toBe("object-copy-a");
    expect(result.snapshot.objects["object-copy-a"].children).toEqual(["object-copy-b"]);
    expect(result.snapshot.nodes["object-copy-a"]).toMatchObject({ kind: "object", objectId: "object-copy-a", children: ["object-copy-b"] });
    expect(result.snapshot.selection).toEqual({ nodeId: "object-copy-a", nodeIds: ["object-copy-a"], objectId: "object-copy-a", objectIds: ["object-copy-a"] });
    expect(result.snapshot.materials.assignments["object:object-copy-a"].materialId).not.toBe("material:object:object-a");
    expect(result.snapshot.materials.definitions[result.snapshot.materials.assignments["object:object-copy-a"].materialId].override.color).toBe("#111111");
    expect("originalId" in result.snapshot.objects["object-copy-a"]).toBe(false);
    expect(editor.getHistoryState().undoCount).toBe(undoBeforePaste + 1);

    editor.undo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().objects["object-copy-a"]).toBeTruthy();
  });

  it("rejects payloads that reference missing target assets without partial object creation", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    source.dispatch({ type: "select-object", objectId: "object-a" });
    const payload = createClipboardPayload(source.getSnapshot());
    const target = createEditor();
    const before = target.getSnapshot();

    const result = target.dispatch({ type: "paste-objects", payload, objectIdMap: { "object-a": "object-copy-a" } });

    expect(result.ok).toBe(false);
    expect(target.getSnapshot()).toBe(before);
  });

  it("pastes old object payloads into an existing mixed node graph without dropping group or light nodes", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    source.dispatch({ type: "select-object", objectId: "object-a" });
    const payload = createClipboardPayload(source.getSnapshot());
    const target = createEditor();
    target.dispatch({ type: "create-group", nodeId: "group-a" });
    target.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    target.dispatch({ type: "register-asset", asset: { id: "asset-a", kind: "glb" } });

    const result = target.dispatch({ type: "paste-objects", payload, objectIdMap: { "object-a": "object-copy-a" } });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["group-a"]).toMatchObject({ kind: "group" });
    expect(result.snapshot.nodes["ambient-a"]).toMatchObject({ kind: "light", lightId: "ambient-a" });
    expect(result.snapshot.nodes["object-copy-a"]).toMatchObject({ kind: "object", objectId: "object-copy-a" });
    expect(result.snapshot.rootNodeIds).toEqual(["group-a", "ambient-a", "object-copy-a"]);
  });

  it("pastes node clipboard payloads with group, object, light, material, and selection state", () => {
    const source = createEditor();
    source.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly", transform: { position: [1, 0, 0] } });
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, parentId: "group-a" });
    source.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", transform: { position: [3, 0, 0] } } });
    source.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });
    source.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#111111" } });
    source.dispatch({ type: "select-node", nodeId: "group-a" });
    const payload = createNodeClipboardPayload(source.getSnapshot());
    const target = createEditor();
    target.dispatch({ type: "register-asset", asset: { id: "asset-a", kind: "glb" } });

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["copy:group-a"]).toMatchObject({
      kind: "group",
      name: "Assembly",
      children: ["object-copy-a", "copy:point-a"]
    });
    expect(result.snapshot.nodes["object-copy-a"]).toMatchObject({
      kind: "object",
      objectId: "object-copy-a",
      parentId: "copy:group-a"
    });
    expect(result.snapshot.nodes["copy:point-a"]).toMatchObject({
      kind: "light",
      lightId: "copy:point-a",
      parentId: "copy:group-a"
    });
    expect(result.snapshot.objects["object-copy-a"].parentId).toBeNull();
    expect(result.snapshot.lights["copy:point-a"]).toMatchObject({ kind: "point", name: "Point light" });
    expect(result.snapshot.materials.assignments["object:object-copy-a"]).toBeTruthy();
    expect(result.snapshot.selection).toEqual({ nodeId: "copy:group-a", nodeIds: ["copy:group-a"], objectId: null, objectIds: [] });
  });

  it("remaps imported owner-scoped keys and material slot assignments when pasting node payloads", () => {
    const source = createExpandedGlbEditor();
    const slotId = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    const copySlotId = "glb:object-copy-a/slot:meshes/0/primitives/0:material-0";
    source.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      materialId: "material-a",
      materialName: "Imported material",
      material: { color: "#ff0000" }
    });
    source.dispatch({ type: "select-node", nodeId: "object-a" });
    const payload = createNodeClipboardPayload(source.getSnapshot());

    const result = source.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });
    const copyPrimitive = Object.values(result.snapshot.nodes).find((node) =>
      node.kind === "imported" && node.importKey === "glb:object-copy-a/primitive:meshes/0/primitives/0"
    );

    expect(result.ok).toBe(true);
    expect(copyPrimitive).toMatchObject({
      kind: "imported",
      ownerObjectId: "object-copy-a",
      materialSlots: [{
        slotKey: copySlotId,
        materialImportKey: "glb:object-copy-a/material:materials/0"
      }]
    });
    expect(result.snapshot.materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-copy-a",
      slotId: copySlotId
    })]).toBeDefined();

    const deletedCopy = source.dispatch({
      type: "delete-nodes",
      nodeIds: [copyPrimitive!.id]
    });

    expect(deletedCopy.ok).toBe(true);
    expect(deletedCopy.snapshot.materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-a",
      slotId
    })]).toBeDefined();
    expect(deletedCopy.snapshot.materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-copy-a",
      slotId: copySlotId
    })]).toBeUndefined();
  });
});

function createExpandedGlbEditor() {
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
              meshes: [{
                primitives: [{ attributes: { POSITION: 0 }, material: 0 }]
              }],
              materials: [{ name: "Red" }]
            }
          }
        }
      }))
    },
    expandImportedTargets: true
  });
  return editor;
}
