import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { decodeArchiveJson, defaultArchiveAdapter } from "./archive-adapter";
import { PROJECT_SCENE_PATH } from "./package-types";
import { createEditor } from "../editor/create-editor";
import type { EditorMarqueeSelectionState } from "../editor/marquee-selection-state";

describe("project export", () => {
  it("exports scene, manifest, and payload entries when payloads are available", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.packageBytes).toBeInstanceOf(Uint8Array);
    expect(result.manifest?.assets["asset-a"]).toMatchObject({
      id: "asset-a",
      kind: "glb",
      payloadPath: "assets/asset-a.glb",
      byteSize: 3
    });
  });

  it("fails complete export when a referenced payload is unavailable", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = editor.exportProject();

    expect(result.ok).toBe(false);
    expect(result.packageBytes).toBeUndefined();
    expect(result.problems).toMatchObject([{ code: "project-export-payload-missing" }]);
  });

  it("marks partial packages when explicitly requested", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = editor.exportProject({ partial: true });

    expect(result.ok).toBe(false);
    expect(result.packageBytes).toBeInstanceOf(Uint8Array);
    expect(result.manifest?.completeness).toBe("partial");
  });

  it("exports payloads registered by import commands inside a batch", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "batch",
      commands: [
        {
          type: "import-glb",
          objectId: "object-a",
          asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
        }
      ]
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.manifest?.assets["asset-a"]).toMatchObject({
      id: "asset-a",
      payloadPath: "assets/asset-a.glb",
      byteSize: 3
    });
  });

  it("exports v4 node graph scenes without changing the project package layout", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      parentId: "group-a",
      asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
    });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.manifest?.version).toBe(1);
    expect(result.manifest?.scenePath).toBe("scene.json");
    expect(result.manifest?.assets["asset-a"].payloadPath).toBe("assets/asset-a.glb");
  });

  it("exports imported GLB target metadata in scene.json while keeping payload bytes under assets", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        source: new Uint8Array([1, 2, 3]),
        metadata: attachGlbImportManifestMetadata(undefined, createImportManifest())
      },
      expandImportedTargets: true
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const scene = decodeArchiveJson(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);

    expect(JSON.stringify(scene)).toContain("\"kind\":\"imported\"");
    expect(JSON.stringify(scene)).not.toContain("isObject3D");
    expect(result.manifest?.assets["asset-a"].payloadPath).toBe("assets/asset-a.glb");
  });

  it("does not export imported target runtime links or runtime problems", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        source: new Uint8Array([1, 2, 3]),
        metadata: attachGlbImportManifestMetadata(undefined, createImportManifest())
      },
      expandImportedTargets: true
    });
    const importedNode = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/0/primitives/0");
    expect(importedNode?.kind).toBe("imported");
    editor.dispatch({
      type: "set-node-transform",
      nodeId: importedNode!.id,
      transform: { position: [1, 2, 3] }
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const serializedScene = new TextDecoder().decode(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);
    const scene = JSON.parse(serializedScene);
    expect(serializedScene).toContain(importedNode!.id);
    expect(scene.nodes[importedNode!.id]).toMatchObject({ kind: "imported", transform: { position: [1, 2, 3] } });
    expect(serializedScene).not.toContain("Object3D");
    expect(serializedScene).not.toContain("importedTargetBaseTransform");
    expect(serializedScene).not.toContain("runtimeOnly");
    expect(serializedScene).not.toContain("imported-target-missing");
  });

  it("does not export viewport helper, hover, or snap feedback session state", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
    });
    editor.viewportHelpers.setVisibility({
      grid: true,
      floor: true,
      axes: true,
      selectionBounds: true,
      hover: true,
      snapFeedback: true
    });
    editor.viewportHelpers.setHover("object-a");
    editor.viewportHelpers.setSnapFeedback({
      status: "dragging-snapped",
      nodeId: "object-a",
      mode: "translate",
      increment: 0.5,
      channelSnapped: true,
      before: [0, 0, 0],
      preview: [1.24, -0.26, 0],
      snapped: [1, -0.5, 0]
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const serializedScene = new TextDecoder().decode(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);
    expect(serializedScene).toContain("object-a");
    expect(serializedScene).not.toContain("viewportHelpers");
    expect(serializedScene).not.toContain("viewportHelper");
    expect(serializedScene).not.toContain("hoverNodeId");
    expect(serializedScene).not.toContain("snapFeedback");
    expect(serializedScene).not.toContain("dragging-snapped");
    expect(serializedScene).not.toContain("GridHelper");
    expect(serializedScene).not.toContain("Object3D");
  });

  it("does not export marquee overlay or candidate session state", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
    });
    const marqueeSelection = editor.marqueeSelection as EditorMarqueeSelectionState;
    marqueeSelection.start({ x: 20, y: 30 }, "replace");
    marqueeSelection.drag({ x: 90, y: 110 }, ["object-a"]);
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a"], primaryNodeId: "object-a" });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const serializedScene = new TextDecoder().decode(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);
    const scene = JSON.parse(serializedScene);
    expect(scene.selection.nodeIds).toEqual(["object-a"]);
    expect(serializedScene).not.toContain("marquee");
    expect(serializedScene).not.toContain("candidateNodeIds");
    expect(serializedScene).not.toContain("\"left\":20");
    expect(serializedScene).not.toContain("PointerEvent");
  });

  it("exports authored camera views as durable presentation state without runtime camera objects", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-camera-view",
      view: {
        id: "view-a",
        name: "Hero view",
        projection: { kind: "perspective", fov: 52 },
        position: [1, 2, 3],
        target: [0, 0.5, 0],
        near: 0.2,
        far: 500,
        metadata: { source: "author" }
      }
    });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-a" });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const serializedScene = new TextDecoder().decode(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);
    const scene = JSON.parse(serializedScene);
    expect(scene.presentation.defaultViewId).toBe("view-a");
    expect(scene.presentation.cameraViews["view-a"]).toMatchObject({
      id: "view-a",
      name: "Hero view",
      projection: { kind: "perspective", fov: 52 },
      position: [1, 2, 3],
      target: [0, 0.5, 0],
      near: 0.2,
      far: 500
    });
    expect(serializedScene).not.toContain("PerspectiveCamera");
    expect(serializedScene).not.toContain("OrbitControls");
    expect(serializedScene).not.toContain("Object3D");
    expect(serializedScene).not.toContain("resolver");
    expect(serializedScene).not.toContain("object URL");
    expect(serializedScene).not.toContain("runtime");
  });

  it("exports material-slot assignments and texture references without runtime material values", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        source: new Uint8Array([1, 2, 3]),
        metadata: attachGlbImportManifestMetadata(undefined, createImportManifest())
      },
      expandImportedTargets: true
    });
    editor.dispatch({
      type: "register-asset",
      asset: { id: "texture-a", kind: "texture", source: new Uint8Array([4, 5, 6]) }
    });
    const slotId = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#ff0000", textures: { map: { assetId: "texture-a" } } }
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    const archiveEntries = defaultArchiveAdapter.read(result.packageBytes as Uint8Array);
    const serializedScene = new TextDecoder().decode(archiveEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes);
    const scene = JSON.parse(serializedScene);
    expect(scene.materials.assignments[`material-slot:object-a:${slotId}`]).toMatchObject({
      target: { kind: "material-slot", objectId: "object-a", slotId }
    });
    expect(scene.materials.definitions[`material:material-slot:object-a:${slotId}`].override.textures.map).toEqual({
      assetId: "texture-a"
    });
    expect(serializedScene).not.toContain("MeshStandardMaterial");
    expect(serializedScene).not.toContain("isTexture");
    expect(serializedScene).not.toContain("object URL");
    expect(serializedScene).not.toContain("imported-material-slot-unresolved");
  });
});

function createImportManifest() {
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
