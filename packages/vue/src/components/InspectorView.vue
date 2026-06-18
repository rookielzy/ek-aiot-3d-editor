<template>
  <aside class="ek-inspector" :aria-label="resolvedI18n.t('reactWorkbench.inspector.scene.label')">
    <TransformInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.transform" :i18n="resolvedI18n" />
    <MaterialInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.material" :i18n="resolvedI18n" />
    <EnvironmentInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.environment" :i18n="resolvedI18n" />
    <LightInspector
      :editor="rawEditor"
      :snapshot="snapshot"
      :section="inspector.lights"
      :i18n="resolvedI18n"
      @update:active-light-id="$emit('update:activeLightId', $event)"
    />
    <CameraInspector
      :editor="rawEditor"
      :snapshot="snapshot"
      :section="inspector.cameras"
      :camera="camera"
      :i18n="resolvedI18n"
      @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)"
    />
    <ProblemsPanel :section="inspector.problems" :i18n="resolvedI18n" @replace-asset="onReplaceAsset" />
  </aside>
</template>

<script setup lang="ts">
import { computed, toRaw } from "vue";
import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../composables/use-workbench";
import { DEFAULT_INSPECTOR_I18N, type InspectorI18n } from "./inspector-i18n";
import "./inspector.css";
import TransformInspector from "./TransformInspector.vue";
import MaterialInspector from "./MaterialInspector.vue";
import EnvironmentInspector from "./EnvironmentInspector.vue";
import LightInspector from "./LightInspector.vue";
import CameraInspector from "./CameraInspector.vue";
import ProblemsPanel from "./ProblemsPanel.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  camera?: WorkbenchCameraContext;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
  "update:activeCameraViewId": [value: string | null];
  replaceAsset: [assetId: string, file: File];
}>();

const rawEditor = toRaw(props.editor);
const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);

function onReplaceAsset(assetId: string, file: File): void {
  emit("replaceAsset", assetId, file);
}
</script>
