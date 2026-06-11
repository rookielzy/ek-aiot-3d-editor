import { computed, getCurrentInstance, markRaw, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from "vue";
import {
  buildInspectorModel,
  buildWorkbenchModel,
  createEditor,
  executeEditorAction,
  type AdvancedEditorOperations,
  type AssetWorkspacePayloadSummary,
  type Command,
  type Editor,
  type EditorWithGlbImport,
  type EditorAction,
  type EditorOptions,
  type EditorRuntime,
  type EditorRuntimeOptions,
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
  type RuntimeCameraFrameOptions,
  type ReplaceAssetInput,
  type ReplaceAssetResult,
  type ReimportGlbAssetOptions,
  type ReimportGlbAssetResult,
  type SceneSnapshot,
  type SnapChannel,
  type SnapSettings,
  type TransformMode
} from "@ek-aiot/3d-editor-core";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: EditorWithGlbImport | Ref<EditorWithGlbImport | undefined>;
  loader?: EditorRuntimeOptions["loader"] | Ref<EditorRuntimeOptions["loader"] | undefined>;
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
  transformMode: TransformMode;
  setActiveLightId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  runAction(action: EditorAction): ReturnType<typeof executeEditorAction>;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}

export interface UseWorkbenchResult {
  editor: EditorWithGlbImport;
  snapshot: ShallowRef<SceneSnapshot>;
  inspector: ComputedRef<InspectorModel>;
  model: ComputedRef<WorkbenchModel>;
  runtimeProblems: ShallowRef<Problem[]>;
  runtime: ShallowRef<EditorRuntime | null>;
  activeLightId: Ref<string | null>;
  snap: ShallowRef<SnapSettings>;
  transformMode: Ref<TransformMode>;
  context: ComputedRef<WorkbenchContext>;
  ownsEditor: boolean;
  setActiveLightId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  runAction(action: EditorAction): ReturnType<typeof executeEditorAction>;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  reimportGlbAsset(input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }): Promise<ReimportGlbAssetResult>;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editorOption = isRefOption(options.editor) ? options.editor : undefined;
  const initialEditor = resolveInitialEditor(options, editorOption);
  const currentEditor = shallowRef<EditorWithGlbImport>(markRaw(initialEditor));
  const ownsCurrentEditor = ref(editorOption ? !editorOption.value : !options.editor);
  const snapshot = shallowRef(currentEditor.value.getSnapshot());
  const snap = shallowRef<SnapSettings>(currentEditor.value.snap.get());
  const transformMode = ref<TransformMode>(currentEditor.value.transformMode.get());
  const runtime = shallowRef<EditorRuntime | null>(markRuntimeRaw(currentEditor.value.getRuntime()));
  const runtimeProblems = shallowRef<Problem[]>(currentEditor.value.getRuntime()?.getProblems() ?? []);
  const assetWorkspaceVersion = shallowRef(getAssetWorkspaceVersion(currentEditor.value));
  let unsubscribeSnapshot: (() => void) | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeProblems: (() => void) | null = null;
  let unsubscribeAssetWorkspace: (() => void) | null = null;
  let unsubscribeSnap: (() => void) | null = null;
  let unsubscribeTransformMode: (() => void) | null = null;
  let disposed = false;

  function subscribeEditor(nextEditor: Editor): void {
    cleanupSubscriptions();
    unsubscribeSnapshot = nextEditor.subscribe((nextSnapshot) => {
      snapshot.value = nextSnapshot;
    });
    snapshot.value = nextEditor.getSnapshot();
    unsubscribeRuntime = nextEditor.subscribeRuntime(() => {
      runtime.value = markRuntimeRaw(nextEditor.getRuntime());
      subscribeRuntimeProblems();
    });
    unsubscribeAssetWorkspace = nextEditor.subscribeAssetWorkspace?.((version) => {
      assetWorkspaceVersion.value = version;
    }) ?? null;
    unsubscribeSnap = nextEditor.subscribeSnap((nextSnap) => {
      snap.value = nextSnap;
    });
    unsubscribeTransformMode = nextEditor.subscribeTransformMode((nextMode) => {
      transformMode.value = nextMode;
    });
    runtime.value = markRuntimeRaw(nextEditor.getRuntime());
    subscribeRuntimeProblems();
  }

  function subscribeRuntimeProblems(): void {
    unsubscribeProblems?.();
    unsubscribeProblems = null;
    const runtime = currentEditor.value.getRuntime();
    runtimeProblems.value = runtime?.getProblems() ?? [];
    unsubscribeProblems = runtime?.subscribeProblems((problemSnapshot) => {
      runtimeProblems.value = problemSnapshot.problems;
    }) ?? null;
  }

  function cleanupSubscriptions(): void {
    unsubscribeSnapshot?.();
    unsubscribeSnapshot = null;
    unsubscribeRuntime?.();
    unsubscribeRuntime = null;
    unsubscribeProblems?.();
    unsubscribeProblems = null;
    unsubscribeAssetWorkspace?.();
    unsubscribeAssetWorkspace = null;
    unsubscribeSnap?.();
    unsubscribeSnap = null;
    unsubscribeTransformMode?.();
    unsubscribeTransformMode = null;
  }

  subscribeEditor(currentEditor.value);

  if (editorOption) {
    watch(editorOption, (nextEditor) => {
      if (!nextEditor || nextEditor === currentEditor.value) {
        return;
      }
      const previousEditor = currentEditor.value;
      const ownedPreviousEditor = ownsCurrentEditor.value;
      currentEditor.value = markRaw(nextEditor);
      ownsCurrentEditor.value = false;
      subscribeEditor(currentEditor.value);
      if (ownedPreviousEditor) {
        previousEditor.dispose();
      }
    });
  }

  function setActiveLightId(value: string | null): void {
    if (!value) {
      const snapshot = currentEditor.value.getSnapshot();
      const selectedNode = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : undefined;
      if (selectedNode?.kind === "light") {
        currentEditor.value.dispatch({ type: "select-nodes", mode: "clear" });
      }
      return;
    }

    const target = Object.values(currentEditor.value.getSnapshot().nodes)
      .find((node) => node.kind === "light" && node.lightId === value);
    if (target) {
      currentEditor.value.dispatch({ type: "select-node", nodeId: target.id });
    }
  }

  function setTransformMode(mode: TransformMode): void {
    currentEditor.value.transformMode.set(mode);
  }

  function toggleSnap(channel: SnapChannel, increment = defaultSnapIncrement(channel)): SnapSettings {
    return currentEditor.value.snap.toggle(channel, increment);
  }

  function runAction(action: EditorAction): ReturnType<typeof executeEditorAction> {
    return executeEditorAction(currentEditor.value, action);
  }

  function resetCamera(): void {
    currentEditor.value.getRuntime()?.resetCamera();
  }

  function frameSelected(options?: RuntimeCameraFrameOptions): boolean {
    return currentEditor.value.getRuntime()?.frameSelected(options) ?? false;
  }

  function frameAll(options?: RuntimeCameraFrameOptions): boolean {
    return currentEditor.value.getRuntime()?.frameAll(options) ?? false;
  }

  function dispatch(command: Command): ReturnType<Editor["dispatch"]> {
    return currentEditor.value.dispatch(command);
  }

  function importProject(packageBytes: Uint8Array, projectOptions?: ProjectImportOptions): ProjectImportResult {
    return currentEditor.value.importProject(packageBytes, projectOptions);
  }

  function exportProject(projectOptions?: ProjectExportOptions): ProjectExportResult {
    return currentEditor.value.exportProject(projectOptions);
  }

  function importAssetFiles(assetOptions: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]> {
    return currentEditor.value.importWorkbenchAssets({
      ...assetOptions,
      loader: assetOptions.loader ?? resolveLoader(options.loader)
    });
  }

  function replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> {
    return currentEditor.value.replaceAsset(input);
  }

  function reimportGlbAsset(input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }): Promise<ReimportGlbAssetResult> {
    return currentEditor.value.reimportGlbAsset({
      ...input,
      loader: input.loader ?? resolveLoader(options.loader)
    });
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanupSubscriptions();
    if (ownsCurrentEditor.value) {
      currentEditor.value.dispose();
    }
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose);
  }

  const inspector = computed(() =>
    buildInspectorModel(snapshot.value, {
      runtimeProblems: runtimeProblems.value
    })
  );
  const model = computed(() => {
    assetWorkspaceVersion.value;
    return buildWorkbenchModel(snapshot.value, {
      inspector: inspector.value,
      runtimeProblems: runtimeProblems.value,
      assetPayloads: getAssetWorkspacePayloads(currentEditor.value),
      history: currentEditor.value.getHistoryState(),
      snap: snap.value,
      transformMode: transformMode.value,
      runtimeReady: runtime.value !== null
    });
  });
  const activeLightId = computed({
    get: () => inspector.value.lights.activeLightId,
    set: setActiveLightId
  });
  const context = computed<WorkbenchContext>(() => ({
    editor: currentEditor.value,
    model: model.value,
    snapshot: snapshot.value,
    inspector: inspector.value,
    selection: {
      count: model.value.selection.count,
      nodeId: model.value.selection.nodeId,
      nodeIds: model.value.selection.nodeIds,
      nodeKind: model.value.selection.nodeKind,
      objectId: model.value.selection.objectId,
      objectIds: model.value.selection.objectIds,
      lightId: model.value.selection.lightId
    },
    history: currentEditor.value.getHistoryState(),
    transform: {
      mode: transformMode.value,
      snap: snap.value,
      setMode: setTransformMode,
      toggleSnap
    },
    camera: {
      ready: runtime.value !== null,
      reset: resetCamera,
      frameSelected,
      frameAll
    },
    project: {
      importProject,
      exportProject
    },
    assets: {
      payloads: getAssetWorkspacePayloads(currentEditor.value),
      workspaceVersion: assetWorkspaceVersion.value,
      importFiles: importAssetFiles,
      replaceAsset,
      reimportGlbAsset
    },
    problems: {
      items: model.value.problems.items,
      runtime: runtimeProblems.value,
      authoredCount: model.value.problems.authoredCount,
      runtimeCount: model.value.problems.runtimeCount,
      totalCount: model.value.problems.totalCount,
      refresh: subscribeRuntimeProblems
    },
    runtimeProblems: runtimeProblems.value,
    runtime: runtime.value,
    runtimeReady: runtime.value !== null,
    activeLightId: activeLightId.value,
    activeLightNodeId: inspector.value.lights.activeLightNodeId,
    operations: currentEditor.value.operations,
    historyState: currentEditor.value.getHistoryState(),
    selectionCount: model.value.selection.count,
    selectedNodeId: model.value.selection.nodeId,
    selectedNodeIds: model.value.selection.nodeIds,
    selectedNodeKind: model.value.selection.nodeKind,
    selectedObjectId: model.value.selection.objectId,
    selectedObjectIds: model.value.selection.objectIds,
    selectedLightId: model.value.selection.lightId,
    snap: snap.value,
    transformMode: transformMode.value,
    setActiveLightId,
    setTransformMode,
    toggleSnap,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    refreshProblems: subscribeRuntimeProblems,
    dispatch,
    importProject,
    exportProject,
    importAssetFiles,
    replaceAsset
  }));

  return {
    get editor() {
      return currentEditor.value;
    },
    snapshot,
    inspector,
    model,
    runtimeProblems,
    runtime,
    activeLightId,
    snap,
    transformMode,
    context,
    get ownsEditor() {
      return ownsCurrentEditor.value;
    },
    setActiveLightId,
    setTransformMode,
    toggleSnap,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    refreshProblems: subscribeRuntimeProblems,
    dispatch,
    importProject,
    exportProject,
    importAssetFiles,
    replaceAsset,
    reimportGlbAsset,
    dispose
  };
}

