import { AssetRegistry } from "../assets/registry";
import { AssetResolverBridge } from "../assets/resolver";
import type { AssetInput } from "../assets/types";
import { CommandDispatcher } from "../commands/dispatcher";
import type { Command, CommandResult } from "../commands/types";
import { CommandHistory, type HistoryState } from "../history/history";
import { defaultArchiveAdapter } from "../project/archive-adapter";
import { ProjectAssetStore } from "../project/asset-store";
import { exportProjectPackage } from "../project/export-project";
import { importProjectAssets } from "../project/import-project";
import { replaceProjectAsset } from "../project/replace-asset";
import type { ProjectAssetPayloadSummary, ProjectAssetSourceInput } from "../project/project-api";
import type { ProjectExportOptions, ProjectExportResult, ProjectImportOptions, ProjectImportResult, ReplaceAssetInput, ReplaceAssetResult } from "../project/project-api";
import { ThreeEditorRuntime, type EditorRuntime } from "../runtime/editor-runtime";
import { EditorTransformModeState, type TransformModeSubscriber } from "../runtime/transform/transform-mode";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";
import { createAdvancedEditorOperations, createMemoryClipboard, type AdvancedEditorOperations, type EditorClipboard } from "./operations";
import { EditorSnapState, type SnapSubscriber } from "./snap-state";
import { restoreSnapshot, serializeSnapshot } from "./serialization";
import { EditorStore } from "./store";
import type { AssetWorkspaceSubscriber, Editor, EditorOptions, MountRuntimeOptions, RuntimeSubscriber, SnapshotSubscriber } from "./editor-api";

export class CoreEditor implements Editor {
  readonly assets = new AssetRegistry();
  readonly projectAssets = new ProjectAssetStore();
  readonly history = new CommandHistory();
  readonly store: EditorStore;
  readonly dispatcher: CommandDispatcher;
  readonly clipboard: EditorClipboard = createMemoryClipboard();
  readonly operations: AdvancedEditorOperations;
  readonly snap = new EditorSnapState();
  readonly transformMode = new EditorTransformModeState();
  #runtime: EditorRuntime | null = null;
  #runtimeSubscribers = new Set<RuntimeSubscriber>();
  #assetWorkspaceSubscribers = new Set<AssetWorkspaceSubscriber>();
  #assetWorkspaceVersion = 0;
  #resolver = new AssetResolverBridge(undefined, this.projectAssets);
  #disposed = false;

  constructor(options: EditorOptions = {}) {
    this.store = new EditorStore(options.snapshot ? restoreSnapshot(options.snapshot) : undefined);
    this.dispatcher = new CommandDispatcher(this.store, this.history, this.assets);
    this.operations = createAdvancedEditorOperations(this, this.clipboard);
  }

  getSnapshot(): SceneSnapshot {
    return this.store.getSnapshot();
  }

  subscribe(subscriber: SnapshotSubscriber): () => void {
    return this.store.subscribe(subscriber);
  }

  subscribeSnap(subscriber: SnapSubscriber): () => void {
    this.#assertActive();
    return this.snap.subscribe(subscriber);
  }

  subscribeTransformMode(subscriber: TransformModeSubscriber): () => void {
    this.#assertActive();
    return this.transformMode.subscribe(subscriber);
  }

