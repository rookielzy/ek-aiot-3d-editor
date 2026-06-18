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
    <div class="ek-inspector-grid">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ renderFieldLabel(resolvedI18n, field) }}</span>
        <input
          v-if="field.kind === 'number'"
          :value="field.value"
          :disabled="field.disabled"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 0.01"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @blur="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input
          v-else-if="field.kind === 'color'"
          :value="field.value"
          :disabled="field.disabled"
          type="color"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
        />
        <select
          v-else
          :value="String(field.value)"
          :disabled="field.disabled"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="field.kind === 'asset'" value="">{{ resolvedI18n.t("reactWorkbench.inspector.field.asset.none") }}</option>
          <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ renderOptionLabel(resolvedI18n, option) }}</option>
        </select>
        <small
          v-if="activeProblem(field)"
          :id="problemId(field.id)"
          class="ek-inspector-field-problem"
          :role="fieldProblem?.fieldId === field.id ? 'alert' : undefined"
        >
          {{ renderActiveProblem(field) }}
        </small>
      </label>
    </div>
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
  type InspectorFieldDescriptor,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_INSPECTOR_I18N,
  renderFieldLabel,
  renderOptionLabel,
  renderProblemMessage,
  renderSectionTitle,
  type InspectorI18n
} from "./inspector-i18n";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const fieldProblem = ref<InspectorCommandProblem | null>(null);

function commit(fieldId: EnvironmentFieldId, value: string) {
  if (value === "" && fieldId.endsWith("assetId")) {
    return;
  }
  fieldProblem.value = null;
  const result = buildSetEnvironmentCommand(props.snapshot, fieldId, value);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (!dispatch.ok) {
      fieldProblem.value = { code: "inspector-environment-dispatch-failed", fieldId, ...environmentProblemMessage("reactWorkbench.inspector.environment.editFailed.message", dispatch.error), severity: "warning" };
    }
  } else {
    fieldProblem.value = result.problem;
  }
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

function activeProblem(field: InspectorFieldDescriptor): InspectorCommandProblem | undefined {
  return fieldProblem.value?.fieldId === field.id ? fieldProblem.value : field.problem;
}

function renderActiveProblem(field: InspectorFieldDescriptor): string {
  const problem = activeProblem(field);
  return problem ? renderProblemMessage(resolvedI18n.value, problem) : "";
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}

function problemId(fieldId: string): string {
  return `ek-environment-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
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
