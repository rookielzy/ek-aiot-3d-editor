import { useCallback } from "react";
import {
  type Command,
  type Editor,
  type EditorOptions,
  type InspectorModel,
  type Problem,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useEditor } from "./use-editor";
import { useInspector } from "./use-inspector";

export interface UseWorkbenchOptions extends EditorOptions {
  editor?: Editor;
}

export interface WorkbenchContext {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  activeLightId: string | null;
  setActiveLightId(value: string | null): void;
  refreshProblems(): void;
  dispatch(command: Command): ReturnType<Editor["dispatch"]>;
}

export interface UseWorkbenchResult extends WorkbenchContext {
  ownsEditor: boolean;
  dispose(): void;
}

export function useWorkbench(options: UseWorkbenchOptions = {}): UseWorkbenchResult {
  const editor = useEditor(options);
  const inspector = useInspector({ editor });
  const ownsEditor = !options.editor;
  const dispatch = useCallback((command: Command) => editor.dispatch(command), [editor]);
  const dispose = useCallback(() => {
    if (ownsEditor) {
      editor.dispose();
    }
  }, [editor, ownsEditor]);

  return {
    editor,
    snapshot: inspector.snapshot,
    inspector: inspector.inspector,
    runtimeProblems: inspector.runtimeProblems,
    activeLightId: inspector.activeLightId,
    setActiveLightId: inspector.setActiveLightId,
    refreshProblems: inspector.refreshProblems,
    dispatch,
    ownsEditor,
    dispose
  };
}
