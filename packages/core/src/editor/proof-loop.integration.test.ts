import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createEditor } from "./create-editor";

describe("proof-loop integration contract", () => {
  it("serializes a stable asset reference, object identity, and transform after GLB import", () => {
    const editor = createEditor();

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Simple box" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 2, 3] } });
    const saved = editor.serialize();

    expect(saved.assets["asset-a"]).toEqual({ id: "asset-a", kind: "glb", label: "Simple box" });
    expect(saved.objects["object-a"].asset.id).toBe("asset-a");
    expect(saved.objects["object-a"].transform.position).toEqual([1, 2, 3]);
  });

  it("serializes and restores imported GLB targets without runtime leakage", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        label: "Machine",
        metadata: attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
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
        }))
      },
      expandImportedTargets: true
    });
    const importedNodeId = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/0/primitives/0")?.id;
    editor.dispatch({
      type: "select-node",
      nodeId: importedNodeId ?? null
    });
    const saved = editor.serialize();
    const restored = createEditor({ snapshot: saved });

    expect(Object.values(restored.getSnapshot().nodes).find((node) => node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/0/primitives/0")).toMatchObject({
      kind: "imported",
      ownerObjectId: "object-a",
      materialSlots: [expect.objectContaining({ slotKey: "glb:object-a/slot:meshes/0/primitives/0:material-0" })]
    });
    expect(restored.getSnapshot().selection.nodeId).toBe(importedNodeId);
    expect(restored.getSnapshot().selection.objectId).toBeNull();
    expect(JSON.stringify(saved)).not.toContain("Object3D");
    expect(JSON.stringify(saved)).not.toContain("blob:");
  });
});
