import type { AssetReference } from "../assets/types";
import type { Command, CommandResult } from "../commands/types";
import type { HistoryState } from "../history/history";
import type { EditorRuntime, EditorRuntimeOptions } from "../runtime/editor-runtime";
import type { SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";

export type SnapshotSubscriber = (snapshot: SceneSnapshot) => void;
export type RuntimeSubscriber = (runtime: EditorRuntime | null) => void;

export interface EditorOptions {
  snapshot?: SerializedSceneSnapshot;
}

export interface MountRuntimeOptions extends Omit<EditorRuntimeOptions, "store" | "dispatcher"> {}

export interface Editor {
  getSnapshot(): SceneSnapshot;
  subscribe(subscriber: SnapshotSubscriber): () => void;
  dispatch(command: Command): CommandResult;
  undo(): CommandResult;
  redo(): CommandResult;
  getHistoryState(): HistoryState;
  serialize(): SerializedSceneSnapshot;
  restore(snapshot: SerializedSceneSnapshot): SceneSnapshot;
  registerAsset(asset: Parameters<import("../assets/registry").AssetRegistry["register"]>[0]): AssetReference;
  subscribeRuntime(subscriber: RuntimeSubscriber): () => void;
  mountRuntime(options: MountRuntimeOptions): EditorRuntime;
  getRuntime(): EditorRuntime | null;
  dispose(): void;
  readonly disposed: boolean;
}
