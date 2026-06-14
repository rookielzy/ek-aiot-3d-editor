import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY,
  EditorViewportHelperState,
  type Command,
  type Editor,
  type EditorWithGlbImport,
  type EditorAction,
  type EditorOptions,
  type EditorRuntime,
  type AdvancedEditorOperations,
  type AssetWorkspacePayloadSummary,
  type WorkbenchModel,
  type WorkbenchProblemItem,
  type WorkbenchAssetImportOptions,
  type WorkbenchAssetImportResult,
  type HistoryState,
  type InspectorModel,
  type Problem,
  type ProjectExportOptions,
  type ProjectExportResult,
  type ProjectImportOptions,
  type ProjectImportResult,
  type EditorRuntimeOptions,
  type RuntimeCameraFrameOptions,
  type ReplaceAssetInput,
  type ReplaceAssetResult,
  type ReimportGlbAssetOptions,
  type ReimportGlbAssetResult,
  type SceneSnapshot,
  type SnapChannel,
  type SnapSettings,
  type TransformMode,
  type ViewportHelperKey,
  type ViewportHelperStateSnapshot
} from "@ek-aiot/3d-editor-core";
import { buildWorkbenchModel, executeEditorAction } from "@ek-aiot/3d-editor-core";
import { useEditor } from "./use-editor";
import { useInspector } from "./use-inspector";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: EditorWithGlbImport;
  loader?: EditorRuntimeOptions["loader"];
}

export interface WorkbenchSelectionContext {
  count: number;
  nodeId: string | null;
  nodeIds: string[];
  nodeKind: InspectorModel["selection"]["nodeKind"];
  objectId: string | null;
  objectIds: string[];
  lightId: string | null;
}

export interface WorkbenchTransformContext {
  mode: TransformMode;
  snap: SnapSettings;
  setMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
}

export interface WorkbenchViewportHelpersContext {
  state: ViewportHelperStateSnapshot;
  toggle(key: ViewportHelperKey): ViewportHelperStateSnapshot;
}

export interface WorkbenchCameraContext {
  ready: boolean;
  reset(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
}

export interface WorkbenchProjectContext {
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
}

export interface WorkbenchAssetContext {
  payloads?: AssetWorkspacePayloadSummary[];
  workspaceVersion?: number;
  importFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  reimportGlbAsset(input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }): Promise<ReimportGlbAssetResult>;
}

export interface WorkbenchProblemsContext {
  items: WorkbenchProblemItem[];
  runtime: Problem[];
  authoredCount: number;
  runtimeCount: number;
  totalCount: number;
  refresh(): void;
}

export interface WorkbenchContext {
  editor: EditorWithGlbImport;
  model: WorkbenchModel;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  selection: WorkbenchSelectionContext;
  history: HistoryState;
  transform: WorkbenchTransformContext;
  viewportHelpers: WorkbenchViewportHelpersContext;
  camera: WorkbenchCameraContext;
  project: WorkbenchProjectContext;
  assets: WorkbenchAssetContext;
  problems: WorkbenchProblemsContext;
  runtimeProblems: Problem[];
  runtime: EditorRuntime | null;
  runtimeReady: boolean;
  activeLightId: string | null;
  activeLightNodeId: string | null;
  operations: AdvancedEditorOperations;
  historyState: HistoryState;
  selectionCount: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedNodeKind: InspectorModel["selection"]["nodeKind"];
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedLightId: string | null;
  snap: SnapSettings;
  viewportHelperState: ViewportHelperStateSnapshot;
  transformMode: TransformMode;
  setActiveLightId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  toggleViewportHelper(key: ViewportHelperKey): ViewportHelperStateSnapshot;
  runAction(action: EditorAction): ReturnType<typeof executeEditorAction>;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
}