function isRefOption(value: UseWorkbenchOptions["editor"]): value is Ref<EditorWithGlbImport | undefined> {
  return isRefValue<EditorWithGlbImport | undefined>(value);
}

function resolveInitialEditor(options: UseWorkbenchOptions, editorOption: Ref<EditorWithGlbImport | undefined> | undefined): EditorWithGlbImport {
  if (editorOption?.value) {
    return editorOption.value;
  }
  if (options.editor && !isRefOption(options.editor)) {
    return options.editor;
  }
  return createEditor({ snapshot: options.snapshot });
}

function defaultSnapIncrement(channel: SnapChannel): number {
  if (channel === "rotate") {
    return Math.PI / 12;
  }
  return channel === "scale" ? 0.1 : 0.5;
}

function markRuntimeRaw(runtime: EditorRuntime | null): EditorRuntime | null {
  return runtime ? markRaw(runtime) : null;
}

function getAssetWorkspacePayloads(editor: Editor): AssetWorkspacePayloadSummary[] {
  return editor.getAssetWorkspacePayloads?.() ?? [];
}

function getAssetWorkspaceVersion(editor: Editor): number {
  return editor.getAssetWorkspaceVersion?.() ?? 0;
}

function resolveLoader(loader: UseWorkbenchOptions["loader"]): EditorRuntimeOptions["loader"] | undefined {
  return isRefValue<EditorRuntimeOptions["loader"] | undefined>(loader) ? loader.value : loader;
}

function isRefValue<T>(value: unknown): value is Ref<T> {
  return Boolean(value && typeof value === "object" && "value" in value);
}
