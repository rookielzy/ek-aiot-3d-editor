<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
      <select :aria-label="resolvedI18n.t('reactWorkbench.inspector.lights.add.label')" class="ek-inspector-inline-select" :value="addKind" @change="addKind = ($event.target as HTMLSelectElement).value; addLight(addKind as LightKind)">
        <option value="">{{ resolvedI18n.t("reactWorkbench.inspector.lights.add.option") }}</option>
        <option v-for="option in section.addOptions" :key="option.value" :value="option.value">{{ renderOptionLabel(resolvedI18n, option) }}</option>
      </select>
    </header>
    <div v-if="section.lights.length" class="ek-inspector-light-list" role="list">
      <button
        v-for="light in section.lights"
        :key="light.id"
        type="button"
        :class="{ 'is-active': light.active }"
        :aria-pressed="light.active"
        :data-node-id="light.nodeId ?? undefined"
        :data-selected="light.selected ? 'true' : 'false'"
        @click="$emit('update:activeLightId', light.id)"
      >
        <span>{{ light.label }}</span>
        <small>{{ light.kind }}</small>
      </button>
    </div>
    <p v-else class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <p v-if="section.empty && section.reason && section.lights.length > 0" class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <div v-if="section.actions?.length" class="ek-inspector-button-row" :aria-label="resolvedI18n.t('reactWorkbench.inspector.lights.presets.label')">
      <button
        v-for="action in section.actions"
        :key="action.id"
        type="button"
        :disabled="action.disabled"
        :title="action.problem ? renderProblemMessage(resolvedI18n, action.problem) : undefined"
        @click="runAction(action.id)"
      >
        {{ action.labelDescriptor ? resolvedI18n.t(action.labelDescriptor) : action.label }}
      </button>
    </div>
    <p v-if="fieldProblem && !fieldProblem.fieldId" class="ek-inspector-warning" role="alert">{{ renderProblemMessage(resolvedI18n, fieldProblem) }}</p>
    <div v-if="section.diagnostics.length" class="ek-inspector-diagnostics" :aria-label="resolvedI18n.t('reactWorkbench.inspector.lights.diagnostics.label')">
      <p v-for="diagnostic in section.diagnostics" :key="diagnostic.id" :data-severity="diagnostic.severity">
        <strong>{{ diagnostic.titleDescriptor ? resolvedI18n.t(diagnostic.titleDescriptor) : diagnostic.title }}</strong>
        <span v-if="diagnostic.detail">{{ diagnostic.detailDescriptor ? resolvedI18n.t(diagnostic.detailDescriptor) : diagnostic.detail }}</span>
      </p>
    </div>
    <div v-if="section.activeLightId" class="ek-inspector-grid">
      <SceneInspectorFields :fields="section.fields.filter((field) => !field.id.startsWith('shadow.'))"
        :target-key="section.activeLightId" :problem="fieldProblem" :i18n="resolvedI18n" :on-commit="(fieldId, value) => commit(fieldId as LightFieldId, value)" />
      <details v-if="section.fields.some((field) => field.id.startsWith('shadow.'))" class="ek-inspector-fold" open>
        <summary>{{ resolvedI18n.t('reactWorkbench.inspector.sceneFields.shadows') }}</summary>
        <SceneInspectorFields :fields="section.fields.filter((field) => field.id.startsWith('shadow.'))"
          :target-key="section.activeLightId" :problem="fieldProblem" :i18n="resolvedI18n" :on-commit="(fieldId, value) => commit(fieldId as LightFieldId, value)" />
      </details>
      <button class="ek-inspector-danger" type="button" @click="removeActive">{{ resolvedI18n.t("reactWorkbench.inspector.lights.remove.label") }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  createMessageDescriptor,
  type Editor,
  type InspectorCommandProblem,
  type LightFieldId,
  type LightInspectorSection,
  type LightKind,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_INSPECTOR_I18N,
  renderOptionLabel,
  renderProblemMessage,
  renderSectionReason,
  renderSectionTitle,
  type InspectorI18n
} from "./inspector-i18n";

