import { computed, getCurrentInstance, onBeforeUnmount, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref, type ShallowRef } from "vue";
import {
  buildInspectorModel,
  resolveActiveLightId,
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
  const activeLightId = ref<string | null>(resolveActiveLightId(snapshot.value, null));
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

  watch(snapshot, (nextSnapshot) => {
    activeLightId.value = resolveActiveLightId(nextSnapshot, activeLightId.value);
  });

  const inspector = computed(() =>
    buildInspectorModel(snapshot.value, {
      activeLightId: activeLightId.value,
      runtimeProblems: runtimeProblems.value
    })
  );

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
