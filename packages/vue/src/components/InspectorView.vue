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
    <ProblemsPanel :section="inspector.problems" />
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

defineEmits<{
  "update:activeLightId": [value: string | null];
}>();

const rawEditor = toRaw(props.editor);
</script>
