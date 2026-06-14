import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  createAdvancedEditorOperations,
  createClipboardPayload,
  createNodeClipboardPayload,
  createEmptySnapshot,
  buildAssetWorkspaceModel,
  buildInspectorModel,
  buildWorkbenchModel,
  buildMaterialFieldsForTarget,
  classifyWorkbenchAssetImportFile,
  filterAssetWorkspaceItems,
  GLB_IMPORT_MANIFEST_METADATA_KEY,
  importWorkbenchAssets,
  planGlbImportRemap,
  sortAssetWorkspaceItems,
  buildSetTransformCommand,
  createImportedGlbBindingDescriptor,
  createImportedGlbTargetDescriptors,
  ThreeGltfLoaderAdapter,
  EditorViewportHelperState,
  findImportedGlbMaterialSlot,
  resolveEditorShortcut,
  snapNumber,
  validateSceneSnapshot,
  type AdvancedEditorOperations,
  type AssetWorkspacePayloadSummary,
  type AssetWorkspaceReferenceKind,
  type AssetWorkspaceStatus,
  type BatchCommand,
  type CreateGroupCommand,
  type CreateImportedGlbTargetsCommand,
  type DeleteNodesCommand,
  type DeleteObjectsCommand,
  type DuplicateObjectsCommand,
  type EditorAction,
  type EditorClipboardPayload,
  type Editor,
  type EditorWithGlbImport,
  type GlbImportDiagnostic,
  type GlbImportManifest,
  type GlbImportRemapPlan,
  type GltfDecoderConfiguration,
  type GltfLoaderAdapter,
  type GroupNodesCommand,
  type GroupObjectsCommand,
  type InspectorModel,
  type InspectorCommandResult,
  type ImportGlbAssetOptions,
  type ImportGlbAssetResult,
  type ReimportGlbAssetOptions,
  type ReimportGlbAssetResult,
  type ReimportGlbCommand,
  type ImportedGlbMaterialSlotDescriptor,
  type ImportedGlbSourceDescriptor,
  type ImportedGlbTargetBindingDescriptor,
  type ImportedGlbTargetDescriptor,
  type LightDefinition,
  type MaterialInspectorTarget,
  type Problem,
  PROJECT_PACKAGE_VERSION,
  type ProjectAssetPayloadSummary,
  type SceneEnvironment,
  type SetMaterialCommand,
  type AddLightCommand,
  type AuthoredProblemState,
  type AssetOption,
  type BuildInspectorModelOptions,
  type BuildWorkbenchModelOptions,
  type ClipboardSceneNode,
  type EditorNodeClipboardPayload,
  type EditorObjectClipboardPayload,
  type InspectorFieldKind,
  type InspectorFieldOption,
  type MaterialState,
  type MaterialTexturePatch,
  type NodeId,
  type ProblemTarget,
  type RegisterAssetCommand,
  type ReparentNodeCommand,
  type RemoveLightCommand,
  type RuntimeInteractionOptions,
  type RuntimePointerSelectionInput,
  type RuntimeSelectionVisualOptions,
  type RuntimeTransformControlsOptions,
  type RuntimeViewportHelperOptions,
  type SceneEnvironmentPatch,
  type SceneImportedGlbNode,
  type SceneNode,
  type SceneObjectNode,
  type SelectNodeCommand,
  type SelectNodesCommand,
  type SelectObjectsCommand,
  type SetEnvironmentCommand,
  type SetNodeTransformCommand,
  type SnapSettings,
  type TextureSlot,
  type TransformAxis,
  type TransformMode,
  type TransformVectorName,
  type UngroupNodesCommand,
  type UpdateLightCommand,
  type WorkbenchAssetImportOptions,
  type WorkbenchAssetImportResult,
  type WorkbenchModel,
  type WorkbenchRasterImportKind
} from "./index";

