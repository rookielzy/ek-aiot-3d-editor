import { useMemo, useSyncExternalStore } from "react";
import { createEditor, type Editor, type EditorOptions, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

export interface UseEditorOptions extends EditorOptions {
  editor?: Editor;
}

export function useEditor(options: UseEditorOptions = {}): Editor {
  return useMemo(() => options.editor ?? createEditor({ snapshot: options.snapshot }), [options.editor, options.snapshot]);
}

export function useEditorSnapshot(editor: Editor): SceneSnapshot {
  return useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.getSnapshot(),
    () => editor.getSnapshot()
  );
}
