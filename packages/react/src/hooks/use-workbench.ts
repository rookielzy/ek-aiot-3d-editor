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
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}

export interface WorkbenchProblemsContext {
  items: InspectorModel["problems"]["problems"];
  runtime: Problem[];
  authoredCount: number;
  runtimeCount: number;
  totalCount: number;
  refresh(): void;
}

export interface WorkbenchContext {
  editor: Editor;
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
  const historyState = editor.getHistoryState();
  const selectedNodeId = inspector.inspector.selection.nodeId;
  const selectedNodeIds = inspector.inspector.selection.nodeIds;
  const selectedNodeKind = inspector.inspector.selection.nodeKind;
  const selectedObjectId = inspector.inspector.selection.objectId;
  const selectedObjectIds = inspector.inspector.selection.objectIds;
  const selectedLightId = inspector.inspector.selection.lightId;
  const selectionCount = inspector.inspector.selection.count;
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
    replaceAsset
  };
  const authoredProblems = inspector.inspector.problems.problems;
  const authoredProblemCount = authoredProblems.filter((problem) => !problem.runtime).length;
  const problems: WorkbenchProblemsContext = {
    items: authoredProblems,
    runtime: inspector.runtimeProblems,
    authoredCount: authoredProblemCount,
    runtimeCount: inspector.runtimeProblems.length,
    totalCount: authoredProblems.length,
    refresh: inspector.refreshProblems
  };

  return {
    editor,
    snapshot: inspector.snapshot,
    inspector: inspector.inspector,
    selection,
    history: historyState,
    transform,
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
