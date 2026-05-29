<template>
  <aside class="ek-inspector" aria-label="Scene inspector">
    <TransformInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.transform" />
    <MaterialInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.material" />
    <EnvironmentInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.environment" />
    <LightInspector
      :editor="rawEditor"
      :snapshot="snapshot"
      :section="inspector.lights"
      @update:active-light-id="$emit('update:activeLightId', $event)"
    />
    <ProblemsPanel :section="inspector.problems" @replace-asset="onReplaceAsset" />
  </aside>
</template>

<script setup lang="ts">
import { toRaw } from "vue";
import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import "./inspector.css";
import TransformInspector from "./TransformInspector.vue";
import MaterialInspector from "./MaterialInspector.vue";
import EnvironmentInspector from "./EnvironmentInspector.vue";
import LightInspector from "./LightInspector.vue";
import ProblemsPanel from "./ProblemsPanel.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
  replaceAsset: [assetId: string, file: File];
}>();

const rawEditor = toRaw(props.editor);

function onReplaceAsset(assetId: string, file: File): void {
  emit("replaceAsset", assetId, file);
}
</script>
