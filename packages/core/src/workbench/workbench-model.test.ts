import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createMissingAssetProblem } from "../assets/problems";
import { planGlbImportRemap } from "../assets/import-remap";
import { createEditor } from "../editor/create-editor";
import { createMaterialAssignmentId } from "../materials/defaults";
import { buildInspectorModel } from "../inspector/selection";
import { createEnvironmentAssetUnresolvedProblem, createImportedTargetMissingProblem } from "../runtime/problems";
import { filterAssetWorkspaceItems, sortAssetWorkspaceItems } from "../assets/workspace";
import type { Problem } from "../problems/types";
import { buildWorkbenchModel } from "./workbench-model";

describe("workbench model", () => {
  it("derives ordered hierarchy rows with selection, kind, and problem metadata", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Base", asset: { id: "asset-a", label: "Base GLB" }, parentId: "group-a" });
    editor.dispatch({ type: "import-glb", objectId: "object-b", name: "Arm", asset: { id: "asset-b" }, parentId: "group-a" });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", name: "Key", transform: { position: [1, 2, 3] } } });
    editor.dispatch({ type: "select-node", nodeId: "object-b" });

    const runtimeProblems = [createMissingAssetProblem("asset-b", "object-b")];
    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeProblems }),
      runtimeProblems,
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect(model.hierarchy.roots.map((row) => row.id)).toEqual(["group-a", "point-a"]);
    expect(model.hierarchy.rows.map((row) => [row.id, row.depth])).toEqual([
      ["group-a", 0],
      ["object-a", 1],
      ["object-b", 1],
      ["point-a", 0]
    ]);
    expect(model.hierarchy.rows.find((row) => row.id === "object-b")).toMatchObject({
      label: "Arm",
      kind: "object",
      objectId: "object-b",
      selected: true,
      problemCount: 1,
      highestProblemSeverity: "warning"
    });
    expect(model.hierarchy.rows.find((row) => row.id === "group-a")).toMatchObject({
      label: "Assembly",
      kind: "group",
      problemCount: 1,
      highestProblemSeverity: "warning"
    });
    expect(model.hierarchy.rows.find((row) => row.id === "point-a")).toMatchObject({
      label: "Key",
      kind: "light",
      lightId: "point-a"
    });
  });

  it("exposes camera view counts and runtime camera toolbar capabilities", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero" } });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-a" });
    const snapshot = editor.getSnapshot();

    const notReady = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { activeCameraViewId: "view-a", runtimeReady: false }),
      runtimeReady: false
    });
    const ready = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { activeCameraViewId: "view-a", runtimeReady: true }),
      runtimeReady: true
    });

    expect(notReady.project).toMatchObject({
      cameraViewCount: 1,
      defaultCameraViewId: "view-a"
    });
    expect(notReady.toolbar.canCaptureCameraView).toBe(false);
    expect(notReady.toolbar.canApplyCameraView).toBe(false);
    expect(ready.toolbar.canCaptureCameraView).toBe(true);
    expect(ready.toolbar.canApplyCameraView).toBe(true);
  });

  it("marks selected camera hierarchy rows and disables node copy duplication", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero" } });
    editor.dispatch({ type: "select-node", nodeId: "view-a" });
    const snapshot = editor.getSnapshot();

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeReady: true }),
      runtimeReady: true
    });

    expect(model.selection).toMatchObject({
      nodeId: "view-a",
      nodeKind: "camera",
      cameraViewId: "view-a"
    });
    expect(model.hierarchy.rows.find((row) => row.id === "view-a")).toMatchObject({
      kind: "camera",
      cameraViewId: "view-a",
      selected: true
    });
    expect(model.toolbar.canCopy).toBe(false);
    expect(model.toolbar.canDuplicate).toBe(false);
    expect(model.toolbar.canGroup).toBe(false);
    expect(model.toolbar.canDelete).toBe(true);
    expect(model.toolbar.canApplyCameraView).toBe(true);
  });

  it("disables copy duplication when a selected subtree contains camera nodes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero" } });
    const snapshot = {
      ...editor.getSnapshot(),
      nodes: {
        ...editor.getSnapshot().nodes,
        "group-a": { ...editor.getSnapshot().nodes["group-a"], children: ["view-a"] },
        "view-a": { ...editor.getSnapshot().nodes["view-a"], parentId: "group-a" }
      },
      rootNodeIds: ["group-a"],
      selection: {
        nodeId: "group-a",
        nodeIds: ["group-a"],
        objectId: null,
        objectIds: []
      }
    };

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot)
    });

    expect(model.toolbar.canCopy).toBe(false);
    expect(model.toolbar.canDuplicate).toBe(false);
  });

  it("passes runtime readiness to the fallback inspector model", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero" } });
    editor.dispatch({ type: "set-default-camera-view", viewId: "view-a" });

    const model = buildWorkbenchModel(editor.getSnapshot(), { runtimeReady: true });

    expect(model.toolbar.canCaptureCameraView).toBe(true);
    expect(model.toolbar.canApplyCameraView).toBe(true);
  });

  it("shows registered assets and missing-asset recovery state without resolver outputs", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Known" } });
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Texture" } });

    const runtimeProblems = [
      createMissingAssetProblem("asset-a", "object-a"),
      createEnvironmentAssetUnresolvedProblem("hdr-missing", "environment")
    ];
    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeProblems }),
      runtimeProblems,
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect(model.assets.items).toEqual([
      expect.objectContaining({
        id: "asset-a",
        label: "Known",
        kind: "glb",
        referenced: true,
        missing: true,
        problemCount: 1
      }),
      expect.objectContaining({
        id: "texture-a",
        label: "Texture",
        kind: "texture",
        referenced: false,
        missing: false,
        problemCount: 0
      })
    ]);
    expect(model.assets.missing).toEqual([
      expect.objectContaining({
        assetId: "asset-a",
        objectId: "object-a",
        actionLabel: "Replace asset"
      }),
      expect.objectContaining({
        assetId: "hdr-missing",
        objectId: undefined,
        actionLabel: "Replace asset"
      })
    ]);
    expect(JSON.stringify(model)).not.toContain("blob:");
    expect(JSON.stringify(model)).not.toContain("uri");
  });

  it("attributes imported target runtime problems to hierarchy rows", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Machine",
      asset: { id: "asset-a", label: "Machine GLB", metadata: createImportedManifestMetadata() },
      expandImportedTargets: true
    });
    const importedNode = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.importKey === "glb:object-a/node:nodes/0");
    expect(importedNode?.kind).toBe("imported");
    editor.dispatch({ type: "select-node", nodeId: importedNode!.id });
    const runtimeProblems = [createImportedTargetMissingProblem({
      node: importedNode!,
      ownerObjectId: "object-a",
      importKey: importedNode!.importKey,
      source: importedNode!.source,
      status: "missing",
      pickable: false,
      transformable: false,
      pickPriority: 30,
      aliasNodeIds: []
    })];
    const snapshot = editor.getSnapshot();

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeProblems }),
      runtimeProblems,
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(model.selection).toMatchObject({
      nodeId: importedNode!.id,
      nodeKind: "imported",
      objectId: null
    });
    expect(model.hierarchy.rows.find((row) => row.id === importedNode!.id)).toMatchObject({
      kind: "imported",
      objectId: "object-a",
      assetId: "asset-a",
      selected: true,
      problemCount: 1,
      highestProblemSeverity: "warning"
    });
    expect(JSON.stringify(model)).not.toContain("Object3D");
  });

  it("attributes light-targeted runtime diagnostics to light hierarchy rows", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", name: "Point shadow" } });
    const runtimeProblems: Problem[] = [{
      id: "lighting-point-shadow-cost:point-a",
      severity: "warning",
      code: "lighting-point-shadow-cost",
      source: "runtime",
      target: { kind: "light", lightId: "point-a" },
      recoverability: "user-action",
      message: "Point shadows render six faces.",
      display: { title: "Point light shadow is expensive" }
    }];
    const snapshot = editor.getSnapshot();

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeProblems }),
      runtimeProblems,
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(model.hierarchy.rows.find((row) => row.lightId === "point-a")).toMatchObject({
      problemCount: 1,
      problemIds: ["lighting-point-shadow-cost:point-a"],
      highestProblemSeverity: "warning"
    });
    expect(model.problems.runtimeCount).toBe(1);
    expect(snapshot.problems.acknowledged).toEqual({});
  });

  it("derives unresolved GLB reimport problems from durable remap metadata", () => {
    const editor = createEditor();
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Panel", mesh: 0 }],
            meshes: [{
              name: "Panel mesh",
              primitives: [{ attributes: { POSITION: 0 }, material: 0 }]
            }],
            materials: [{ name: "Red" }]
          }
        }
      }
    });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, manifest) },
      expandImportedTargets: true
    });
    const primitive = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.source.kind === "primitive")!;
    const slotId = primitive.materialSlots![0]!.slotKey;
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      materialId: "material-a",
      materialName: "Override",
      material: { color: "#ff0000" }
    });
    const replacement = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Replacement" }]
          }
        }
      }
    });
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: Object.values(editor.getSnapshot().nodes).filter((node) => node.kind === "imported"),
      replacementManifest: replacement
    });
    editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacement,
      remap
    });
    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(snapshot.problems.acknowledged).toEqual({});
    expect(snapshot.materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-a",
      slotId
    })]).toBeDefined();
    expect(model.problems.items.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "imported-target-unresolved",
      "imported-material-slot-unresolved"
    ]));
    expect(model.hierarchy.rows.find((row) => row.id === primitive.id)).toMatchObject({
      problemCount: 2,
      highestProblemSeverity: "warning"
    });
    expect(model.assets.workspace?.items.find((item) => item.id === "asset-a")).toMatchObject({
      status: "missing-payload",
      problemCount: expect.any(Number)
    });
  });

  it("derives unresolved material-slot problems from matched target remap metadata", () => {
    const editor = createEditor();
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Panel", mesh: 0 }],
            meshes: [{
              name: "Panel mesh",
              primitives: [{ attributes: { POSITION: 0 }, material: 0 }]
            }],
            materials: [{ name: "Red" }]
          }
        }
      }
    });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, manifest) },
      expandImportedTargets: true
    });
    const primitive = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.source.kind === "primitive")!;
    const slotId = primitive.materialSlots![0]!.slotKey;
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      materialId: "material-a",
      materialName: "Override",
      material: { color: "#ff0000" }
    });
    const replacement = withoutPrimitiveMaterial(manifest);
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: Object.values(editor.getSnapshot().nodes).filter((node) => node.kind === "imported"),
      replacementManifest: replacement
    });
    editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacement,
      remap
    });
    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(snapshot.materials.assignments[createMaterialAssignmentId({
      kind: "material-slot",
      objectId: "object-a",
      slotId
    })]).toBeDefined();
    expect(snapshot.nodes[primitive.id]).toMatchObject({
      remap: {
        metadata: {
          unresolvedMaterialSlots: [slotId]
        }
      }
    });
    expect(model.problems.items.map((problem) => problem.code)).toEqual(["imported-material-slot-unresolved"]);
    expect(model.hierarchy.rows.find((row) => row.id === primitive.id)).toMatchObject({
      problemCount: 1,
      highestProblemSeverity: "warning"
    });
  });

  it("uses asset workspace payload summaries while preserving legacy asset item fields", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Known" } });
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Texture" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { textures: { map: { assetId: "texture-a" } } }
    });
    const snapshot = editor.getSnapshot();

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      assetPayloads: [{
        assetId: "asset-a",
        kind: "glb",
        available: true,
        exportable: true,
        byteSize: 3,
        mimeType: "model/gltf-binary"
      }],
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect(model.assets.items).toEqual([
      expect.objectContaining({
        id: "asset-a",
        referenced: true,
        missing: false
      }),
      expect.objectContaining({
        id: "texture-a",
        referenced: true,
        missing: false
      })
    ]);
    expect(model.assets.workspace!.items.map((asset) => [asset.id, asset.payloadStatus])).toEqual([
      ["asset-a", "available"],
      ["texture-a", "missing"]
    ]);
    expect(model.assets.missing).toEqual([]);
    expect(JSON.stringify(model.assets.workspace)).not.toContain("blob:");
    expect(JSON.stringify(model.assets.workspace)).not.toContain("\"bytes\"");
  });

  it("projects viewport helper and snap feedback session state without durable runtime objects", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.viewportHelpers.setVisibility({
      grid: true,
      floor: true,
      axes: false,
      selectionBounds: true,
      hover: true,
      snapFeedback: true
    });
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

    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      viewportHelpers: editor.viewportHelpers.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(model.toolbar.viewportHelpers).toMatchObject({
      grid: true,
      floor: true,
      axes: false,
      selectionBounds: true,
      hover: true,
      snapFeedback: true
    });
    expect(model.status.snapFeedbackLabel).toBe("Snap translate 0.5");
    expect(JSON.stringify(model)).not.toContain("Object3D");
    expect(JSON.stringify(editor.serialize())).not.toContain("snapFeedback");
  });

  it("exposes core asset workspace filter and sort behavior through the workbench model", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Pump", asset: { id: "pump-a", label: "Pump GLB" } });
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Pump Texture" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { textures: { map: { assetId: "texture-a" } } }
    });
    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      assetPayloads: [{
        assetId: "pump-a",
        kind: "glb",
        available: true,
        exportable: true
      }],
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect(filterAssetWorkspaceItems(model.assets.workspace!.items, { query: "pump texture", missing: true }).map((item) => item.id)).toEqual([
      "texture-a"
    ]);
    expect(sortAssetWorkspaceItems(model.assets.workspace!.items, { key: "payload" }).map((item) => item.id)).toEqual([
      "pump-a",
      "texture-a"
    ]);
  });

  it("derives deterministic toolbar and status affordances from editor state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    editor.transformMode.set("rotate");
    editor.snap.toggle("translate", 0.5);

    const snapshot = editor.getSnapshot();
    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(model.toolbar).toMatchObject({
      canUndo: true,
      canRedo: false,
      canCopy: true,
      canDuplicate: true,
      canDelete: true,
      canGroup: false,
      canUngroup: false,
      canClearSelection: true,
      canSelectAll: true,
      canFrameSelected: true,
      canFrameAll: true,
      transformMode: "rotate",
      snapEnabled: {
        translate: true,
        rotate: false,
        scale: false
      }
    });
    expect(model.status).toMatchObject({
      selectionLabel: "GLB object",
      selectionCount: 1,
      undoCount: 2,
      redoCount: 0,
      runtimeReady: true,
      dirty: true,
      projectCompleteness: "partial",
      problemCount: 0
    });
  });

  it("aligns asset workspace readiness with project export payload availability", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const blockedModel = buildWorkbenchModel(editor.getSnapshot(), {
      inspector: buildInspectorModel(editor.getSnapshot()),
      assetPayloads: editor.getAssetWorkspacePayloads(),
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(editor.exportProject().ok).toBe(false);
    expect(blockedModel.assets.workspace!.readiness).toMatchObject({
      completeness: "partial",
      ready: false,
      blockingAssetIds: ["asset-a"]
    });
    expect(blockedModel.project).toMatchObject({
      ready: false,
      statusLabel: "Partial"
    });

    await editor.replaceAsset({
      assetId: "asset-a",
      source: new Uint8Array([1, 2, 3]),
      kind: "glb",
      mimeType: "model/gltf-binary"
    });

    const readyModel = buildWorkbenchModel(editor.getSnapshot(), {
      inspector: buildInspectorModel(editor.getSnapshot()),
      assetPayloads: editor.getAssetWorkspacePayloads(),
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: true
    });

    expect(editor.exportProject().ok).toBe(true);
    expect(readyModel.assets.workspace!.readiness).toMatchObject({
      completeness: "complete",
      ready: true,
      blockingAssetIds: []
    });
    expect(readyModel.project).toMatchObject({
      ready: true,
      statusLabel: "Ready"
    });
  });

  it("combines authored, runtime, and project problem counts without snapshot writes", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const snapshot = {
      ...editor.getSnapshot(),
      problems: {
        acknowledged: {
          "old-problem": { problemId: "old-problem", acknowledgedAt: "2026-06-04T00:00:00.000Z" }
        }
      }
    };
    const runtimeProblems = [createMissingAssetProblem("asset-a", "object-a")];
    const projectProblems: Problem[] = [{
      id: "project:payload",
      severity: "error",
      code: "project-export-payload-missing",
      source: "validation",
      target: { kind: "asset", assetId: "asset-a" },
      assetId: "asset-a",
      message: "Project export is missing payload.",
      recoverability: "user-action"
    }];

    const model = buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot, { runtimeProblems }),
      runtimeProblems,
      projectProblems,
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect(model.problems.authoredCount).toBe(1);
    expect(model.problems.runtimeCount).toBe(1);
    expect(model.problems.projectCount).toBe(1);
    expect(model.problems.totalCount).toBe(3);
    expect(model.problems.bySeverity).toEqual({ info: 1, warning: 1, error: 1 });
    expect(snapshot.problems.acknowledged["old-problem"]).toEqual({
      problemId: "old-problem",
      acknowledgedAt: "2026-06-04T00:00:00.000Z"
    });
  });

  it("does not mutate snapshot nodes, assets, materials, environment, lights, or selection", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Group" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, parentId: "group-a" });
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient", name: "Fill" } });
    editor.dispatch({ type: "select-node", nodeId: "group-a" });
    const snapshot = editor.getSnapshot();
    const before = structuredClone({
      nodes: snapshot.nodes,
      rootNodeIds: snapshot.rootNodeIds,
      objects: snapshot.objects,
      assets: snapshot.assets,
      materials: snapshot.materials,
      environment: snapshot.environment,
      lights: snapshot.lights,
      selection: snapshot.selection
    });

    buildWorkbenchModel(snapshot, {
      inspector: buildInspectorModel(snapshot),
      runtimeProblems: [],
      history: editor.getHistoryState(),
      snap: editor.snap.get(),
      transformMode: editor.transformMode.get(),
      runtimeReady: false
    });

    expect({
      nodes: snapshot.nodes,
      rootNodeIds: snapshot.rootNodeIds,
      objects: snapshot.objects,
      assets: snapshot.assets,
      materials: snapshot.materials,
      environment: snapshot.environment,
      lights: snapshot.lights,
      selection: snapshot.selection
    }).toEqual(before);
  });
});

function createImportedManifestMetadata() {
  return attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel" }],
          meshes: []
        }
      }
    }
  }));
}

function withPrimitivePath(manifest: ReturnType<typeof createGlbImportManifest>, path: string): ReturnType<typeof createGlbImportManifest> {
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

function withoutPrimitiveMaterial(manifest: ReturnType<typeof createGlbImportManifest>): ReturnType<typeof createGlbImportManifest> {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  const { materialIndex, ...primitiveWithoutMaterial } = primitive;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [primitiveWithoutMaterial]
    }]
  };
}
