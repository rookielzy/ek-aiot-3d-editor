<template>
  <section class="ek-inspector-section">
    <template v-if="motion">
      <header class="ek-inspector-section__header"><h2>{{ i18n.t("inspector.motion.spin") }}</h2></header>
      <div class="ek-inspector-grid ek-scene-fields">
        <label v-for="field in fields" :key="field.id" class="ek-inspector-field">
          <span>{{ renderFieldLabel(i18n, field) }}</span>
          <InspectorFieldControl :field="field" :i18n="i18n" :invalid="invalidField === field.id"
            :description-id="invalidField === field.id ? problemId : undefined"
            :on-commit="(value) => commit(field.id, value)" @cancel="invalidField = null" />
          <small v-if="invalidField === field.id" :id="problemId" class="ek-inspector-field-problem" role="alert">{{ i18n.t("inspector.motion.invalidSpeed") }}</small>
        </label>
      </div>
      <div class="ek-inspector-button-row">
        <button type="button" data-ek-discard-draft :disabled="!playing && state !== 'ready'"
          @click="playing ? runtime?.stopNodeMotionPreview?.() : runtime?.startNodeMotionPreview?.(nodeId)">
          {{ i18n.t(playing ? "inspector.motion.stop" : "inspector.motion.preview") }}
        </button>
        <button type="button" data-ek-discard-draft :disabled="playing" @click="save(null)">{{ i18n.t("inspector.motion.remove") }}</button>
      </div>
      <p v-if="state !== 'ready'" class="ek-inspector-warning" role="status">{{ i18n.t(`inspector.motion.${state}`) }}</p>
    </template>
    <div v-else class="ek-inspector-button-row">
      <button type="button" @click="save(DEFAULT_NODE_MOTION)">{{ i18n.t("inspector.motion.add") }}</button>
    </div>
    <p v-if="editFailed" class="ek-inspector-field-problem" role="alert">{{ i18n.t("inspector.motion.editFailed") }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  buildNodeMotionFields, DEFAULT_NODE_MOTION, updateNodeMotionField,
  type Editor, type EditorRuntime, type NodeMotion, type NodeMotionFieldId, type NodeMotionPreviewState
} from "@ek-aiot/3d-editor-core";
import InspectorFieldControl from "./InspectorFieldControl.vue";
import { renderFieldLabel, type InspectorI18n } from "./inspector-i18n";

const props = defineProps<{
  editor: Editor;
  runtime: EditorRuntime | null;
  nodeId: string;
  motion?: NodeMotion;
  state: NodeMotionPreviewState;
  i18n: InspectorI18n;
}>();
const problemId = useId();
const invalidField = ref<NodeMotionFieldId | null>(null);
const editFailed = ref(false);
const playing = computed(() => props.state === "playing");
const fields = computed(() => props.motion ? buildNodeMotionFields(props.motion, props.state) : []);
watch(() => props.runtime, (runtime, _previous, onCleanup) => {
  onCleanup(() => runtime?.stopNodeMotionPreview?.());
}, { immediate: true });

function save(next: NodeMotion | null) {
  const result = props.editor.dispatch({ type: "set-node-motion", nodeId: props.nodeId, motion: next });
  if (result.ok) invalidField.value = null;
  editFailed.value = !result.ok;
  return result.ok;
}

function commit(field: NodeMotionFieldId, input: string) {
  const current = props.editor.getSnapshot().nodes[props.nodeId];
  if (!current || !("motion" in current) || !current.motion) return false;
  const next = updateNodeMotionField(current.motion, field, input);
  invalidField.value = next ? null : field;
  return next !== null && save(next);
}
</script>
