import { computed, getCurrentInstance, markRaw, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from "vue";
import {
  DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY,
  EditorViewportHelperState,
  buildInspectorModel,
  buildWorkbenchModel,
  createEditor,
  executeEditorAction,
  type AdvancedEditorOperations,
  type AuthoredCameraView,
  type AuthoredCameraViewInput,
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
  type TransformMode,
  type ViewportHelperKey,
  type ViewportHelperStateSnapshot
} from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_WORKBENCH_LOCALE,
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

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: EditorWithGlbImport | Ref<EditorWithGlbImport | undefined>;
  loader?: EditorRuntimeOptions["loader"] | Ref<EditorRuntimeOptions["loader"] | undefined>;
  locale?: WorkbenchLocale | Ref<WorkbenchLocale | undefined>;
  defaultLocale?: WorkbenchLocale;
  onLocaleChange?(locale: WorkbenchLocale): void;
  translate?: WorkbenchTranslate | Ref<WorkbenchTranslate | undefined>;
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
  hierarchyRowsById: ReadonlyMap<string, WorkbenchModel["hierarchy"]["rows"][number]>;
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
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}

export interface ResolvedWorkbenchContext extends WorkbenchContext {
  i18n: WorkbenchI18n;
}

export interface UseWorkbenchResult {
  editor: EditorWithGlbImport;
  snapshot: ShallowRef<SceneSnapshot>;
  inspector: ComputedRef<InspectorModel>;
  model: ComputedRef<WorkbenchModel>;
  runtimeProblems: ShallowRef<Problem[]>;
  runtime: ShallowRef<EditorRuntime | null>;
  activeLightId: Ref<string | null>;
  activeCameraViewId: Ref<string | null>;
  snap: ShallowRef<SnapSettings>;
  viewportHelperState: ShallowRef<ViewportHelperStateSnapshot>;
  transformMode: Ref<TransformMode>;
  context: ComputedRef<ResolvedWorkbenchContext>;
  ownsEditor: boolean;
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
  importAssetFiles(options: Omit<WorkbenchAssetImportOptions, "loader"> & { loader?: WorkbenchAssetImportOptions["loader"] }): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  reimportGlbAsset(input: Omit<ReimportGlbAssetOptions, "loader"> & { loader?: ReimportGlbAssetOptions["loader"] }): Promise<ReimportGlbAssetResult>;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editorOption = isRefOption(options.editor) ? options.editor : undefined;
  const localeOption = isRefValue<WorkbenchLocale | undefined>(options.locale) ? options.locale : undefined;
  const translateOption = isRefValue<WorkbenchTranslate | undefined>(options.translate) ? options.translate : undefined;
  const controlledLocale = computed(() => localeOption ? localeOption.value !== undefined : options.locale !== undefined);
  const uncontrolledLocale = ref<WorkbenchLocale>(normalizeWorkbenchLocale(options.defaultLocale ?? DEFAULT_WORKBENCH_LOCALE));
  const initialEditor = resolveInitialEditor(options, editorOption);
  let viewportHelperStore = getViewportHelperStore(initialEditor);
  ensureDefaultWorkbenchViewportHelpers(viewportHelperStore);
  const currentEditor = shallowRef<EditorWithGlbImport>(markRaw(initialEditor));
  const ownsCurrentEditor = ref(editorOption ? !editorOption.value : !options.editor);
  const snapshot = shallowRef(currentEditor.value.getSnapshot());
  const snap = shallowRef<SnapSettings>(currentEditor.value.snap.get());
  const viewportHelperState = shallowRef<ViewportHelperStateSnapshot>(viewportHelperStore.get());
  const transformMode = ref<TransformMode>(currentEditor.value.transformMode.get());
  const runtime = shallowRef<EditorRuntime | null>(markRuntimeRaw(currentEditor.value.getRuntime()));
  const runtimeProblems = shallowRef<Problem[]>(currentEditor.value.getRuntime()?.getProblems() ?? []);
  const requestedActiveCameraViewId = ref<string | null>(null);
  const assetWorkspaceVersion = shallowRef(getAssetWorkspaceVersion(currentEditor.value));
  const clipboardVersion = ref(0);
  let unsubscribeSnapshot: (() => void) | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeProblems: (() => void) | null = null;
  let unsubscribeAssetWorkspace: (() => void) | null = null;
  let unsubscribeSnap: (() => void) | null = null;
  let unsubscribeViewportHelpers: (() => void) | null = null;
  let unsubscribeTransformMode: (() => void) | null = null;
  let disposed = false;

