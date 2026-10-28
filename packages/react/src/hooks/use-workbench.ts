import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY,
  EditorViewportHelperState,
  type Command,
  type AuthoredCameraView,
  type AuthoredCameraViewInput,
  type Editor,
  type DataObjectDataState,
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
import {
  WORKBENCH_LOCALES,
  getWorkbenchLocaleLabel,
  normalizeWorkbenchLocale,
  resolveWorkbenchMessage,
  type WorkbenchI18n,
  type WorkbenchLocale,
  type WorkbenchMessageInput,
  type WorkbenchMessageValues,
  type WorkbenchTranslate
} from "../i18n/workbench-i18n";
import { useEditor } from "./use-editor";
import { readWorkbenchLocale, writeWorkbenchLocale } from "../i18n/workbench-locale-storage";
import { useInspector } from "./use-inspector";
import { useEditorObjectDataState } from "./use-object-data-state";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: EditorWithGlbImport;
  loader?: EditorRuntimeOptions["loader"];
  locale?: WorkbenchLocale;
  defaultLocale?: WorkbenchLocale;
  onLocaleChange?(locale: WorkbenchLocale): void;
  translate?: WorkbenchTranslate;
}

export interface WorkbenchSelectionContext {
  count: number;
  nodeId: string | null;
  nodeIds: string[];
  nodeKind: InspectorModel["selection"]["nodeKind"];
  objectId: string | null;
  objectIds: string[];
  lightId: string | null;
  cameraViewId: string | null;
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
  capture(input?: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata">): AuthoredCameraViewInput | null;
  apply(view: AuthoredCameraView): boolean;
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
  dataState: DataObjectDataState;
  inspector: InspectorModel;
  selection: WorkbenchSelectionContext;
  history: HistoryState;
  transform: WorkbenchTransformContext;
  viewportHelpers: WorkbenchViewportHelpersContext;
  camera: WorkbenchCameraContext;
  project: WorkbenchProjectContext;
  assets: WorkbenchAssetContext;
  problems: WorkbenchProblemsContext;
  i18n?: WorkbenchI18n;
  runtimeProblems: Problem[];
  runtime: EditorRuntime | null;
  runtimeReady: boolean;
  activeLightId: string | null;
  activeLightNodeId: string | null;
  activeCameraViewId: string | null;
  operations: AdvancedEditorOperations;
  historyState: HistoryState;
  selectionCount: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedNodeKind: InspectorModel["selection"]["nodeKind"];
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedLightId: string | null;
  selectedCameraViewId: string | null;
  snap: SnapSettings;
  viewportHelperState: ViewportHelperStateSnapshot;
  transformMode: TransformMode;
  setActiveLightId(value: string | null): void;
  setActiveCameraViewId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  toggleViewportHelper(key: ViewportHelperKey): ViewportHelperStateSnapshot;
  runAction(action: EditorAction): ReturnType<typeof executeEditorAction>;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  captureCameraView(input?: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata">): AuthoredCameraViewInput | null;
  applyCameraView(view: AuthoredCameraView): boolean;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
}

export interface ResolvedWorkbenchContext extends WorkbenchContext {
  i18n: WorkbenchI18n;
}

export interface UseWorkbenchResult extends ResolvedWorkbenchContext {
  ownsEditor: boolean;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const {
    locale,
    defaultLocale,
    onLocaleChange,
    translate,
    loader,
    ...editorOptions
  } = options;
  const editor = useEditor(editorOptions) as EditorWithGlbImport;
  const controlledLocale = locale !== undefined;
  const [uncontrolledLocale, setUncontrolledLocale] = useState<WorkbenchLocale>(() =>
    readWorkbenchLocale(defaultLocale)
  );
  const resolvedLocale = controlledLocale
    ? normalizeWorkbenchLocale(locale)
    : uncontrolledLocale;
  useEffect(() => {
    writeWorkbenchLocale(resolvedLocale);
  }, [resolvedLocale]);
  const setLocale = useCallback((nextLocale: WorkbenchLocale) => {
    const normalized = normalizeWorkbenchLocale(nextLocale);
    onLocaleChange?.(normalized);
    if (!controlledLocale) {
      setUncontrolledLocale(normalized);
    }
  }, [controlledLocale, onLocaleChange]);
  const i18n = useMemo<WorkbenchI18n>(() => ({
    locale: resolvedLocale,
    supportedLocales: WORKBENCH_LOCALES,
    localeLabel: getWorkbenchLocaleLabel,
    setLocale,
    t(message: WorkbenchMessageInput, values?: WorkbenchMessageValues) {
      return resolveWorkbenchMessage(resolvedLocale, message, values, translate);
    }
  }), [resolvedLocale, setLocale, translate]);
  const viewportHelperStore = getViewportHelperStore(editor);
  useEffect(() => {
    ensureDefaultWorkbenchViewportHelpers(viewportHelperStore);
  }, [viewportHelperStore]);
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
  const dataState = useEditorObjectDataState(editor);
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
  const captureCameraView = useCallback((input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}) => {
    const result = editor.getRuntime()?.captureCameraView(input);
    return result?.ok ? result.view : null;
  }, [editor]);
  const applyCameraView = useCallback((view: AuthoredCameraView) => {
    const runtime = editor.getRuntime();
    if (!runtime) {
      return false;
    }
    runtime.applyCameraView(view);
    return true;
  }, [editor]);
  const importProject = useCallback((packageBytes: Uint8Array, projectOptions?: ProjectImportOptions) =>
    editor.importProject(packageBytes, projectOptions), [editor]);
  const exportProject = useCallback((projectOptions?: ProjectExportOptions) => editor.exportProject(projectOptions), [editor]);
  const replaceAsset = useCallback((input: ReplaceAssetInput) => editor.replaceAsset(input), [editor]);
  const reimportGlbAsset = useCallback((input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }) =>
    editor.reimportGlbAsset({
      ...input,
      loader: input.loader ?? loader
    }), [editor, loader]);
  const importAssetFiles = useCallback((assetOptions: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }) =>
    editor.importWorkbenchAssets({
      ...assetOptions,
      loader: assetOptions.loader ?? loader
    }), [editor, loader]);
  const dispose = useCallback(() => {
    if (ownsEditor) {
      editor.dispose();
    }
  }, [editor, ownsEditor]);
  const historyState = editor.getHistoryState();
  const assetPayloads = getAssetWorkspacePayloads(editor);
  const dataCredentials = editor.getDataCredentials?.() ?? [];
  const model = buildWorkbenchModel(inspector.snapshot, {
    inspector: inspector.inspector,
    runtimeProblems: inspector.runtimeProblems,
    assetPayloads,
    dataCredentials,
    dataState,
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
  const selectedCameraViewId = model.selection.cameraViewId;
  const selectionCount = model.selection.count;
  const selection: WorkbenchSelectionContext = {
    count: selectionCount,
    nodeId: selectedNodeId,
    nodeIds: selectedNodeIds,
    nodeKind: selectedNodeKind,
    objectId: selectedObjectId,
    objectIds: selectedObjectIds,
    lightId: selectedLightId,
    cameraViewId: selectedCameraViewId
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
    frameAll,
    capture: captureCameraView,
    apply: applyCameraView
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
    dataState,
    inspector: inspector.inspector,
    selection,
    history: historyState,
    transform,
    viewportHelpers,
    camera,
    project,
    assets,
    problems,
    i18n,
    runtimeProblems: inspector.runtimeProblems,
    runtime,
    runtimeReady: runtime !== null,
    activeLightId: inspector.activeLightId,
    activeLightNodeId: inspector.inspector.lights.activeLightNodeId,
    activeCameraViewId: inspector.activeCameraViewId,
    operations: editor.operations,
    historyState,
    selectionCount,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeKind,
    selectedObjectId,
    selectedObjectIds,
    selectedLightId,
    selectedCameraViewId,
    snap,
    viewportHelperState,
    transformMode,
    setActiveLightId: inspector.setActiveLightId,
    setActiveCameraViewId: inspector.setActiveCameraViewId,
    setTransformMode,
    toggleSnap,
    toggleViewportHelper,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    captureCameraView,
    applyCameraView,
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
