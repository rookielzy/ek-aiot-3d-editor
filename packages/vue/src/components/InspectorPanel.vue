<template>
  <InspectorView
    :editor="rawEditor"
    :snapshot="currentSnapshot"
    :inspector="inspector"
    :camera="camera"
    @update:active-light-id="activeLightId = $event"
    @update:active-camera-view-id="activeCameraViewId = $event"
  />
</template>

<script setup lang="ts">
import { computed, toRaw, toRef } from "vue";
import type { AuthoredCameraView, AuthoredCameraViewInput, Editor, RuntimeCameraFrameOptions, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../composables/use-workbench";
import { useInspector } from "../composables/use-inspector";
import InspectorView from "./InspectorView.vue";

const props = defineProps<{
  editor: Editor;
  snapshot?: SceneSnapshot;
}>();

const rawEditor = toRaw(props.editor);
const snapshotProp = toRef(props, "snapshot");
const { inspector, activeLightId, activeCameraViewId, snapshot: currentSnapshot } = useInspector({ editor: rawEditor, snapshot: snapshotProp });
const camera = computed<WorkbenchCameraContext>(() => createInspectorCameraContext(rawEditor));

function createInspectorCameraContext(editor: Editor): WorkbenchCameraContext {
  return {
    ready: editor.getRuntime() !== null,
    reset() {
      editor.getRuntime()?.resetCamera();
    },
    frameSelected(options?: RuntimeCameraFrameOptions) {
      return editor.getRuntime()?.frameSelected(options) ?? false;
    },
    frameAll(options?: RuntimeCameraFrameOptions) {
      return editor.getRuntime()?.frameAll(options) ?? false;
    },
    capture(input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}) {
      const result = editor.getRuntime()?.captureCameraView(input);
      return result?.ok ? result.view : null;
    },
    apply(view: AuthoredCameraView) {
      const runtime = editor.getRuntime();
      if (!runtime) {
        return false;
      }
      runtime.applyCameraView(view);
      return true;
    }
  };
}
</script>