  function subscribeEditor(nextEditor: Editor): void {
    cleanupSubscriptions();
    viewportHelperStore = getViewportHelperStore(nextEditor);
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
    unsubscribeViewportHelpers = subscribeViewportHelperStore(nextEditor, viewportHelperStore, (nextState) => {
      viewportHelperState.value = nextState;
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
    unsubscribeViewportHelpers?.();
    unsubscribeViewportHelpers = null;
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
      ensureDefaultWorkbenchViewportHelpers(getViewportHelperStore(nextEditor));
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

  function setActiveCameraViewId(value: string | null): void {
    const cameraViews = currentEditor.value.getSnapshot().cameras;
    const defaultCameraId = currentEditor.value.getSnapshot().presentation.defaultCameraId;
    requestedActiveCameraViewId.value = value && cameraViews[value]
      ? value
      : defaultCameraId && cameraViews[defaultCameraId]
        ? defaultCameraId
        : Object.keys(cameraViews)[0] ?? null;
  }

  function setTransformMode(mode: TransformMode): void {
    currentEditor.value.transformMode.set(mode);
  }

  function toggleSnap(channel: SnapChannel, increment = defaultSnapIncrement(channel)): SnapSettings {
    return currentEditor.value.snap.toggle(channel, increment);
  }

  function toggleViewportHelper(key: ViewportHelperKey): ViewportHelperStateSnapshot {
    return viewportHelperStore.toggle(key);
  }

  function runAction(action: EditorAction): ReturnType<typeof executeEditorAction> {
    const result = executeEditorAction(currentEditor.value, action);
    if (action === "copy") clipboardVersion.value++;
    return result;
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

  function captureCameraView(input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}): AuthoredCameraViewInput | null {
    const result = currentEditor.value.getRuntime()?.captureCameraView(input);
    return result?.ok ? result.view : null;
  }

  function applyCameraView(view: AuthoredCameraView): boolean {
    const currentRuntime = currentEditor.value.getRuntime();
    if (!currentRuntime) {
      return false;
    }
    currentRuntime.applyCameraView(view);
    return true;
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

  function setLocale(nextLocale: WorkbenchLocale): void {
    const normalized = normalizeWorkbenchLocale(nextLocale);
    options.onLocaleChange?.(normalized);
    if (!controlledLocale.value) {
      uncontrolledLocale.value = normalized;
    }
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
      activeCameraViewId: requestedActiveCameraViewId.value,
      runtimeProblems: runtimeProblems.value,
      runtimeReady: runtime.value !== null
    })
  );
  const model = computed(() => {
    assetWorkspaceVersion.value;
    clipboardVersion.value;
    return buildWorkbenchModel(snapshot.value, {
      canPaste: currentEditor.value.operations.canPaste(),
      inspector: inspector.value,
      runtimeProblems: runtimeProblems.value,
      assetPayloads: getAssetWorkspacePayloads(currentEditor.value),
      history: currentEditor.value.getHistoryState(),
      snap: snap.value,
      viewportHelpers: viewportHelperState.value,
      transformMode: transformMode.value,
      runtimeReady: runtime.value !== null
    });
  });
  const assetPayloads = computed(() => {
    assetWorkspaceVersion.value;
    return getAssetWorkspacePayloads(currentEditor.value);
  });
  const hierarchyRowsById = computed(() =>
    new Map(model.value.hierarchy.rows.map((row) => [row.id, row]))
  );
  const activeLightId = computed({
    get: () => inspector.value.lights.activeLightId,
    set: setActiveLightId
  });
  const activeCameraViewId = computed({
    get: () => inspector.value.cameras.activeCameraViewId,
    set: setActiveCameraViewId
  });
  const resolvedLocale = computed(() =>
    controlledLocale.value
      ? normalizeWorkbenchLocale(localeOption ? localeOption.value : options.locale as WorkbenchLocale | undefined)
      : uncontrolledLocale.value
  );
  const translate = computed(() => translateOption ? translateOption.value : options.translate as WorkbenchTranslate | undefined);
  const i18n = computed<WorkbenchI18n>(() => ({
    locale: resolvedLocale.value,
    supportedLocales: WORKBENCH_LOCALES,
    localeLabel: getWorkbenchLocaleLabel,
    setLocale,
    t(message: WorkbenchMessageInput, values?: WorkbenchMessageValues) {
      return resolveWorkbenchMessage(resolvedLocale.value, message, values, translate.value);
    }
  }));
  const context = computed<ResolvedWorkbenchContext>(() => ({
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
      lightId: model.value.selection.lightId,
      cameraViewId: model.value.selection.cameraViewId
    },
    history: currentEditor.value.getHistoryState(),
    transform: {
      mode: transformMode.value,
      snap: snap.value,
      setMode: setTransformMode,
      toggleSnap
    },
    viewportHelpers: {
      state: viewportHelperState.value,
      toggle: toggleViewportHelper
    },
    camera: {
      ready: runtime.value !== null,
      reset: resetCamera,
      frameSelected,
      frameAll,
      capture: captureCameraView,
      apply: applyCameraView
    },
    project: {
      importProject,
      exportProject
    },
    assets: {
      payloads: assetPayloads.value,
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
    i18n: i18n.value,
    runtimeProblems: runtimeProblems.value,
    runtime: runtime.value,
    runtimeReady: runtime.value !== null,
    activeLightId: activeLightId.value,
    activeLightNodeId: inspector.value.lights.activeLightNodeId,
    activeCameraViewId: activeCameraViewId.value,
    operations: {
      ...currentEditor.value.operations,
      copy(...args) {
        const payload = currentEditor.value.operations.copy(...args);
        clipboardVersion.value++;
        return payload;
      }
    },
    historyState: currentEditor.value.getHistoryState(),
    selectionCount: model.value.selection.count,
    selectedNodeId: model.value.selection.nodeId,
    selectedNodeIds: model.value.selection.nodeIds,
    selectedNodeKind: model.value.selection.nodeKind,
    selectedObjectId: model.value.selection.objectId,
    selectedObjectIds: model.value.selection.objectIds,
    selectedLightId: model.value.selection.lightId,
    selectedCameraViewId: model.value.selection.cameraViewId,
    snap: snap.value,
    viewportHelperState: viewportHelperState.value,
    transformMode: transformMode.value,
    hierarchyRowsById: hierarchyRowsById.value,
    setActiveLightId,
    setActiveCameraViewId,
    setTransformMode,
    toggleSnap,
    toggleViewportHelper,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    captureCameraView,
    applyCameraView,
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
    activeCameraViewId,
    snap,
    viewportHelperState,
    transformMode,
    context,
    get ownsEditor() {
      return ownsCurrentEditor.value;
    },
    setActiveLightId,
    setActiveCameraViewId,
    setTransformMode,
    toggleSnap,
    toggleViewportHelper,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    captureCameraView,
    applyCameraView,
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

function resolveLoader(loader: UseWorkbenchOptions["loader"]): EditorRuntimeOptions["loader"] | undefined {
  return isRefValue<EditorRuntimeOptions["loader"] | undefined>(loader) ? loader.value : loader;
}

function isRefValue<T>(value: unknown): value is Ref<T> {
  return Boolean(value && typeof value === "object" && "value" in value);
}
