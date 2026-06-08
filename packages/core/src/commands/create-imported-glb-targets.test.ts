import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createEditor } from "../editor/create-editor";
import { createMaterialAssignmentId } from "../materials/defaults";
import { findImportedGlbMaterialSlot } from "../imported-targets/slots";
import type { SceneSnapshot } from "../snapshot/types";

describe("create imported GLB targets command", () => {
  it("creates imported target nodes from GLB manifest metadata and restores through undo/redo", () => {
    const editor = createEditor();
    const metadata = attachGlbImportManifestMetadata(undefined, createManifest());
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata }
    });

    const result = editor.dispatch({
      type: "create-imported-glb-targets",
      ownerObjectId: "object-a"
    });

    expect(result.ok).toBe(true);
    const nodeTarget = findImportedNodeIdByKey(result.snapshot, "glb:object-a/node:nodes/0");
    const meshTarget = findImportedNodeIdByKey(result.snapshot, "glb:object-a/mesh:meshes/0");
    expect(nodeTarget).toBeTruthy();
    expect(meshTarget).toBeTruthy();
    expect(result.snapshot.nodes["object-a"].children).toContain(nodeTarget);
    expect(result.snapshot.nodes[nodeTarget!]).toMatchObject({
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 }
    });
    expect(findImportedGlbMaterialSlot(
      result.snapshot,
      "object-a",
      "glb:object-a/slot:meshes/0/primitives/0:material-0"
    )).toMatchObject({
      ownerObjectId: "object-a",
      importKey: "glb:object-a/primitive:meshes/0/primitives/0"
    });

    editor.undo();
    expect(Object.values(editor.getSnapshot().nodes).some((node) => node.kind === "imported")).toBe(false);
    expect(editor.getSnapshot().objects["object-a"]).toBeDefined();

    editor.redo();
    expect(findImportedNodeIdByKey(editor.getSnapshot(), "glb:object-a/node:nodes/0")).toBeTruthy();
  });

  it("keeps object-level import as the default path unless expansion is requested", () => {
    const editor = createEditor();
    const metadata = attachGlbImportManifestMetadata(undefined, createManifest());

    const simple = editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata }
    });
    const expanded = editor.dispatch({
      type: "import-glb",
      objectId: "object-b",
      asset: { id: "asset-b", metadata },
      expandImportedTargets: true
    });

    expect(simple.ok).toBe(true);
    expect(expanded.ok).toBe(true);
    expect(simple.snapshot.nodes["object-a"].children).toEqual([]);
    expect(Object.values(expanded.snapshot.nodes).some((node) => node.kind === "imported" && node.ownerObjectId === "object-b")).toBe(true);
  });

  it("fails without mutation when manifest metadata is missing", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const before = editor.getSnapshot();

    const result = editor.dispatch({ type: "create-imported-glb-targets", ownerObjectId: "object-a" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("manifest");
    expect(editor.getSnapshot()).toBe(before);
  });

  it("selects and transforms imported targets without mutating object payload mirrors", () => {
    const editor = createExpandedEditor();
    const importedNodeId = findImportedNodeIdByKey(editor.getSnapshot(), "glb:object-a/node:nodes/0")!;

    const selected = editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    const transformed = editor.dispatch({
      type: "set-node-transform",
      nodeId: importedNodeId,
      transform: { position: [1, 2, 3] }
    });

    expect(selected.snapshot.selection).toEqual({
      nodeId: importedNodeId,
      nodeIds: [importedNodeId],
      objectId: null,
      objectIds: []
    });
    expect(transformed.snapshot.nodes[importedNodeId]).toMatchObject({
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] }
    });
    expect(transformed.snapshot.objects["object-a"].transform.position).toEqual([0, 0, 0]);
  });

  it("rejects imported target reparenting outside the owner subtree and regular nodes under imported targets", () => {
    const editor = createExpandedEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    const importedNodeId = findImportedNodeIdByKey(editor.getSnapshot(), "glb:object-a/node:nodes/0")!;
    const before = editor.getSnapshot();

    const differentOwner = editor.dispatch({ type: "reparent-node", nodeId: importedNodeId, parentId: "object-b" });
    const regularUnderImported = editor.dispatch({ type: "reparent-node", nodeId: "object-b", parentId: importedNodeId });

    expect(differentOwner.ok).toBe(false);
    expect(differentOwner.error).toContain("different owner");
    expect(regularUnderImported.ok).toBe(false);
    expect(regularUnderImported.error).toContain("imported node");
    expect(editor.getSnapshot()).toBe(before);
  });

  it("deletes imported target subtrees and imported slot assignments without deleting material definitions", () => {
    const editor = createExpandedEditor();
    const slotId = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    const assignmentId = createMaterialAssignmentId({ kind: "material-slot", objectId: "object-a", slotId });
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      materialId: "material-a",
      materialName: "Imported material",
      material: { color: "#ff0000" }
    });

    const result = editor.dispatch({
      type: "delete-nodes",
      nodeIds: [findImportedNodeIdByKey(editor.getSnapshot(), "glb:object-a/mesh:meshes/0")!]
    });

    expect(result.ok).toBe(true);
    expect(findImportedNodeIdByKey(result.snapshot, "glb:object-a/mesh:meshes/0")).toBeNull();
    expect(result.snapshot.materials.assignments[assignmentId]).toBeUndefined();
    expect(result.snapshot.materials.definitions["material-a"]).toBeDefined();
    expect(result.snapshot.objects["object-a"]).toBeDefined();
  });
});

function createExpandedEditor() {
  const editor = createEditor();
  const metadata = attachGlbImportManifestMetadata(undefined, createManifest());
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: { id: "asset-a", metadata },
    expandImportedTargets: true
  });
  return editor;
}

function findImportedNodeIdByKey(snapshot: SceneSnapshot, importKey: string): string | null {
  return Object.values(snapshot.nodes).find((node) => node.kind === "imported" && node.importKey === importKey)?.id ?? null;
}

function createManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Root", mesh: 0 }],
          meshes: [{
            name: "Panel",
            primitives: [{ attributes: { POSITION: 0 }, material: 0 }]
          }],
          materials: [{ name: "Red" }]
        }
      }
    }
  });
}