export interface UseWorkbenchResult extends WorkbenchContext {
  ownsEditor: boolean;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editor = useEditor(options) as EditorWithGlbImport;
  const viewportHelperStore = getViewportHelperStore(editor);
  ensureDefaultWorkbenchViewportHelpers(viewportHelperStore);
  const snap = useSyncExternalStore(
    (listener) => editor.subscribeSnap(listener),
    () => editor.snap.get(),
    () => editor.snap.get()
  );
  const transformMode = useSyncExternalStore(
    (listener) => editor.subscribeTransformMode(listener),
    () => editor.transformMode.get(),
    () => editor.transformMode.get()
  );
  const viewportHelperState = useSyncExternalStore(
    (listener) => subscribeViewportHelperStore(editor, viewportHelperStore, listener),
    () => viewportHelperStore.get(),
    () => viewportHelperStore.get()
  );
  const runtime = useSyncExternalStore(
    (listener) => editor.subscribeRuntime(listener),
    () => editor.getRuntime(),
    () => editor.getRuntime()
  );
  const assetWorkspaceVersion = useSyncExternalStore(
    (listener) => editor.subscribeAssetWorkspace?.(listener) ?? (() => {}),
    () => getAssetWorkspaceVersion(editor),
    () => getAssetWorkspaceVersion(editor)
  );
  const inspector = useInspector({ editor });
  const ownsEditor = !options.editor;
  const dispatch = useCallback((command: Command) => editor.dispatch(command), [editor]);
  const setTransformMode = useCallback((mode: TransformMode) => {
    editor.transformMode.set(mode);
  }, [editor]);
  const toggleSnap = useCallback((channel: SnapChannel, increment = defaultSnapIncrement(channel)) =>
    editor.snap.toggle(channel, increment), [editor]);
  const toggleViewportHelper = useCallback((key: ViewportHelperKey) =>
    viewportHelperStore.toggle(key), [viewportHelperStore]);
  const runAction = useCallback((action: EditorAction) => executeEditorAction(editor, action), [editor]);
  const resetCamera = useCallback(() => {
    editor.getRuntime()?.resetCamera();
  }, [editor]);
  const frameSelected = useCallback((frameOptions?: RuntimeCameraFrameOptions) =>
    editor.getRuntime()?.frameSelected(frameOptions) ?? false, [editor]);
  const frameAll = useCallback((frameOptions?: RuntimeCameraFrameOptions) =>
    editor.getRuntime()?.frameAll(frameOptions) ?? false, [editor]);
  const importProject = useCallback((packageBytes: Uint8Array, projectOptions?: ProjectImportOptions) =>
    editor.importProject(packageBytes, projectOptions), [editor]);
  const exportProject = useCallback((projectOptions?: ProjectExportOptions) => editor.exportProject(projectOptions), [editor]);
  const replaceAsset = useCallback((input: ReplaceAssetInput) => editor.replaceAsset(input), [editor]);
  const reimportGlbAsset = useCallback((input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }) =>
    editor.reimportGlbAsset({
      ...input,
      loader: input.loader ?? options.loader
    }), [editor, options.loader]);
  const importAssetFiles = useCallback((assetOptions: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }) =>
    editor.importWorkbenchAssets({
      ...assetOptions,
      loader: assetOptions.loader ?? options.loader
    }), [editor, options.loader]);
  const dispose = useCallback(() => {
    if (ownsEditor) {
      editor.dispose();
    }
  }, [editor, ownsEditor]);
  const historyState = editor.getHistoryState();
  const assetPayloads = getAssetWorkspacePayloads(editor);
  const model = buildWorkbenchModel(inspector.snapshot, {
    inspector: inspector.inspector,
    runtimeProblems: inspector.runtimeProblems,
    assetPayloads,
    history: historyState,
    snap,
    viewportHelpers: viewportHelperState,
    transformMode,
    runtimeReady: runtime !== null
  });
  const selectedNodeId = model.selection.nodeId;
  const selectedNodeIds = model.selection.nodeIds;
  const selectedNodeKind = model.selection.nodeKind;
  const selectedObjectId = model.selection.objectId;
  const selectedObjectIds = model.selection.objectIds;
  const selectedLightId = model.selection.lightId;
  const selectionCount = model.selection.count;
  const selection: WorkbenchSelectionContext = {
    count: selectionCount,
    nodeId: selectedNodeId,
    nodeIds: selectedNodeIds,
    nodeKind: selectedNodeKind,
    objectId: selectedObjectId,
    objectIds: selectedObjectIds,
    lightId: selectedLightId
  };
  const transform: WorkbenchTransformContext = {
    mode: transformMode,
    snap,
    setMode: setTransformMode,
    toggleSnap
  };
  const viewportHelpers: WorkbenchViewportHelpersContext = {
    state: viewportHelperState,
    toggle: toggleViewportHelper
  };
  const camera: WorkbenchCameraContext = {
    ready: runtime !== null,
    reset: resetCamera,
    frameSelected,
    frameAll
  };
  const project: WorkbenchProjectContext = {
    importProject,
    exportProject
  };
  const assets: WorkbenchAssetContext = {
    payloads: assetPayloads,
    workspaceVersion: assetWorkspaceVersion,
    importFiles: importAssetFiles,
    replaceAsset,
    reimportGlbAsset
  };
  const problems: WorkbenchProblemsContext = {
    items: model.problems.items,
    runtime: inspector.runtimeProblems,
    authoredCount: model.problems.authoredCount,
    runtimeCount: model.problems.runtimeCount,
    totalCount: model.problems.totalCount,
    refresh: inspector.refreshProblems
  };

  return {
    editor,
    model,
    snapshot: inspector.snapshot,
    inspector: inspector.inspector,
    selection,
    history: historyState,
    transform,
    viewportHelpers,
    camera,
    project,
    assets,
    problems,
    runtimeProblems: inspector.runtimeProblems,
    runtime,
    runtimeReady: runtime !== null,
    activeLightId: inspector.activeLightId,
    activeLightNodeId: inspector.inspector.lights.activeLightNodeId,
    operations: editor.operations,
    historyState,
    selectionCount,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeKind,
    selectedObjectId,
    selectedObjectIds,
    selectedLightId,
    snap,
    viewportHelperState,
    transformMode,
    setActiveLightId: inspector.setActiveLightId,
    setTransformMode,
    toggleSnap,
    toggleViewportHelper,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    refreshProblems: inspector.refreshProblems,
    dispatch,
    importProject,
    exportProject,
    importAssetFiles,
    replaceAsset,
    ownsEditor,
    dispose
  };
}

