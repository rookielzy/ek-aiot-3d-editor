import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildInspectorModel,
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
  const [runtimeProblems, setRuntimeProblems] = useState<Problem[]>(() => editor.getRuntime()?.getProblems() ?? []);

  const refreshProblems = useCallback(() => {
    setRuntimeProblems(editor.getRuntime()?.getProblems() ?? []);
  }, [editor]);

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
    () => buildInspectorModel(snapshot, { runtimeProblems }),
    [snapshot, runtimeProblems]
  );
  const activeLightId = inspector.lights.activeLightId;
  const setActiveLightId = useCallback((lightId: string | null) => {
    if (!lightId) {
      const snapshot = editor.getSnapshot();
      const selectedNode = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : undefined;
      if (selectedNode?.kind === "light") {
        editor.dispatch({ type: "select-nodes", mode: "clear" });
      }
      return;
    }

    const target = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "light" && node.lightId === lightId);
    if (target) {
      editor.dispatch({ type: "select-node", nodeId: target.id });
    }
  }, [editor]);

  return {
    activeLightId,
    setActiveLightId,
    runtimeProblems,
    inspector,
    snapshot,
    refreshProblems
  };
}
