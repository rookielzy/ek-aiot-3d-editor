import { useMemo, useState, useSyncExternalStore } from "react";
import { createEditor, type Editor, type EditorOptions, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

export interface UseEditorOptions extends EditorOptions {
  editor?: Editor;
}

export function useEditor(options: UseEditorOptions = {}): Editor {
  // Credentials are constructor options; replacing their array must not replace authored state.
  const [initialCredentials] = useState(options.credentials);
  return useMemo(() => options.editor ?? createEditor({
    snapshot: options.snapshot,
    credentials: initialCredentials
  }), [options.editor, options.snapshot, initialCredentials]);
}

export function useEditorSnapshot(editor: Editor): SceneSnapshot {
  return useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getSnapshot(),
    () => editor.getSnapshot()
  );
}