import SceneInspectorFields from "./SceneInspectorFields.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: LightInspectorSection;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
}>();

const addKind = ref("");
const fieldProblem = ref<InspectorCommandProblem | null>(null);
const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);

watch(() => props.section.activeLightId, () => { fieldProblem.value = null; });

function addLight(kind: LightKind | "") {
  if (!kind) {
    return;
  }
  const result = buildAddLightCommand(kind);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (!dispatch.ok) {
      fieldProblem.value = { code: "inspector-light-dispatch-failed", ...lightProblemMessage("reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" };
      return;
    }
    emit("update:activeLightId", Object.keys(dispatch.snapshot.lights).at(-1) ?? null);
  }
  addKind.value = "";
}

function runAction(actionId: string) {
  const action = props.section.actions?.find((candidate) => candidate.id === actionId);
  fieldProblem.value = null;
  if (!action || action.disabled || !action.command) {
    fieldProblem.value = action?.problem ?? { code: "inspector-light-action-unavailable", ...lightProblemMessage("reactWorkbench.inspector.lights.presetUnavailable.message"), severity: "info" };
    return;
  }
  const dispatch = props.editor.dispatch(action.command);
  if (!dispatch.ok) {
    fieldProblem.value = { code: "inspector-light-dispatch-failed", ...lightProblemMessage("reactWorkbench.inspector.lights.presetFailed.message", dispatch.error), severity: "warning" };
  }
}

function commit(fieldId: LightFieldId, value: string): boolean {
  if (!props.section.activeLightId) return false;
  const result = buildUpdateLightCommand(props.editor.getSnapshot(), props.section.activeLightId, fieldId, value);
  if (!result.ok) {
    fieldProblem.value = result.problem;
    return false;
  }
  const dispatch = props.editor.dispatch(result.command);
  fieldProblem.value = dispatch.ok ? null : { code: "inspector-light-dispatch-failed", fieldId, ...lightProblemMessage("reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" };
  return dispatch.ok;
}

function removeActive() {
  if (!props.section.activeLightId) {
    return;
  }
  const result = buildRemoveLightCommand(props.snapshot, props.section.activeLightId);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    fieldProblem.value = dispatch.ok ? null : { code: "inspector-light-dispatch-failed", ...lightProblemMessage("reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" };
  }
}

type LightProblemMessageKey =
  | "reactWorkbench.inspector.lights.editFailed.message"
  | "reactWorkbench.inspector.lights.editFailedDetail.message"
  | "reactWorkbench.inspector.lights.presetUnavailable.message"
  | "reactWorkbench.inspector.lights.presetUnavailableDetail.message"
  | "reactWorkbench.inspector.lights.presetFailed.message"
  | "reactWorkbench.inspector.lights.presetFailedDetail.message";

function lightProblemMessage(key: LightProblemMessageKey, detail?: string) {
  const messageKey = detail ? detailKey(key) : key;
  const message = detail ? resolvedI18n.value.t(messageKey, { detail }) : resolvedI18n.value.t(messageKey);
  return {
    message,
    messageDescriptor: createMessageDescriptor({
      key: messageKey,
      fallback: detail ? `${resolvedI18n.value.t(key)}: {detail}` : message,
      ...(detail ? { values: { detail } } : {})
    })
  };
}

function detailKey(key: LightProblemMessageKey): LightProblemMessageKey {
  if (key === "reactWorkbench.inspector.lights.editFailed.message") {
    return "reactWorkbench.inspector.lights.editFailedDetail.message";
  }
  if (key === "reactWorkbench.inspector.lights.presetUnavailable.message") {
    return "reactWorkbench.inspector.lights.presetUnavailableDetail.message";
  }
  if (key === "reactWorkbench.inspector.lights.presetFailed.message") {
    return "reactWorkbench.inspector.lights.presetFailedDetail.message";
  }
  return key;
}
</script>
