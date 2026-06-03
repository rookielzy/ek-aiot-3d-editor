import { computed, getCurrentInstance, onBeforeUnmount, shallowRef, toRaw, type ComputedRef, type Ref, type ShallowRef } from "vue";
import {
  buildInspectorModel,
  type Editor,
  type InspectorModel,
  type Problem,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

export interface UseInspectorOptions {
  editor: Editor;
  snapshot?: ShallowRef<SceneSnapshot | undefined> | Ref<SceneSnapshot | undefined>;
}

export interface UseInspectorResult {
  activeLightId: Ref<string | null>;
  snapshot: ComputedRef<SceneSnapshot>;
  runtimeProblems: ShallowRef<Problem[]>;
  inspector: ComputedRef<InspectorModel>;
  refreshProblems(): void;
  dispose(): void;
}

export function useInspector(options: UseInspectorOptions): UseInspectorResult {
  const editor = toRaw(options.editor);
  const localSnapshot = shallowRef(editor.getSnapshot());
  const snapshot = computed(() => options.snapshot?.value ?? localSnapshot.value);
  const runtimeProblems = shallowRef<Problem[]>(editor.getRuntime()?.getProblems() ?? []);
  let unsubscribeSnapshot: (() => void) | null = editor.subscribe((nextSnapshot) => {
    localSnapshot.value = nextSnapshot;
  });
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeProblems: (() => void) | null = null;

  function subscribeRuntimeProblems(): void {
    unsubscribeProblems?.();
    unsubscribeProblems = null;
    const runtime = editor.getRuntime();
    runtimeProblems.value = runtime?.getProblems() ?? [];
    if (runtime?.subscribeProblems) {
      unsubscribeProblems = runtime.subscribeProblems((problemSnapshot) => {
        runtimeProblems.value = problemSnapshot.problems;
      });
    }
  }

  unsubscribeRuntime = editor.subscribeRuntime(() => {
    subscribeRuntimeProblems();
  });

  const inspector = computed(() =>
    buildInspectorModel(snapshot.value, {
      runtimeProblems: runtimeProblems.value
    })
  );
  const activeLightId = computed({
    get: () => inspector.value.lights.activeLightId,
    set: setActiveLightId
  });

  function setActiveLightId(lightId: string | null): void {
    if (!lightId) {
      const selectedNode = snapshot.value.selection.nodeId ? snapshot.value.nodes[snapshot.value.selection.nodeId] : undefined;
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
  }

  function dispose(): void {
    unsubscribeSnapshot?.();
    unsubscribeSnapshot = null;
    unsubscribeRuntime?.();
    unsubscribeRuntime = null;
    unsubscribeProblems?.();
    unsubscribeProblems = null;
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose);
  }

  return {
    activeLightId,
    snapshot,
    runtimeProblems,
    inspector,
    refreshProblems: subscribeRuntimeProblems,
    dispose
  };
}
