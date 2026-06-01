import { createClipboardPayload } from "../clipboard/create-clipboard";
import type { EditorClipboardPayload } from "../clipboard/types";
import type { CommandResult } from "../commands/types";
import type { Editor } from "./editor-api";

export interface EditorClipboard {
  get(): EditorClipboardPayload | null;
  set(payload: EditorClipboardPayload | null): void;
  clear(): void;
}

export interface AdvancedEditorOperations {
  copy(objectIds?: string[]): EditorClipboardPayload | null;
  paste(payload?: EditorClipboardPayload | null): CommandResult;
  duplicate(objectIds?: string[]): CommandResult;
  delete(objectIds?: string[]): CommandResult;
  group(objectIds?: string[]): CommandResult;
  ungroup(objectId?: string): CommandResult;
  selectAll(): CommandResult;
  clearSelection(): CommandResult;
  canPaste(): boolean;
}

export function createMemoryClipboard(): EditorClipboard {
  let payload: EditorClipboardPayload | null = null;
  return {
    get: () => payload,
    set: (nextPayload) => {
      payload = nextPayload;
    },
    clear: () => {
      payload = null;
    }
  };
}

export function createAdvancedEditorOperations(editor: Editor, clipboard: EditorClipboard = createMemoryClipboard()): AdvancedEditorOperations {
  return {
    copy(objectIds) {
      const payload = createClipboardPayload(editor.getSnapshot(), objectIds);
      if (payload.rootObjectIds.length === 0) {
        clipboard.clear();
        return null;
      }
      clipboard.set(payload);
      return payload;
    },
    paste(payload = clipboard.get()) {
      if (!payload) {
        return { ok: false, snapshot: editor.getSnapshot(), error: "Clipboard is empty." };
      }
      return editor.dispatch({ type: "paste-objects", payload });
    },
    duplicate(objectIds) {
      return editor.dispatch({ type: "duplicate-objects", objectIds });
    },
    delete(objectIds) {
      return editor.dispatch({ type: "delete-objects", objectIds });
    },
    group(objectIds) {
      return editor.dispatch({ type: "group-objects", objectIds });
    },
    ungroup(objectId) {
      return editor.dispatch({ type: "ungroup-objects", objectId });
    },
    selectAll() {
      return editor.dispatch({ type: "select-objects", mode: "all" });
    },
    clearSelection() {
      return editor.dispatch({ type: "select-objects", mode: "clear" });
    },
    canPaste() {
      return clipboard.get() !== null;
    }
  };
}
