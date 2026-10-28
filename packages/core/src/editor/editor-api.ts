import type { AssetInput, AssetReference } from "../assets/types";
import type { GlbImportDiagnostic, GlbImportManifest } from "../assets/import-pipeline";
import type { GlbImportRemapPlan } from "../assets/import-remap";
import type { WorkbenchAssetImportOptions, WorkbenchAssetImportResult } from "../assets/workspace-import";
import type { Command, CommandResult } from "../commands/types";
import type { DataCredentialDescriptor } from "../data-sources/types";
import type { DataRequestExecutor, EditorDataService } from "../data-sources/service";
import type { AdvancedEditorOperations, EditorClipboard } from "./operations";
import type { MarqueeSelectionSubscriber, ReadonlyEditorMarqueeSelectionState } from "./marquee-selection-state";
import type { EditorSnapState, SnapSubscriber } from "./snap-state";
import type { EditorViewportHelperState, ViewportHelperSubscriber } from "./viewport-helper-state";
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
  credentials?: readonly DataCredentialDescriptor[];
  executor?: DataRequestExecutor | null;
  authRevision?: number;
}

export interface MountRuntimeOptions extends Omit<EditorRuntimeOptions, "store" | "dispatcher"> {}

export interface ImportGlbAssetOptions {
  asset: AssetInput;
  loader?: EditorRuntimeOptions["loader"];
  objectId?: string;
  name?: string;
  parentId?: string | null;
  transform?: Partial<SceneSnapshot["objects"][string]["transform"]>;
  commit?: boolean;
  expandImportedTargets?: boolean;
}

export interface ImportGlbAssetResult {
  ok: boolean;
  manifest?: GlbImportManifest;
  diagnostics: GlbImportDiagnostic[];
  commandResult?: CommandResult;
  snapshot: SceneSnapshot;
  committed: boolean;
}

export interface ReimportGlbAssetOptions {
  assetId: string;
  source: NonNullable<AssetInput["source"]>;
  loader?: EditorRuntimeOptions["loader"];
  ownerObjectId?: string;
  commit?: boolean;
}

export interface ReimportGlbAssetResult {
  ok: boolean;
  manifest?: GlbImportManifest;
  diagnostics: GlbImportDiagnostic[];
  remap?: GlbImportRemapPlan;
  commandResult?: CommandResult;
  snapshot: SceneSnapshot;
  committed: boolean;
}

export interface Editor {
  getSnapshot(): SceneSnapshot;
  subscribe(subscriber: SnapshotSubscriber): () => void;
  dispatch(command: Command): CommandResult;
  readonly operations: AdvancedEditorOperations;
  readonly clipboard: EditorClipboard;
  readonly snap: EditorSnapState;
  readonly marqueeSelection?: ReadonlyEditorMarqueeSelectionState;
  readonly viewportHelpers?: EditorViewportHelperState;
  readonly transformMode: EditorTransformModeState;
  subscribeSnap(subscriber: SnapSubscriber): () => void;
  subscribeViewportHelpers?(subscriber: ViewportHelperSubscriber): () => void;
  subscribeTransformMode(subscriber: TransformModeSubscriber): () => void;
  undo(): CommandResult;
  redo(): CommandResult;
  getHistoryState(): HistoryState;
  serialize(): SerializedSceneSnapshot;
  restore(snapshot: SerializedSceneSnapshot): SceneSnapshot;
  subscribeMarqueeSelection?(subscriber: MarqueeSelectionSubscriber): () => void;
  registerAsset(asset: Parameters<import("../assets/registry").AssetRegistry["register"]>[0]): AssetReference;
  getDataCredentials?(): readonly DataCredentialDescriptor[];
  getDataService?(): EditorDataService;
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

export interface EditorWithGlbImport extends Editor {
  importGlbAsset(options: ImportGlbAssetOptions): Promise<ImportGlbAssetResult>;
  reimportGlbAsset(options: ReimportGlbAssetOptions): Promise<ReimportGlbAssetResult>;
  importWorkbenchAssets(options: WorkbenchAssetImportOptions): Promise<WorkbenchAssetImportResult[]>;
}