describe("core public API", () => {
  it("exports the editor creation and snapshot contracts from the package root", () => {
    const editor = createEditor();

    expect(editor.getSnapshot()).toEqual(createEmptySnapshot(editor.getSnapshot().scene.id));
    expect(validateSceneSnapshot(editor.getSnapshot()).ok).toBe(true);

    editor.dispose();
  });

  it("keeps internal runtime modules out of package exports", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      description?: string;
      exports: Record<string, unknown>;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      files?: string[];
      license?: string;
      publishConfig?: { access?: string };
      repository?: { directory?: string; url?: string };
    };

    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.description).toContain("Framework-neutral");
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.publishConfig?.access).toBe("public");
    expect(packageJson.repository?.directory).toBe("packages/core");
    expect(packageJson.dependencies).toHaveProperty("three");
    expect(packageJson.dependencies).toHaveProperty("fflate");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("vue");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("react");
  });

  it("does not re-export internal runtime projectors or resource seams", async () => {
    const publicApi = await import("./index");

    expect(publicApi).not.toHaveProperty("EnvironmentProjector");
    expect(publicApi).not.toHaveProperty("EnvironmentResourceManager");
    expect(publicApi).not.toHaveProperty("LightProjector");
    expect(publicApi).not.toHaveProperty("MaterialProjector");
    expect(publicApi).not.toHaveProperty("MaterialResourceManager");
    expect(publicApi).not.toHaveProperty("ThreeTextureLoaderAdapter");
    expect(publicApi).not.toHaveProperty("ThreeHdrTextureLoaderAdapter");
    expect(publicApi).not.toHaveProperty("ThreePmremAdapter");
    expect(publicApi).not.toHaveProperty("ObjectPicker");
    expect(publicApi).not.toHaveProperty("RuntimeSelectionVisuals");
    expect(publicApi).not.toHaveProperty("createOrbitViewportCameraControls");
    expect(publicApi).not.toHaveProperty("SceneProjector");
    expect(publicApi).toHaveProperty("ThreeGltfLoaderAdapter");
    expect(publicApi).not.toHaveProperty("GlbImportError");
    expect(publicApi).not.toHaveProperty("configureGltfLoader");
    expect(publicApi).not.toHaveProperty("normalizeGltfLoaderOutput");
    expect(publicApi).not.toHaveProperty("glbImportDiagnosticToProblem");
    expect(publicApi).not.toHaveProperty("createGlbImportDiagnosticsFromError");
    expect(publicApi).not.toHaveProperty("ThreeNodeMap");
    expect(publicApi).not.toHaveProperty("ThreeObjectMap");
    expect(publicApi).not.toHaveProperty("ProjectAssetStore");
    expect(publicApi).not.toHaveProperty("defaultArchiveAdapter");
    expect(publicApi).not.toHaveProperty("exportProjectPackage");
  });

  it("exports expanded schema and command contracts from the package root", async () => {
    const command: SetMaterialCommand = {
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff" }
    };
    const environment: SceneEnvironment = createEmptySnapshot("scene-a").environment;
    const light: LightDefinition = {
      id: "light-a",
      kind: "ambient",
      name: "Fill",
      color: "#ffffff",
      intensity: 1
    };
    const problem: Problem = {
      id: "asset-unresolved:asset-a:object-a",
      severity: "warning",
      code: "asset-unresolved",
      source: "asset-resolver",
      target: { kind: "object", objectId: "object-a" },
      assetId: "asset-a",
      message: "Missing",
      recoverability: "user-action"
    };
    const registerAsset: RegisterAssetCommand = { type: "register-asset", asset: { id: "texture-a", kind: "texture" } };
    const setEnvironment: SetEnvironmentCommand = { type: "set-environment", environment: { background: { mode: "solid", color: "#ffffff" } } };
    const environmentPatch: SceneEnvironmentPatch = { environment: { rotation: { y: 0.5 } } };
    const addLight: AddLightCommand = { type: "add-light", light: { kind: "ambient" } };
    const updateLight: UpdateLightCommand = { type: "update-light", lightId: "light-a", patch: { intensity: 2 } };
    const removeLight: RemoveLightCommand = { type: "remove-light", lightId: "light-a" };
    const batch: BatchCommand = { type: "batch", commands: [removeLight] };
    const selectNode: SelectNodeCommand = { type: "select-node", nodeId: "node-a" };
    const selectNodes: SelectNodesCommand = { type: "select-nodes", mode: "replace", nodeIds: ["node-a"], primaryNodeId: "node-a" };
    const createGroup: CreateGroupCommand = { type: "create-group", nodeId: "group-a" };
    const createImportedTargets: CreateImportedGlbTargetsCommand = { type: "create-imported-glb-targets", ownerObjectId: "object-a" };
    const reimportRemap: GlbImportRemapPlan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: [],
      replacementManifest: createImportManifest([])
    });
    const reimportGlb: ReimportGlbCommand = {
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: createImportManifest([]),
      remap: reimportRemap
    };
    const deleteNodes: DeleteNodesCommand = { type: "delete-nodes", nodeIds: ["node-a"] };
    const groupNodes: GroupNodesCommand = { type: "group-nodes", nodeIds: ["node-a"], nodeId: "group-a" };
    const ungroupNodes: UngroupNodesCommand = { type: "ungroup-nodes", nodeId: "group-a" };
    const reparentNode: ReparentNodeCommand = { type: "reparent-node", nodeId: "node-a", parentId: null };
    const setNodeTransform: SetNodeTransformCommand = { type: "set-node-transform", nodeId: "node-a", transform: { position: [1, 2, 3] } };
    const selectObjects: SelectObjectsCommand = { type: "select-objects", mode: "clear" };
    const deleteObjects: DeleteObjectsCommand = { type: "delete-objects" };
    const duplicateObjects: DuplicateObjectsCommand = { type: "duplicate-objects" };
    const groupObjects: GroupObjectsCommand = { type: "group-objects" };
    const action: EditorAction = "copy";
    const snap: SnapSettings = { translate: 0.5 };
    const transformMode: TransformMode = "rotate";
    const transformControls: RuntimeTransformControlsOptions = { size: 0.75, space: "local" };
    const viewportHelpers: RuntimeViewportHelperOptions = { grid: true, floor: true, hover: true };
    const interactions: RuntimeInteractionOptions = { camera: true, pointerSelection: true, resize: true, selectionVisuals: true, transform: transformControls, viewportHelpers };
    const pointerInput: RuntimePointerSelectionInput = { clientX: 10, clientY: 20, modifiers: { ctrlKey: true } };
    const selectionVisuals: RuntimeSelectionVisualOptions = { selectedColor: "#4f8cff" };
    const textureSlot: TextureSlot = { assetId: "texture-a", colorSpace: "srgb" };
    const texturePatch: MaterialTexturePatch = { map: null };
    const packageVersion = PROJECT_PACKAGE_VERSION;
    const materialState: MaterialState = { definitions: {}, assignments: {} };
    const authoredProblems: AuthoredProblemState = { acknowledged: {} };
    const target: ProblemTarget = { kind: "environment", assetId: "hdr-a" };
    const inspectorOptions: BuildInspectorModelOptions = { activeLightId: "light-a" };
    const fieldKind: InspectorFieldKind = "number";
    const fieldOption: InspectorFieldOption = { value: "opaque", label: "Opaque" };
    const assetOption: AssetOption = { value: "asset-a", label: "Asset A", kind: "glb" };
    const transformVector: TransformVectorName = "position";
    const transformAxis: TransformAxis = "x";
    const nodeId: NodeId = "object-a";
    const objectNode: SceneObjectNode = {
      id: nodeId,
      kind: "object",
      name: "Object",
      objectId: "object-a",
      parentId: null,
      children: [],
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    };
    const importedSource: ImportedGlbSourceDescriptor = { kind: "node", path: "nodes/0", index: 0 };
    const importedSlot: ImportedGlbMaterialSlotDescriptor = {
      slotKey: "glb:object-a/slot:meshes/0/primitives/0:material-0",
      label: "Red",
      source: {
        kind: "material-slot",
        path: "meshes/0/primitives/0",
        meshIndex: 0,
        primitiveIndex: 0,
        materialIndex: 0
      }
    };
    const importedNode: SceneImportedGlbNode = {
      id: "imported-a",
      kind: "imported",
      name: "Imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: importedSource,
      parentId: "object-a",
      children: [],
      materialSlots: [importedSlot]
    };
    const importedDescriptor: ImportedGlbTargetDescriptor = {
      id: "imported-a",
      importKey: importedNode.importKey,
      parentImportKey: null,
      displayName: "Imported",
      source: importedSource,
      materialSlots: [importedSlot]
    };
    const bindingDescriptor: ImportedGlbTargetBindingDescriptor = createImportedGlbBindingDescriptor(importedNode, importedSlot.slotKey);
    const materialInspectorTarget: MaterialInspectorTarget = {
      key: "material-slot:object-a:slot-a",
      kind: "material-slot",
      label: "Red",
      ownerObjectId: "object-a",
      importedNodeId: "imported-a",
      importedNodeName: "Imported",
      importKey: importedNode.importKey,
      slotId: "slot-a",
      assignmentId: "material-slot:object-a:slot-a",
      materialId: null,
      selected: true,
      preferred: true,
      hasOverride: false,
      unresolved: false,
      problemIds: [],
      canSelect: true,
      canEditExistingAssignment: false,
      canCreateAssignment: true,
      canClear: false,
      commandTarget: { kind: "material-slot", objectId: "object-a", slotId: "slot-a" }
    };
    const sceneNode: SceneNode = objectNode;
    const clipboardNode: ClipboardSceneNode = { ...objectNode, originalId: "object-a" };
    const workspacePayload: AssetWorkspacePayloadSummary = {
      assetId: "asset-a",
      kind: "glb",
      available: true,
      exportable: true,
      byteSize: 1
    };
    const projectPayload: ProjectAssetPayloadSummary = workspacePayload;
    const workspaceKind: AssetWorkspaceReferenceKind = "object-glb";
    const workspaceStatus: AssetWorkspaceStatus = "ready";
    const importDiagnostic: GlbImportDiagnostic = {
      id: "glb-decoder-missing:KHR_texture_basisu",
      severity: "error",
      code: "glb-decoder-missing",
      target: { kind: "extension", extension: "KHR_texture_basisu" },
      message: "Missing KTX2.",
      recoverability: "user-action",
      display: { title: "KTX2 decoder is not configured" }
    };
    const importManifest: GlbImportManifest = createImportManifest([importDiagnostic]);
    const decoderConfig: GltfDecoderConfiguration = {};
    const loaderAdapter: GltfLoaderAdapter = new ThreeGltfLoaderAdapter({ decoders: decoderConfig });
    const legacyLoaderAdapter: GltfLoaderAdapter = { load: async () => new Group() };
    const importOptions: ImportGlbAssetOptions = { asset: { id: "asset-a", source: new Uint8Array([1]) }, loader: loaderAdapter };
    const importResult: ImportGlbAssetResult = {
      ok: false,
      manifest: importManifest,
      diagnostics: importManifest.diagnostics,
      snapshot: createEmptySnapshot("scene-import"),
      committed: false
    };
    const reimportOptions: ReimportGlbAssetOptions = { assetId: "asset-a", source: new Uint8Array([1]) };
    const reimportResult: ReimportGlbAssetResult = {
      ok: true,
      manifest: importManifest,
      diagnostics: [],
      remap: reimportRemap,
      snapshot: createEmptySnapshot("scene-reimport"),
      committed: false
    };
    const rasterKind: WorkbenchRasterImportKind = "texture";
    const workspaceImportOptions: WorkbenchAssetImportOptions = {
      rasterKind,
      files: [{ name: "texture.png", source: new Uint8Array([1]), mimeType: "image/png" }]
    };
    const workspaceImportResult: WorkbenchAssetImportResult = {
      label: "texture.png",
      kind: "texture",
      status: "succeeded",
      assetId: "asset-a",
      committed: true,
      diagnostics: [],
      snapshot: createEmptySnapshot("scene-import-result")
    };
    const editorWithImport: EditorWithGlbImport = createEditor();
    const baseEditor: Editor = editorWithImport;
    const structuralEditorWithoutViewportHelpers: Editor = {
      getSnapshot: baseEditor.getSnapshot,
      subscribe: baseEditor.subscribe,
      dispatch: baseEditor.dispatch,
      operations: baseEditor.operations,
      clipboard: baseEditor.clipboard,
      snap: baseEditor.snap,
      transformMode: baseEditor.transformMode,
      subscribeSnap: baseEditor.subscribeSnap,
      subscribeTransformMode: baseEditor.subscribeTransformMode,
      undo: baseEditor.undo,
      redo: baseEditor.redo,
      getHistoryState: baseEditor.getHistoryState,
      serialize: baseEditor.serialize,
      restore: baseEditor.restore,
      registerAsset: baseEditor.registerAsset,
      importProject: baseEditor.importProject,
      exportProject: baseEditor.exportProject,
      replaceAsset: baseEditor.replaceAsset,
      subscribeRuntime: baseEditor.subscribeRuntime,
      mountRuntime: baseEditor.mountRuntime,
      getRuntime: baseEditor.getRuntime,
      dispose: baseEditor.dispose,
      disposed: false
    };

    expect(command.type).toBe("set-material");
    expect(registerAsset.asset.kind).toBe("texture");
    expect(setEnvironment.environment.background?.mode).toBe("solid");
    expect(environmentPatch.environment?.rotation?.y).toBe(0.5);
    expect(addLight.light.kind).toBe("ambient");
    expect(updateLight.patch.intensity).toBe(2);
    expect(removeLight.lightId).toBe("light-a");
    expect(batch.commands).toHaveLength(1);
    expect(selectNode.nodeId).toBe("node-a");
    expect(selectNodes.primaryNodeId).toBe("node-a");
    expect(createGroup.type).toBe("create-group");
    expect(createImportedTargets.ownerObjectId).toBe("object-a");
    expect(reimportGlb.remap.summary.newTargetCount).toBe(0);
    expect(deleteNodes.nodeIds).toEqual(["node-a"]);
    expect(groupNodes.nodeId).toBe("group-a");
    expect(ungroupNodes.nodeId).toBe("group-a");
    expect(reparentNode.parentId).toBeNull();
    expect(setNodeTransform.transform.position).toEqual([1, 2, 3]);
    expect(selectObjects.mode).toBe("clear");
    expect(deleteObjects.type).toBe("delete-objects");
    expect(duplicateObjects.type).toBe("duplicate-objects");
    expect(groupObjects.type).toBe("group-objects");
    expect(action).toBe("copy");
    expect(snap.translate).toBe(0.5);
    expect(transformMode).toBe("rotate");
    expect(interactions.camera).toBe(true);
    expect(interactions.transform).toEqual(transformControls);
    expect(pointerInput.modifiers?.ctrlKey).toBe(true);
    expect(selectionVisuals.selectedColor).toBe("#4f8cff");
    expect(viewportHelpers.floor).toBe(true);
    expect(textureSlot.assetId).toBe("texture-a");
    expect(texturePatch.map).toBeNull();
    expect(packageVersion).toBe(1);
    expect(materialState.assignments).toEqual({});
    expect(authoredProblems.acknowledged).toEqual({});
    expect(target.kind).toBe("environment");
    expect(inspectorOptions.activeLightId).toBe("light-a");
    expect(fieldKind).toBe("number");
    expect(fieldOption.value).toBe("opaque");
    expect(assetOption.kind).toBe("glb");
    expect(`${transformVector}.${transformAxis}`).toBe("position.x");
    expect(sceneNode.kind).toBe("object");
    expect(importedNode.kind).toBe("imported");
    expect(importedDescriptor.materialSlots?.[0]?.slotKey).toBe(importedSlot.slotKey);
    expect(bindingDescriptor.slotKey).toBe(importedSlot.slotKey);
    expect(materialInspectorTarget.commandTarget.kind).toBe("material-slot");
    expect(clipboardNode.originalId).toBe("object-a");
    expect(environment.mode).toBe("none");
    expect(light.kind).toBe("ambient");
    expect(problem.target).toEqual({ kind: "object", objectId: "object-a" });
    expect(workspacePayload.exportable).toBe(true);
    expect(projectPayload.available).toBe(true);
    expect(workspaceKind).toBe("object-glb");
    expect(workspaceStatus).toBe("ready");
    expect(importManifest.version).toBe(1);
    expect(GLB_IMPORT_MANIFEST_METADATA_KEY).toBe("glbImportManifest");
    expect(importOptions.loader).toBe(loaderAdapter);
    expect(importResult.committed).toBe(false);
    expect(reimportOptions.assetId).toBe("asset-a");
    expect(reimportResult.remap?.summary.exactTargetCount).toBe(0);
    expect(legacyLoaderAdapter.analyze).toBeUndefined();
    expect(typeof editorWithImport.importGlbAsset).toBe("function");
    expect(typeof editorWithImport.reimportGlbAsset).toBe("function");
    expect(typeof editorWithImport.importWorkbenchAssets).toBe("function");
    expect(structuralEditorWithoutViewportHelpers.viewportHelpers).toBeUndefined();
    expect(new EditorViewportHelperState({ grid: true }).get().visibility.grid).toBe(true);
    expect(workspaceImportOptions.rasterKind).toBe("texture");
    expect(workspaceImportResult.status).toBe("succeeded");
    expect(classifyWorkbenchAssetImportFile({ name: "texture.png", source: new Uint8Array([1]) }, rasterKind)).toMatchObject({
      kind: "texture"
    });
    await expect(importWorkbenchAssets(editorWithImport, { files: [] })).resolves.toEqual([]);
    expect(baseEditor.getSnapshot()).toMatchObject({ scene: { id: expect.any(String) } });
    expect(createImportedGlbTargetDescriptors({ ownerObjectId: "object-a", manifest: createImportManifest([]) })).toEqual([]);
    expect(findImportedGlbMaterialSlot({
      ...createEmptySnapshot("scene-a"),
      assets: { "asset-a": { id: "asset-a", kind: "glb" } },
      nodes: {
        "object-a": { ...objectNode, children: ["imported-a"] },
        "imported-a": importedNode
      },
      rootNodeIds: ["object-a"],
      objects: {
        "object-a": {
          id: "object-a",
          name: "Object",
          kind: "glb",
          parentId: null,
          children: [],
          asset: { id: "asset-a", kind: "glb" },
          transform: objectNode.transform
        }
      },
      rootObjectIds: ["object-a"]
    }, "object-a", importedSlot.slotKey)?.slot.slotKey).toBe(importedSlot.slotKey);
    editorWithImport.dispose();
  });

  it("exports shared inspector contracts without exposing runtime internals", () => {
    const snapshot = createEmptySnapshot("scene-a");
    const inspector: InspectorModel = buildInspectorModel(snapshot);
    const command: InspectorCommandResult = buildSetTransformCommand(snapshot, "position.x", 1);
    const materialFields = buildMaterialFieldsForTarget(snapshot, inspector.material.targets[0] ?? null, inspector.material.empty);
    const workbenchOptions: BuildWorkbenchModelOptions = { inspector };
    const workspace = buildAssetWorkspaceModel(snapshot);
    const workbench: WorkbenchModel = buildWorkbenchModel(snapshot, workbenchOptions);

    expect(inspector.environment.enabled).toBe(true);
    expect(command.ok).toBe(false);
    expect(materialFields[0]?.id).toBe("color");
    expect(filterAssetWorkspaceItems(workspace.items, { query: "missing" })).toEqual([]);
    expect(sortAssetWorkspaceItems(workspace.items)).toEqual([]);
    expect(workbench.project.sceneId).toBe("scene-a");
    expect(workbench.hierarchy.empty).toBe(true);
  });

  it("exports advanced operation, clipboard, shortcut, and snap helpers", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const operations: AdvancedEditorOperations = createAdvancedEditorOperations(editor);
    const payload: EditorClipboardPayload | null = operations.copy();
    const objectPayload: EditorObjectClipboardPayload = createClipboardPayload(editor.getSnapshot());
    const nodePayload: EditorNodeClipboardPayload = createNodeClipboardPayload(editor.getSnapshot());

    expect(payload?.kind).toBe("ek-aiot-3d-editor-objects");
    expect(payload?.kind === "ek-aiot-3d-editor-objects" ? payload.rootObjectIds : []).toEqual(["object-a"]);
    expect(objectPayload.rootObjectIds).toEqual(["object-a"]);
    expect(nodePayload.rootNodeIds).toEqual(["object-a"]);
    expect(resolveEditorShortcut({ key: "c", ctrlKey: true }).action).toBe("copy");
    expect(snapNumber(0.74, 0.5)).toBe(0.5);
  });
});

function createImportManifest(diagnostics: GlbImportDiagnostic[]): GlbImportManifest {
  return {
    version: 1,
    asset: {},
    source: {},
    counts: {
      scenes: 0,
      nodes: 0,
      meshes: 0,
      primitives: 0,
      materials: 0,
      textures: 0,
      images: 0,
      cameras: 0,
      animations: 0,
      skins: 0
    },
    extensions: {
      used: [],
      required: [],
      unsupportedRequired: []
    },
    scenes: [],
    nodes: [],
    meshes: [],
    materials: [],
    textures: [],
    images: [],
    cameras: [],
    animations: [],
    diagnostics
  };
}
