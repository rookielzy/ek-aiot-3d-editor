import { computed, getCurrentInstance, markRaw, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from "vue";
import {
  buildInspectorModel,
  createEditor,
  resolveActiveLightId,
  type AdvancedEditorOperations,
  type Command,
  type Editor,
  type EditorOptions,
  type InspectorModel,
  type Problem,
  type ProjectExportOptions,
  type ProjectExportResult,
  type ProjectImportOptions,
  type ProjectImportResult,
  type ReplaceAssetInput,
  type ReplaceAssetResult,
  type SceneSnapshot,
  type SnapSettings
} from "@ek-aiot/3d-editor-core";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: Editor | Ref<Editor | undefined>;
}

export interface WorkbenchContext {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  activeLightId: string | null;
  operations: AdvancedEditorOperations;
  selectionCount: number;
  snap: SnapSettings;
  setActiveLightId(value: string | null): void;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}

export interface UseWorkbenchResult {
  editor: Editor;
  snapshot: ShallowRef<SceneSnapshot>;
  inspector: ComputedRef<InspectorModel>;
  runtimeProblems: ShallowRef<Problem[]>;
  activeLightId: Ref<string | null>;
  context: ComputedRef<WorkbenchContext>;
  ownsEditor: boolean;
  setActiveLightId(value: string | null): void;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editorOption = isRefOption(options.editor) ? options.editor : undefined;
  const initialEditor = resolveInitialEditor(options, editorOption);
  const currentEditor = shallowRef<Editor>(markRaw(initialEditor));
  const ownsCurrentEditor = ref(editorOption ? !editorOption.value : !options.editor);
  const snapshot = shallowRef(currentEditor.value.getSnapshot());
  const snap = shallowRef<SnapSettings>(currentEditor.value.snap.get());
  const activeLightId = ref<string | null>(resolveActiveLightId(snapshot.value, null));
  const runtimeProblems = shallowRef<Problem[]>(currentEditor.value.getRuntime()?.getProblems() ?? []);
  let unsubscribeSnapshot: (() => void) | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeProblems: (() => void) | null = null;
  let unsubscribeSnap: (() => void) | null = null;
  let disposed = false;

  function subscribeEditor(nextEditor: Editor): void {
    cleanupSubscriptions();
    unsubscribeSnapshot = nextEditor.subscribe((nextSnapshot) => {
      snapshot.value = nextSnapshot;
      activeLightId.value = resolveActiveLightId(nextSnapshot, activeLightId.value);
    });
    snapshot.value = nextEditor.getSnapshot();
    activeLightId.value = resolveActiveLightId(snapshot.value, activeLightId.value);
    unsubscribeRuntime = nextEditor.subscribeRuntime(() => {
      subscribeRuntimeProblems();
    });
    unsubscribeSnap = nextEditor.subscribeSnap((nextSnap) => {
      snap.value = nextSnap;
    });
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
    unsubscribeSnap?.();
    unsubscribeSnap = null;
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
    activeLightId.value = value;
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

  function replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> {
    return currentEditor.value.replaceAsset(input);
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
      activeLightId: activeLightId.value,
      runtimeProblems: runtimeProblems.value
    })
  );
  const context = computed<WorkbenchContext>(() => ({
    editor: currentEditor.value,
    snapshot: snapshot.value,
    inspector: inspector.value,
    runtimeProblems: runtimeProblems.value,
    activeLightId: activeLightId.value,
    operations: currentEditor.value.operations,
    selectionCount: inspector.value.selection.count,
    snap: snap.value,
    setActiveLightId,
    refreshProblems: subscribeRuntimeProblems,
    dispatch,
    importProject,
    exportProject,
    replaceAsset
  }));

  return {
    get editor() {
      return currentEditor.value;
    },
    snapshot,
    inspector,
    runtimeProblems,
    activeLightId,
    context,
    get ownsEditor() {
      return ownsCurrentEditor.value;
    },
    setActiveLightId,
    refreshProblems: subscribeRuntimeProblems,
    dispatch,
    importProject,
    exportProject,
    replaceAsset,
    dispose
  };
}

function isRefOption(value: UseWorkbenchOptions["editor"]): value is Ref<Editor | undefined> {
  return Boolean(value && typeof value === "object" && "value" in value);
}

function resolveInitialEditor(options: UseWorkbenchOptions, editorOption: Ref<Editor | undefined> | undefined): Editor {
  if (editorOption?.value) {
    return editorOption.value;
  }
  if (options.editor && !isRefOption(options.editor)) {
    return options.editor;
  }
  return createEditor({ snapshot: options.snapshot });
}
