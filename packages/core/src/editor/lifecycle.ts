import { AssetRegistry } from "../assets/registry";
import { AssetResolverBridge } from "../assets/resolver";
import type { AssetInput } from "../assets/types";
import { CommandDispatcher } from "../commands/dispatcher";
import type { Command, CommandResult } from "../commands/types";
import { CommandHistory, type HistoryState } from "../history/history";
import { ThreeEditorRuntime, type EditorRuntime } from "../runtime/editor-runtime";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";
import { restoreSnapshot, serializeSnapshot } from "./serialization";
import { EditorStore } from "./store";
import type { Editor, EditorOptions, MountRuntimeOptions, RuntimeSubscriber, SnapshotSubscriber } from "./editor-api";

export class CoreEditor implements Editor {
  readonly assets = new AssetRegistry();
  readonly history = new CommandHistory();
  readonly store: EditorStore;
  readonly dispatcher: CommandDispatcher;
  #runtime: EditorRuntime | null = null;
  #runtimeSubscribers = new Set<RuntimeSubscriber>();
  #resolver = new AssetResolverBridge();
  #disposed = false;

  constructor(options: EditorOptions = {}) {
    this.store = new EditorStore(options.snapshot ? restoreSnapshot(options.snapshot) : undefined);
    this.dispatcher = new CommandDispatcher(this.store, this.history, this.assets);
  }

  getSnapshot(): SceneSnapshot {
    return this.store.getSnapshot();
  }

  subscribe(subscriber: SnapshotSubscriber): () => void {
    return this.store.subscribe(subscriber);
  }

  dispatch(command: Command): CommandResult {
    return this.dispatcher.dispatch(command);
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
    return this.store.replaceSnapshot(restored);
  }

  registerAsset(asset: AssetInput) {
    return this.assets.register(asset);
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
}
