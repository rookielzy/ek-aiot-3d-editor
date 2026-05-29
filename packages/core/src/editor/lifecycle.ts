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
import type { Editor, EditorOptions, MountRuntimeOptions, SnapshotSubscriber } from "./editor-api";

export class CoreEditor implements Editor {
  readonly assets = new AssetRegistry();
  readonly history = new CommandHistory();
  readonly store: EditorStore;
  readonly dispatcher: CommandDispatcher;
  #runtime: EditorRuntime | null = null;
  #resolver = new AssetResolverBridge();
  #disposed = false;

  constructor(options: EditorOptions = {}) {
    this.store = new EditorStore(options.snapshot);
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

  mountRuntime(options: MountRuntimeOptions): EditorRuntime {
    this.#assertActive();
    this.#runtime?.dispose();
    this.#resolver = options.resolver ?? this.#resolver;
    this.#runtime = new ThreeEditorRuntime({
      ...options,
      store: this.store,
      dispatcher: this.dispatcher,
      resolver: this.#resolver
    });
    return this.#runtime;
  }

  getRuntime(): EditorRuntime | null {
    return this.#runtime;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#runtime?.dispose();
    this.#runtime = null;
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
}
