import { useMemo, useState, useSyncExternalStore } from "react";
import { createEditor, type Editor, type EditorOptions, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

export interface UseEditorOptions extends EditorOptions {
  editor?: Editor;
}

export function useEditor(options: UseEditorOptions = {}): Editor {
  // Credentials and executors are constructor options; replacing their arrays or
  // functions must not replace authored state or a mounted runtime.
  const [initialCredentials] = useState(options.credentials);
  const [initialExecutor] = useState(() => options.executor);
  return useMemo(() => options.editor ?? createEditor({
    snapshot: options.snapshot,
    credentials: initialCredentials,
    executor: initialExecutor
  }), [options.editor, options.snapshot, initialCredentials, initialExecutor]);
}

export function useEditorSnapshot(editor: Editor): SceneSnapshot {
  return useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getSnapshot(),
    () => editor.getSnapshot()
  );
}
