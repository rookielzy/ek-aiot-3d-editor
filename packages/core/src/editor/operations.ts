import { createClipboardPayload, createNodeClipboardPayload } from "../clipboard/create-clipboard";
import type { EditorClipboardPayload } from "../clipboard/types";
import type { CommandResult } from "../commands/types";
import { getSelectedNodeIds } from "../selection/selection";
import type { SceneSnapshot } from "../snapshot/types";
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
      const snapshot = editor.getSnapshot();
      const payload = objectIds
        ? createClipboardPayload(snapshot, objectIds)
        : createClipboardPayloadForSelection(snapshot);
      if (getClipboardRootCount(payload) === 0) {
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
      const snapshot = editor.getSnapshot();
      if (objectIds || isObjectOnlySelection(snapshot)) {
        return editor.dispatch({ type: "duplicate-objects", objectIds });
      }
      const payload = createNodeClipboardPayload(snapshot);
      if (payload.rootNodeIds.length === 0) {
        return { ok: true, snapshot };
      }
      return editor.dispatch({ type: "paste-objects", payload });
    },
    delete(objectIds) {
      return objectIds || isObjectOnlySelection(editor.getSnapshot())
        ? editor.dispatch({ type: "delete-objects", objectIds })
        : editor.dispatch({ type: "delete-nodes" });
    },
    group(objectIds) {
      return objectIds || isObjectOnlySelection(editor.getSnapshot())
        ? editor.dispatch({ type: "group-objects", objectIds })
        : editor.dispatch({ type: "group-nodes" });
    },
    ungroup(objectId) {
      if (objectId) {
        return editor.dispatch({ type: "ungroup-objects", objectId });
      }

      const snapshot = editor.getSnapshot();
      const selectedNode = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : undefined;
      return selectedNode?.kind === "group"
        ? editor.dispatch({ type: "ungroup-nodes" })
        : editor.dispatch({ type: "ungroup-objects" });
    },
    selectAll() {
      return editor.dispatch({ type: "select-nodes", mode: "all" });
    },
    clearSelection() {
      return editor.dispatch({ type: "select-nodes", mode: "clear" });
    },
    canPaste() {
      return clipboard.get() !== null;
    }
  };
}

function getClipboardRootCount(payload: EditorClipboardPayload): number {
  return payload.kind === "ek-aiot-3d-editor-nodes"
    ? payload.rootNodeIds.length
    : payload.rootObjectIds.length;
}

function createClipboardPayloadForSelection(snapshot: SceneSnapshot): EditorClipboardPayload {
  const selectedNodeIds = getSelectedNodeIds(snapshot);

  return isObjectOnlySelection(snapshot, selectedNodeIds)
    ? createClipboardPayload(snapshot)
    : createNodeClipboardPayload(snapshot, selectedNodeIds);
}

function isObjectOnlySelection(
  snapshot: SceneSnapshot,
  selectedNodeIds = getSelectedNodeIds(snapshot)
): boolean {
  return selectedNodeIds.every((nodeId) => snapshot.nodes[nodeId]?.kind === "object");
}
