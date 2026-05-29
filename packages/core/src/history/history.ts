import type { SceneSnapshot } from "../snapshot/types";
import type { AppliedCommand } from "../commands/types";

export interface HistoryState {
  undoCount: number;
  redoCount: number;
}

export class CommandHistory {
  #undoStack: AppliedCommand[] = [];
  #redoStack: AppliedCommand[] = [];

  record(entry: AppliedCommand): void {
    if (entry.before === entry.after) {
      return;
    }

    this.#undoStack.push(entry);
    this.#redoStack = [];
  }

  undo(current: SceneSnapshot): SceneSnapshot | null {
    const entry = this.#undoStack.pop();
    if (!entry) {
      return null;
    }

    this.#redoStack.push({
      ...entry,
      before: entry.before,
      after: current
    });

    return entry.before;
  }

  redo(current: SceneSnapshot): SceneSnapshot | null {
    const entry = this.#redoStack.pop();
    if (!entry) {
      return null;
    }

    this.#undoStack.push({
      ...entry,
      before: current,
      after: entry.after
    });

    return entry.after;
  }

  clear(): void {
    this.#undoStack = [];
    this.#redoStack = [];
  }

  get state(): HistoryState {
    return {
      undoCount: this.#undoStack.length,
      redoCount: this.#redoStack.length
    };
  }
}
