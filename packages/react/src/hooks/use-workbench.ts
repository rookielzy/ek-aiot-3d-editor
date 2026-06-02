import { useCallback, useSyncExternalStore } from "react";
import {
  type Command,
  type Editor,
  type EditorAction,
  type EditorOptions,
  type EditorRuntime,
  type AdvancedEditorOperations,
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
  type SceneSnapshot,
  type SnapChannel,
  type SnapSettings,
  type TransformMode
} from "@ek-aiot/3d-editor-core";
import { executeEditorAction } from "@ek-aiot/3d-editor-core";
import { useEditor } from "./use-editor";
import { useInspector } from "./use-inspector";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: Editor;
}

export interface WorkbenchContext {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  runtime: EditorRuntime | null;
  runtimeReady: boolean;
  activeLightId: string | null;
  operations: AdvancedEditorOperations;
  historyState: HistoryState;
  selectionCount: number;
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
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}

export interface UseWorkbenchResult extends WorkbenchContext {
  ownsEditor: boolean;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editor = useEditor(options);
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
  const runtime = useSyncExternalStore(
    (listener) => editor.subscribeRuntime(listener),
    () => editor.getRuntime(),
    () => editor.getRuntime()
  );
  const inspector = useInspector({ editor });
  const ownsEditor = !options.editor;
  const dispatch = useCallback((command: Command) => editor.dispatch(command), [editor]);
  const setTransformMode = useCallback((mode: TransformMode) => {
    editor.transformMode.set(mode);
  }, [editor]);
  const toggleSnap = useCallback((channel: SnapChannel, increment = defaultSnapIncrement(channel)) =>
    editor.snap.toggle(channel, increment), [editor]);
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
  const dispose = useCallback(() => {
    if (ownsEditor) {
      editor.dispose();
    }
  }, [editor, ownsEditor]);

  return {
    editor,
    snapshot: inspector.snapshot,
    inspector: inspector.inspector,
    runtimeProblems: inspector.runtimeProblems,
    runtime,
    runtimeReady: runtime !== null,
    activeLightId: inspector.activeLightId,
    operations: editor.operations,
    historyState: editor.getHistoryState(),
    selectionCount: inspector.inspector.selection.count,
    snap,
    transformMode,
    setActiveLightId: inspector.setActiveLightId,
    setTransformMode,
    toggleSnap,
    runAction,
    resetCamera,
    frameSelected,
    frameAll,
    refreshProblems: inspector.refreshProblems,
    dispatch,
    importProject,
    exportProject,
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
