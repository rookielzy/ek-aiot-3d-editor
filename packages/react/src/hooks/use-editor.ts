import { useMemo, useState, useSyncExternalStore } from "react";
import { createEditor, type Editor, type EditorOptions, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

export interface UseEditorOptions extends EditorOptions {
  editor?: Editor;
}

export function useEditor(options: UseEditorOptions = {}): Editor {
  // Host capabilities are constructor options; replacing their arrays or
  // functions must not replace authored state or a mounted runtime.
  const [initialCredentials] = useState(options.credentials);
  const [initialExecutor] = useState(() => options.executor);
  const [initialAuthRevision] = useState(options.authRevision);
  const [initialMaxResponseBytes] = useState(options.maxResponseBytes);
  return useMemo(() => options.editor ?? createEditor({
    snapshot: options.snapshot,
    credentials: initialCredentials,
    executor: initialExecutor,
    authRevision: initialAuthRevision,
    maxResponseBytes: initialMaxResponseBytes
  }), [
    options.editor,
    options.snapshot,
    initialCredentials,
    initialExecutor,
    initialAuthRevision,
    initialMaxResponseBytes
  ]);
}

export function useEditorSnapshot(editor: Editor): SceneSnapshot {
  return useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getSnapshot(),
    () => editor.getSnapshot()
  );
}