  dispatch(command: Command): CommandResult {
    const result = this.dispatcher.dispatch(command);
    if (result.ok) {
      try {
        this.#registerCommandProjectAsset(command, result.snapshot);
      } catch {
        // Transient payload registration must not change durable command results.
      }
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  undo(): CommandResult {
    const result = this.dispatcher.undo();
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  redo(): CommandResult {
    const result = this.dispatcher.redo();
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  getHistoryState(): HistoryState {
    return this.history.state;
  }

  serialize(): SerializedSceneSnapshot {
    return serializeSnapshot(this.store.getSnapshot());
  }

  restore(snapshot: SerializedSceneSnapshot): SceneSnapshot {
    const restored = restoreSnapshot(snapshot);
    this.history.clear();
    this.projectAssets.clear();
    this.clipboard.clear();
    this.snap.set({});
    this.transformMode.reset();
    const nextSnapshot = this.store.replaceSnapshot(restored);
    this.#notifyAssetWorkspaceSubscribers();
    return nextSnapshot;
  }

  registerAsset(asset: AssetInput) {
    const reference = this.assets.register(asset);
    const source = asset.source;
    if (isProjectAssetSource(source)) {
      this.projectAssets.register({ asset: reference, source });
      this.#notifyAssetWorkspaceSubscribers();
    }
    return reference;
  }

  getAssetWorkspacePayloads(): ProjectAssetPayloadSummary[] {
    this.#assertActive();
    return this.projectAssets.summaries();
  }

  getAssetWorkspaceVersion(): number {
    this.#assertActive();
    return this.#assetWorkspaceVersion;
  }

  subscribeAssetWorkspace(subscriber: AssetWorkspaceSubscriber): () => void {
    this.#assertActive();
    this.#assetWorkspaceSubscribers.add(subscriber);
    subscriber(this.getAssetWorkspaceVersion());

    return () => {
      this.#assetWorkspaceSubscribers.delete(subscriber);
    };
  }

  importProject(packageBytes: Uint8Array, options: ProjectImportOptions = {}): ProjectImportResult {
    this.#assertActive();
    const previousAssets = [...this.projectAssets.entries()].map(([, asset]) => asset);
    const result = importProjectAssets(packageBytes, this.projectAssets, {
      ...options,
      archive: defaultArchiveAdapter
    });
    if (!result.ok) {
      this.projectAssets.replaceAll(previousAssets);
      this.#notifyAssetWorkspaceSubscribers();
      return {
        ...result,
        snapshot: this.store.getSnapshot()
      };
    }

    this.history.clear();
    const snapshot = this.store.replaceSnapshot(result.snapshot);
    this.#notifyAssetWorkspaceSubscribers();
    void this.#runtime?.project(snapshot);
    return {
      ...result,
      snapshot
    };
  }

  exportProject(options: ProjectExportOptions = {}): ProjectExportResult {
    this.#assertActive();
    return exportProjectPackage(this.store.getSnapshot(), this.projectAssets, defaultArchiveAdapter, options);
  }

  async replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> {
    this.#assertActive();
    const result = await replaceProjectAsset(this.store.getSnapshot(), this.projectAssets, input);
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
      void this.#runtime?.project(this.store.getSnapshot());
    }
    return result;
  }

  subscribeRuntime(subscriber: RuntimeSubscriber): () => void {
    this.#assertActive();
    this.#runtimeSubscribers.add(subscriber);
    subscriber(this.getRuntime());

    return () => {
      this.#runtimeSubscribers.delete(subscriber);
    };
  }

  mountRuntime(options: MountRuntimeOptions): EditorRuntime {
    this.#assertActive();
    if (this.#runtime) {
      this.#runtime.dispose();
      this.#runtime = null;
      this.#notifyRuntimeSubscribers();
    }
    this.#resolver = options.resolver ?? this.#resolver;
    this.#resolver.setProjectAssets(this.projectAssets);
    this.#runtime = new ThreeEditorRuntime({
      ...options,
      store: this.store,
      dispatcher: this.dispatcher,
      resolver: this.#resolver,
      snap: this.snap,
      transformMode: this.transformMode
    });
    this.#notifyRuntimeSubscribers();
    return this.#runtime;
  }

  getRuntime(): EditorRuntime | null {
    return this.#runtime?.disposed ? null : this.#runtime;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#runtime?.dispose();
    this.#runtime = null;
    this.#notifyRuntimeSubscribers();
    this.#runtimeSubscribers.clear();
    this.#assetWorkspaceSubscribers.clear();
    this.assets.clear();
    this.projectAssets.clear();
    this.clipboard.clear();
    this.snap.clear();
    this.transformMode.clear();
    this.store.dispose();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Editor has been disposed.");
    }
  }

  #notifyRuntimeSubscribers(): void {
    const runtime = this.getRuntime();
    for (const subscriber of [...this.#runtimeSubscribers]) {
      subscriber(runtime);
    }
  }

  #notifyAssetWorkspaceSubscribers(): void {
    this.#assetWorkspaceVersion += 1;
    for (const subscriber of [...this.#assetWorkspaceSubscribers]) {
      subscriber(this.#assetWorkspaceVersion);
    }
  }

  #registerCommandProjectAsset(command: Command, snapshot: SceneSnapshot): void {
    if (command.type === "batch") {
      for (const childCommand of command.commands) {
        this.#registerCommandProjectAsset(childCommand, snapshot);
      }
      return;
    }

    if ((command.type !== "import-glb" && command.type !== "register-asset") || !isProjectAssetSource(command.asset.source)) {
      return;
    }
    const assetId = command.asset.id;
    const reference = assetId ? snapshot.assets[assetId] : [...Object.values(snapshot.assets)].at(-1);
    if (!reference) {
      return;
    }
    this.projectAssets.register({
      asset: reference,
      source: command.asset.source,
      ...(command.asset.label ? { label: command.asset.label } : {}),
      ...(command.asset.metadata ? { metadata: command.asset.metadata } : {})
    });
  }
}

function isProjectAssetSource(source: AssetInput["source"]): source is ProjectAssetSourceInput {
  return source !== undefined && source !== null;
}