function defaultSnapIncrement(channel: SnapChannel): number {
  if (channel === "rotate") {
    return Math.PI / 12;
  }
  return channel === "scale" ? 0.1 : 0.5;
}

function getAssetWorkspacePayloads(editor: Editor): AssetWorkspacePayloadSummary[] {
  return editor.getAssetWorkspacePayloads?.() ?? [];
}

function getAssetWorkspaceVersion(editor: Editor): number {
  return editor.getAssetWorkspaceVersion?.() ?? 0;
}

const fallbackViewportHelperStores = new WeakMap<Editor, EditorViewportHelperState>();

function getViewportHelperStore(editor: Editor): EditorViewportHelperState {
  if (editor.viewportHelpers) {
    return editor.viewportHelpers;
  }
  let store = fallbackViewportHelperStores.get(editor);
  if (!store) {
    store = new EditorViewportHelperState();
    fallbackViewportHelperStores.set(editor, store);
  }
  return store;
}

function subscribeViewportHelperStore(
  editor: Editor,
  viewportHelpers: EditorViewportHelperState,
  listener: (snapshot: ViewportHelperStateSnapshot) => void
): () => void {
  if (editor.viewportHelpers && editor.subscribeViewportHelpers) {
    return editor.subscribeViewportHelpers(listener);
  }
  return viewportHelpers.subscribe(listener);
}

function ensureDefaultWorkbenchViewportHelpers(viewportHelpers: EditorViewportHelperState): void {
  viewportHelpers.seedVisibility(DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY);
}
