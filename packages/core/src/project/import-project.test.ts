import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { resolveDefaultPresentationView } from "../cameras/resolve";
import { createMaterialAssignmentId } from "../materials/defaults";
import { createEditor } from "../editor/create-editor";
import type { SceneImportedGlbNode } from "../snapshot/types";
import { Group } from "three";

describe("project import", () => {
  it("restores a valid package and resolves packaged payloads", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) } });
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    expect(imported.ok).toBe(true);
    expect(fresh.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(fresh.exportProject().ok).toBe(true);
  });

  it("preserves prior editor state when validation fails", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-before", asset: { id: "asset-before" } });

    const imported = editor.importProject(new Uint8Array([0, 1, 2]));

    expect(imported.ok).toBe(false);
    expect(editor.getSnapshot().objects["object-before"]).toBeDefined();
    expect(editor.getHistoryState().undoCount).toBe(1);
  });

  it("clears target-bound viewport helper state after successful import", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) } });
    const exported = source.exportProject();
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "old-asset" } });
    editor.viewportHelpers.setVisibility({ grid: true, hover: true, snapFeedback: true });
    editor.viewportHelpers.setHover("object-a");
    editor.viewportHelpers.setSnapFeedback({
      status: "dragging-snapped",
      nodeId: "object-a",
      mode: "translate",
      increment: 0.5,
      channelSnapped: true
    });

    const imported = editor.importProject(exported.packageBytes as Uint8Array);

    expect(imported.ok).toBe(true);
    expect(editor.viewportHelpers.get()).toMatchObject({
      visibility: {
        grid: true,
        hover: true,
        snapFeedback: true
      },
      hoverNodeId: null,
      snapFeedback: {
        status: "idle",
        nodeId: null
      }
    });
  });

  it("round-trips v4 node graph, selection, materials, lights, environment, problems, and asset references", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      parentId: "group-a",
      asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
    });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#445566" } });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr", source: new Uint8Array([9, 8, 7]) } });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a" }
      }
    });
    editor.dispatch({ type: "select-node", nodeId: "group-a" });
    const store = (editor as typeof editor & {
      store: {
        replaceSnapshot(snapshot: ReturnType<typeof editor.getSnapshot>): ReturnType<typeof editor.getSnapshot>;
      };
    }).store;
    const withProblem = store.replaceSnapshot({
      ...editor.getSnapshot(),
      problems: {
        acknowledged: {
          "missing-a": { problemId: "missing-a", acknowledgedAt: "2026-06-03T00:00:00.000Z" }
        }
      }
    });
    expect(withProblem.problems.acknowledged["missing-a"]).toBeTruthy();
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    expect(imported.ok).toBe(true);
    expect(imported.manifest?.version).toBe(1);
    expect(fresh.getSnapshot().version).toBe(6);
    expect(fresh.getSnapshot().nodes["group-a"]).toMatchObject({ kind: "group", children: ["object-a", "point-a"] });
    expect(fresh.getSnapshot().selection).toEqual({ nodeId: "group-a", nodeIds: ["group-a"], objectId: null, objectIds: [] });
    expect(fresh.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(fresh.getSnapshot().lights["point-a"].kind).toBe("point");
    expect(fresh.getSnapshot().materials.assignments["object:object-a"]).toBeTruthy();
    expect(fresh.getSnapshot().environment.environment.assetId).toBe("hdr-a");
    expect(fresh.getSnapshot().problems.acknowledged["missing-a"]).toBeTruthy();
    expect(fresh.exportProject().ok).toBe(true);
  });

  it("round-trips imported GLB targets, slot assignments, and payloads through project import", () => {
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
      type: "set-material",
      target: {
        kind: "material-slot",
        objectId: "object-a",
        slotId: "glb:object-a/slot:meshes/0/primitives/0:material-0"
      },
      material: { color: "#ff0000" }
    });
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    expect(imported.ok).toBe(true);
    expect(Object.values(fresh.getSnapshot().nodes).find((node) => node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/0/primitives/0")).toMatchObject({
      kind: "imported",
      ownerObjectId: "object-a",
      materialSlots: [expect.objectContaining({ slotKey: "glb:object-a/slot:meshes/0/primitives/0:material-0" })]
    });
    expect(fresh.getSnapshot().materials.assignments["material-slot:object-a:glb:object-a/slot:meshes/0/primitives/0:material-0"]).toBeDefined();
    expect(fresh.exportProject().ok).toBe(true);
  });

  it("round-trips authored camera views and resolves the default presentation view", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-camera-view",
      view: {
        id: "view-a",
        name: "Hero view",
        projection: { kind: "perspective", fov: 45 },
        position: [4, 3, 2],
        target: [0, 1, 0],
        near: 0.1,
        far: 250
      }
    });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-a" });
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    const resolution = resolveDefaultPresentationView(fresh.getSnapshot());
    expect(imported.ok).toBe(true);
    expect(fresh.getSnapshot().cameras["view-a"]).toMatchObject({
      name: "Hero view",
      projection: { kind: "perspective", fov: 45 },
      position: [4, 3, 2],
      target: [0, 1, 0]
    });
    expect(resolution).toMatchObject({
      status: "resolved",
      defaultCameraId: "view-a",
      view: { id: "view-a", name: "Hero view" }
    });
    expect(JSON.stringify(fresh.serialize())).not.toContain("OrbitControls");
    expect(JSON.stringify(fresh.serialize())).not.toContain("PerspectiveCamera");
  });

  it("round-trips reimported GLB remap metadata and replacement payloads through project import", async () => {
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
    const primitive = Object.values(editor.getSnapshot().nodes)
      .find((node): node is SceneImportedGlbNode => node.kind === "imported" && node.source.kind === "primitive")!;
    const oldSlotKey = primitive.materialSlots![0]!.slotKey;
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: oldSlotKey },
      materialId: "material-a",
      materialName: "Slot override",
      material: { color: "#ff0000" }
    });
    const replacementManifest = withPrimitivePath(createImportManifest(), "meshes/panel/primitives/0");
    const reimported = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: new Uint8Array([9, 8, 7]),
      loader: {
        load: async () => new Group(),
        analyze: async () => ({ scene: new Group(), manifest: replacementManifest })
      }
    });
    const exported = editor.exportProject();
    const fresh = createEditor();

    const imported = fresh.importProject(exported.packageBytes as Uint8Array);

    const newSlotKey = "glb:object-a/slot:meshes/panel/primitives/0:material-0";
    expect(reimported.ok).toBe(true);
    expect(imported.ok).toBe(true);
    expect(fresh.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(fresh.getAssetWorkspacePayloads()).toEqual([expect.objectContaining({
      assetId: "asset-a",
      byteSize: 3,
      checksum: "fnv1a32-3213b079"
    })]);
    expect(fresh.getSnapshot().assets["asset-a"].metadata?.glbImportManifest).toMatchObject({
      meshes: [expect.objectContaining({
        primitives: [expect.objectContaining({ path: "meshes/panel/primitives/0" })]
      })]
    });
    expect(fresh.getSnapshot().nodes[primitive.id]).toMatchObject({
      importKey: "glb:object-a/primitive:meshes/panel/primitives/0",
      remap: { status: "resolved", previousImportKey: "glb:object-a/primitive:meshes/0/primitives/0" }
    });
    expect(fresh.getSnapshot().materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-a",
      slotId: newSlotKey
    })]).toBeDefined();
    expect(JSON.stringify(fresh.serialize())).not.toContain("Object3D");
    expect(JSON.stringify(fresh.serialize())).not.toContain("runtime");
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

function withPrimitivePath(manifest: ReturnType<typeof createImportManifest>, path: string) {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [{
        ...primitive,
        path
      }]
    }]
  };
}
