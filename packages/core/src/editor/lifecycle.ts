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
import type { ProjectAssetSourceInput } from "../project/project-api";
import type { ProjectExportOptions, ProjectExportResult, ProjectImportOptions, ProjectImportResult, ReplaceAssetInput, ReplaceAssetResult } from "../project/project-api";
import { ThreeEditorRuntime, type EditorRuntime } from "../runtime/editor-runtime";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";
import { createAdvancedEditorOperations, createMemoryClipboard, type AdvancedEditorOperations, type EditorClipboard } from "./operations";
import { EditorSnapState, type SnapSubscriber } from "./snap-state";
import { restoreSnapshot, serializeSnapshot } from "./serialization";
import { EditorStore } from "./store";
import type { Editor, EditorOptions, MountRuntimeOptions, RuntimeSubscriber, SnapshotSubscriber } from "./editor-api";

export class CoreEditor implements Editor {
  readonly assets = new AssetRegistry();
  readonly projectAssets = new ProjectAssetStore();
  readonly history = new CommandHistory();
  readonly store: EditorStore;
  readonly dispatcher: CommandDispatcher;
  readonly clipboard: EditorClipboard = createMemoryClipboard();
  readonly operations: AdvancedEditorOperations;
  readonly snap = new EditorSnapState();
  #runtime: EditorRuntime | null = null;
  #runtimeSubscribers = new Set<RuntimeSubscriber>();
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

  dispatch(command: Command): CommandResult {
    const result = this.dispatcher.dispatch(command);
    if (result.ok) {
      try {
        this.#registerCommandProjectAsset(command, result.snapshot);
      } catch {
        // Transient payload registration must not change durable command results.
      }
    }
    return result;
  }

  undo(): CommandResult {
    return this.dispatcher.undo();
  }

  redo(): CommandResult {
    return this.dispatcher.redo();
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
    return this.store.replaceSnapshot(restored);
  }

  registerAsset(asset: AssetInput) {
    const reference = this.assets.register(asset);
    const source = asset.source;
    if (isProjectAssetSource(source)) {
      this.projectAssets.register({ asset: reference, source });
    }
    return reference;
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
      return {
        ...result,
        snapshot: this.store.getSnapshot()
      };
    }

    this.history.clear();
    const snapshot = this.store.replaceSnapshot(result.snapshot);
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
      resolver: this.#resolver
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
    this.assets.clear();
    this.projectAssets.clear();
    this.clipboard.clear();
    this.snap.clear();
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
