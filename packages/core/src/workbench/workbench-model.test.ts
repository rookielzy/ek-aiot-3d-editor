import { describe, expect, it } from "vitest";
import { createMissingAssetProblem } from "../assets/problems";
import { createEditor } from "../editor/create-editor";
import { buildInspectorModel } from "../inspector/selection";
import { createEnvironmentAssetUnresolvedProblem } from "../runtime/problems";
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
