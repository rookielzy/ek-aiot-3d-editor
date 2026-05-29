<template>
  <InspectorView
    :editor="rawEditor"
    :snapshot="currentSnapshot"
    :inspector="inspector"
    @update:active-light-id="activeLightId = $event"
  />
</template>

<script setup lang="ts">
import { toRaw, toRef } from "vue";
import type { Editor, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import { useInspector } from "../composables/use-inspector";
import InspectorView from "./InspectorView.vue";

const props = defineProps<{
  editor: Editor;
  snapshot?: SceneSnapshot;
}>();

const rawEditor = toRaw(props.editor);
const snapshotProp = toRef(props, "snapshot");
const { inspector, activeLightId, snapshot: currentSnapshot } = useInspector({ editor: rawEditor, snapshot: snapshotProp });
</script>
