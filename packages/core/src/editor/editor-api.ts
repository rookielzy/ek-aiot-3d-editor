import type { AssetReference } from "../assets/types";
import type { Command, CommandResult } from "../commands/types";
import type { AdvancedEditorOperations, EditorClipboard } from "./operations";
import type { EditorSnapState, SnapSubscriber } from "./snap-state";
import type { EditorTransformModeState, TransformModeSubscriber } from "../runtime/transform/transform-mode";
import type { HistoryState } from "../history/history";
import type { ProjectAssetPayloadSummary, ProjectExportOptions, ProjectExportResult, ProjectImportOptions, ProjectImportResult, ReplaceAssetInput, ReplaceAssetResult } from "../project/project-api";
import type { EditorRuntime, EditorRuntimeOptions } from "../runtime/editor-runtime";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";

export type SnapshotSubscriber = (snapshot: SceneSnapshot) => void;
export type RuntimeSubscriber = (runtime: EditorRuntime | null) => void;
export type AssetWorkspaceSubscriber = (version: number) => void;

export interface EditorOptions {
  snapshot?: SerializedSceneSnapshot;
}

export interface MountRuntimeOptions extends Omit<EditorRuntimeOptions, "store" | "dispatcher"> {}

export interface Editor {
  getSnapshot(): SceneSnapshot;
  subscribe(subscriber: SnapshotSubscriber): () => void;
  dispatch(command: Command): CommandResult;
  readonly operations: AdvancedEditorOperations;
  readonly clipboard: EditorClipboard;
  readonly snap: EditorSnapState;
  readonly transformMode: EditorTransformModeState;
  subscribeSnap(subscriber: SnapSubscriber): () => void;
  subscribeTransformMode(subscriber: TransformModeSubscriber): () => void;
  undo(): CommandResult;
  redo(): CommandResult;
  getHistoryState(): HistoryState;
  serialize(): SerializedSceneSnapshot;
  restore(snapshot: SerializedSceneSnapshot): SceneSnapshot;
  registerAsset(asset: Parameters<import("../assets/registry").AssetRegistry["register"]>[0]): AssetReference;
  getAssetWorkspacePayloads?(): ProjectAssetPayloadSummary[];
  getAssetWorkspaceVersion?(): number;
  subscribeAssetWorkspace?(subscriber: AssetWorkspaceSubscriber): () => void;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  subscribeRuntime(subscriber: RuntimeSubscriber): () => void;
  mountRuntime(options: MountRuntimeOptions): EditorRuntime;
  getRuntime(): EditorRuntime | null;
  dispose(): void;
  readonly disposed: boolean;
}
