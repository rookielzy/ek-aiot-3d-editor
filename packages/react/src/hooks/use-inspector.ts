import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildInspectorModel,
  resolveActiveLightId,
  type Editor,
  type InspectorModel,
  type Problem,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useEditorSnapshot } from "./use-editor";

export interface UseInspectorOptions {
  editor: Editor;
}

export interface UseInspectorResult {
  activeLightId: string | null;
  setActiveLightId(value: string | null): void;
  runtimeProblems: Problem[];
  inspector: InspectorModel;
  snapshot: SceneSnapshot;
  refreshProblems(): void;
}

export function useInspector({ editor }: UseInspectorOptions): UseInspectorResult {
  const snapshot = useEditorSnapshot(editor);
  const [activeLightId, setActiveLightId] = useState<string | null>(() => resolveActiveLightId(editor.getSnapshot(), null));
  const [runtimeProblems, setRuntimeProblems] = useState<Problem[]>(() => editor.getRuntime()?.getProblems() ?? []);

  const refreshProblems = useCallback(() => {
    setRuntimeProblems(editor.getRuntime()?.getProblems() ?? []);
  }, [editor]);

  useEffect(() => {
    setActiveLightId((current) => resolveActiveLightId(snapshot, current));
  }, [snapshot]);

  useEffect(() => {
    let unsubscribeProblems: (() => void) | null = null;

    const unsubscribeRuntime = editor.subscribeRuntime((runtime) => {
      unsubscribeProblems?.();
      unsubscribeProblems = null;
      setRuntimeProblems(runtime?.getProblems() ?? []);
      unsubscribeProblems = runtime?.subscribeProblems((problemSnapshot) => {
        setRuntimeProblems(problemSnapshot.problems);
      }) ?? null;
    });

    return () => {
      unsubscribeRuntime();
      unsubscribeProblems?.();
    };
  }, [editor]);

  const inspector = useMemo(
    () => buildInspectorModel(snapshot, { activeLightId, runtimeProblems }),
    [snapshot, activeLightId, runtimeProblems]
  );

  return {
    activeLightId,
    setActiveLightId,
    runtimeProblems,
    inspector,
    snapshot,
    refreshProblems
  };
}
