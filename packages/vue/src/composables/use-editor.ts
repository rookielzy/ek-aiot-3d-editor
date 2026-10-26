import { computed, markRaw, onBeforeUnmount, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import { createEditor, type Editor, type EditorOptions, type SceneSnapshot, type SerializedSceneSnapshot } from "@ek-aiot/3d-editor-core";

export interface UseEditorOptions extends EditorOptions {
  editor?: Editor;
}

export interface UseEditorResult {
  editor: Editor;
  snapshot: ShallowRef<SceneSnapshot>;
  objectCount: ComputedRef<number>;
  restore(snapshot: SerializedSceneSnapshot): void;
  dispose(): void;
}

export function useEditor(options: UseEditorOptions = {}): UseEditorResult {
  const editor = markRaw(options.editor ?? createEditor({
    snapshot: options.snapshot,
    credentials: options.credentials,
    executor: options.executor
  }));
  const snapshot = shallowRef(editor.getSnapshot());
  const unsubscribe = editor.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot;
  });

  function dispose(): void {
    unsubscribe();
    if (!options.editor) {
      editor.dispose();
    }
  }

  onBeforeUnmount(dispose);

  return {
    editor,
    snapshot,
    objectCount: computed(() => Object.keys(snapshot.value.objects).length),
    restore(nextSnapshot) {
      snapshot.value = editor.restore(nextSnapshot);
    },
    dispose
  };
}
