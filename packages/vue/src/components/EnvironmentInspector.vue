<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
    </header>
    <div v-if="section.actions?.length" class="ek-inspector-button-row" :aria-label="resolvedI18n.t('reactWorkbench.inspector.environment.presets.label')">
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
    <InspectorTabs secondary :tabs="tabs" :label="resolvedI18n.t('reactWorkbench.inspector.groups.environment')">
      <template v-for="tab in tabs" :key="tab.id" #[tab.id]>
        <SceneInspectorFields @reset-field="(fieldId) => { if (fieldProblem?.fieldId === fieldId) fieldProblem = null; }" :fields="section.fields.filter((field) => tab.id === 'lighting' ? !field.id.startsWith('background.') : field.id.startsWith('background.'))"
          :problem="fieldProblem" :i18n="resolvedI18n" :on-commit="(fieldId, value) => commit(fieldId as EnvironmentFieldId, value)" />
      </template>
    </InspectorTabs>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  buildSetEnvironmentCommand,
  createMessageDescriptor,
  type Editor,
  type EnvironmentFieldId,
  type InspectorCommandProblem,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_INSPECTOR_I18N,
  renderProblemMessage,
  renderSectionTitle,
  type InspectorI18n
} from "./inspector-i18n";

import InspectorTabs from "./InspectorTabs.vue";
import SceneInspectorFields from "./SceneInspectorFields.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const tabs = computed(() => (["lighting", "background"] as const).map((id) => ({
  id, label: resolvedI18n.value.t(`reactWorkbench.inspector.sceneFields.${id}`)
})));
const fieldProblem = ref<InspectorCommandProblem | null>(null);

function commit(fieldId: EnvironmentFieldId, value: string): boolean {
  const clearSource = value === "" && (fieldId === "lighting.source.assetId" || fieldId === "background.source.assetId");
  const commandField = clearSource ? fieldId === "lighting.source.assetId" ? "lighting.source.kind" : "background.source.kind" : fieldId;
  fieldProblem.value = null;
  const result = buildSetEnvironmentCommand(props.editor.getSnapshot(), commandField, clearSource ? "none" : value);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (!dispatch.ok) {
      fieldProblem.value = { code: "inspector-environment-dispatch-failed", fieldId, ...environmentProblemMessage("reactWorkbench.inspector.environment.editFailed.message", dispatch.error), severity: "warning" };
    }
    return dispatch.ok;
  } else {
    fieldProblem.value = result.problem;
  }
  return false;
}

function runAction(actionId: string) {
  const action = props.section.actions?.find((candidate) => candidate.id === actionId);
  fieldProblem.value = null;
  if (!action || action.disabled || !action.command) {
    fieldProblem.value = action?.problem ?? { code: "inspector-environment-action-unavailable", ...environmentProblemMessage("reactWorkbench.inspector.environment.presetUnavailable.message"), severity: "info" };
    return;
  }
  const dispatch = props.editor.dispatch(action.command);
  if (!dispatch.ok) {
    fieldProblem.value = { code: "inspector-environment-dispatch-failed", ...environmentProblemMessage("reactWorkbench.inspector.environment.presetFailed.message", dispatch.error), severity: "warning" };
  }
}

type EnvironmentProblemMessageKey =
  | "reactWorkbench.inspector.environment.editFailed.message"
  | "reactWorkbench.inspector.environment.editFailedDetail.message"
  | "reactWorkbench.inspector.environment.presetUnavailable.message"
  | "reactWorkbench.inspector.environment.presetUnavailableDetail.message"
  | "reactWorkbench.inspector.environment.presetFailed.message"
  | "reactWorkbench.inspector.environment.presetFailedDetail.message";

function environmentProblemMessage(key: EnvironmentProblemMessageKey, detail?: string) {
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

function detailKey(key: EnvironmentProblemMessageKey): EnvironmentProblemMessageKey {
  if (key === "reactWorkbench.inspector.environment.editFailed.message") {
    return "reactWorkbench.inspector.environment.editFailedDetail.message";
  }
  if (key === "reactWorkbench.inspector.environment.presetUnavailable.message") {
    return "reactWorkbench.inspector.environment.presetUnavailableDetail.message";
  }
  if (key === "reactWorkbench.inspector.environment.presetFailed.message") {
    return "reactWorkbench.inspector.environment.presetFailedDetail.message";
  }
  return key;
}
</script>
