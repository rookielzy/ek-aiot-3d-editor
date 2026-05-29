<template>
  <aside class="ek-inspector" aria-label="Scene inspector">
    <TransformInspector :editor="rawEditor" :snapshot="currentSnapshot" :section="inspector.transform" />
    <MaterialInspector :editor="rawEditor" :snapshot="currentSnapshot" :section="inspector.material" />
    <EnvironmentInspector :editor="rawEditor" :snapshot="currentSnapshot" :section="inspector.environment" />
    <LightInspector
      :editor="rawEditor"
      :snapshot="currentSnapshot"
      :section="inspector.lights"
      @update:active-light-id="activeLightId = $event"
    />
    <ProblemsPanel :section="inspector.problems" />
  </aside>
</template>

<script setup lang="ts">
import { toRaw, toRef } from "vue";
import type { Editor, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import { useInspector } from "../composables/use-inspector";
import "./inspector.css";
import TransformInspector from "./TransformInspector.vue";
import MaterialInspector from "./MaterialInspector.vue";
import EnvironmentInspector from "./EnvironmentInspector.vue";
import LightInspector from "./LightInspector.vue";
import ProblemsPanel from "./ProblemsPanel.vue";

const props = defineProps<{
  editor: Editor;
  snapshot?: SceneSnapshot;
}>();

const rawEditor = toRaw(props.editor);
const snapshotProp = toRef(props, "snapshot");
const { inspector, activeLightId, snapshot: currentSnapshot } = useInspector({ editor: rawEditor, snapshot: snapshotProp });
</script>
