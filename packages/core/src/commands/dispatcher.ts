import type { AssetRegistry } from "../assets/registry";
import type { EditorStore } from "../editor/store";
import type { CommandHistory } from "../history/history";
import { immutableClone } from "../snapshot/immutability";
import type { SceneSnapshot } from "../snapshot/types";
import { assertValidSceneSnapshot } from "../snapshot/validation";
import { applyImportGlb } from "./import-glb";
import { applySelectObject } from "./select-object";
import { applySetTransform } from "./set-transform";
import type { Command, CommandResult } from "./types";

export class CommandDispatcher {
  constructor(
    private readonly store: EditorStore,
    private readonly history: CommandHistory,
    private readonly assets: AssetRegistry
  ) {}

  dispatch(command: Command): CommandResult {
    const before = this.store.getSnapshot();

    try {
      const applied = this.apply(before, command);
      if (applied === before) {
        return { ok: true, snapshot: before };
      }

      const after = immutableClone(applied);
      assertValidSceneSnapshot(after);

      this.store.replaceSnapshot(after);
      this.history.record({ command, before, after: this.store.getSnapshot() });

      return { ok: true, snapshot: this.store.getSnapshot() };
    } catch (error) {
      return {
        ok: false,
        snapshot: before,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  undo(): CommandResult {
    const before = this.store.getSnapshot();
    const previous = this.history.undo(before);

    if (!previous) {
      return { ok: false, snapshot: before, error: "Nothing to undo." };
    }

    this.store.replaceSnapshot(previous);
    return { ok: true, snapshot: this.store.getSnapshot() };
  }

  redo(): CommandResult {
    const before = this.store.getSnapshot();
    const next = this.history.redo(before);

    if (!next) {
      return { ok: false, snapshot: before, error: "Nothing to redo." };
    }

    this.store.replaceSnapshot(next);
    return { ok: true, snapshot: this.store.getSnapshot() };
  }

  private apply(snapshot: SceneSnapshot, command: Command): SceneSnapshot {
    switch (command.type) {
      case "import-glb":
        return applyImportGlb(snapshot, command, this.assets);
      case "select-object":
        return applySelectObject(snapshot, command);
      case "set-transform":
        return applySetTransform(snapshot, command);
      default:
        return assertNever(command);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}
