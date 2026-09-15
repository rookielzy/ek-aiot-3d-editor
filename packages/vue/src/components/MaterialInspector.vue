<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
    </header>
    <p v-if="section.empty" class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <template v-else>
      <fieldset v-if="section.targets.length > 1" class="ek-material-targets" :aria-label="resolvedI18n.t('reactWorkbench.inspector.material.target.label')">
        <legend>{{ resolvedI18n.t("reactWorkbench.inspector.material.target.legend") }}</legend>
        <div class="ek-material-target-list">
          <label
            v-for="target in section.targets"
            :key="target.key"
            class="ek-material-target-option"
            :data-unresolved="target.unresolved ? 'true' : undefined"
          >
            <input
              v-model="activeTargetKey"
              type="radio"
              :name="`${id}-material-target`"
              :value="target.key"
              :disabled="!target.canSelect"
              @change="fieldProblem = null"
            />
            <span class="ek-material-target-option__body">
              <span class="ek-material-target-option__label">{{ target.kind === 'object' ? resolvedI18n.t('reactWorkbench.inspector.material.target.objectLabel')
                : target.unresolved && !target.importedNodeId ? resolvedI18n.t('reactWorkbench.inspector.material.target.staleLabel', { slot: target.slotId ?? '' }) : target.label }}</span>
              <span class="ek-material-target-option__meta">{{ describeTarget(target) }}</span>
              <span v-if="target.disabledReason" class="ek-material-target-option__reason">{{ target.kind === 'material-slot' && target.unresolved && !target.canCreateAssignment && !target.canEditExistingAssignment
                ? resolvedI18n.t('reactWorkbench.inspector.material.target.cannotCreate') : target.disabledReason }}</span>
            </span>
          </label>
        </div>
      </fieldset>
      <p v-if="activeTarget?.unresolved" class="ek-inspector-warning" role="status">{{ resolvedI18n.t("reactWorkbench.inspector.material.target.unresolvedWarning") }}</p>
      <div class="ek-inspector-grid ek-material-fields">
        <label v-for="field in fields" :key="field.id" class="ek-inspector-field" :class="{ 'ek-inspector-field--checkbox': field.kind === 'checkbox' }">
          <span>{{ renderFieldLabel(resolvedI18n, field) }}</span>
          <InspectorNumberInput
            v-if="field.kind === 'number'"
            :key="`${effectiveTargetKey}:${field.id}`"
            :value="Number(field.value)"
            :disabled="field.disabled"
            :min="field.min"
            :max="field.max"
            :step="field.step ?? 0.01"
            :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
            :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
            :on-commit="(value) => commit(field.id as MaterialFieldId, value.trim() === '' ? 'NaN' : value)"
          />
          <input
            v-else-if="field.kind === 'color'"
            :key="`${effectiveTargetKey}:${field.id}:${String(field.value)}`"
            :value="field.value"
            :disabled="field.disabled"
            type="color"
            :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
            :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
            @change="commit(field.id as MaterialFieldId, ($event.target as HTMLInputElement).value)"
          />
          <input
            v-else-if="field.kind === 'checkbox'"
            :key="`${effectiveTargetKey}:${field.id}:${String(field.value)}`"
            :checked="Boolean(field.value)"
            :disabled="field.disabled"
            type="checkbox"
            :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
            :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
            @change="commit(field.id as MaterialFieldId, ($event.target as HTMLInputElement).checked)"
          />
          <select
            v-else
            :key="`${effectiveTargetKey}:${field.id}:${String(field.value)}`"
            :value="String(field.value)"
            :disabled="field.disabled"
            :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
            :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
            @change="commit(field.id as MaterialFieldId, ($event.target as HTMLSelectElement).value)"
          >
            <option v-if="field.kind === 'asset'" value="">{{ resolvedI18n.t("reactWorkbench.inspector.field.asset.none") }}</option>
            <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ renderOptionLabel(resolvedI18n, option) }}</option>
          </select>
          <small v-if="fieldProblem?.fieldId === field.id" :id="problemId(field.id)" class="ek-inspector-field-problem" role="alert">{{ renderProblemMessage(resolvedI18n, fieldProblem) }}</small>
        </label>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  buildMaterialFieldsForTarget,
  buildSetMaterialCommand,
  createMessageDescriptor,
  type Editor,
  type InspectorCommandProblem,
  type MaterialFieldId,
  type MaterialInspectorSection,
  type MaterialInspectorTarget,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_INSPECTOR_I18N,
  renderFieldLabel,
  renderOptionLabel,
  renderProblemMessage,
  renderSectionReason,
  renderSectionTitle,
  type InspectorI18n
} from "./inspector-i18n";

import InspectorNumberInput from "./InspectorNumberInput.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: MaterialInspectorSection;
  i18n?: InspectorI18n;
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const id = useId();
const activeTargetKey = ref<string | null>(props.section.activeTargetKey);
const fieldProblem = ref<InspectorCommandProblem | null>(null);

const selectableTargets = computed(() => props.section.targets.filter((target) => target.canSelect));
const defaultTargetKey = computed(() => props.section.activeTargetKey ?? selectableTargets.value[0]?.key ?? null);
const activeTarget = computed(() =>
  props.section.targets.find((target) => target.key === activeTargetKey.value && target.canSelect) ??
  props.section.targets.find((target) => target.key === defaultTargetKey.value && target.canSelect) ??
  selectableTargets.value[0] ??
  null
);
const effectiveTargetKey = computed(() => activeTarget.value?.key ?? defaultTargetKey.value ?? "none");
const fields = computed(() => activeTarget.value
  ? buildMaterialFieldsForTarget(props.snapshot, activeTarget.value, props.section.empty || !activeTarget.value.canSelect)
  : props.section.fields);
const targetsSignature = computed(() => props.section.targets
  .map((target) => `${target.key}:${target.canSelect}:${target.assignmentId}:${target.materialId}:${target.unresolved}`)
  .join("|"));
const selectionSignature = computed(() => props.section.targets
  .filter((target) => target.selected)
  .map((target) => `${target.ownerObjectId}:${target.importedNodeId ?? ""}:${target.slotId ?? ""}`)
  .join("|"));
const targetContextSignature = computed(() =>
  `${props.section.activeTargetKey ?? ""}::${selectionSignature.value}::${props.section.targets.map((target) => target.key).join("|")}`
);
let previousSelectionSignature = targetContextSignature.value;
let previousDefaultTargetKey = defaultTargetKey.value;

watch([defaultTargetKey, targetsSignature, targetContextSignature], () => {
  const selectionChanged = previousSelectionSignature !== targetContextSignature.value;
  const previousDefault = previousDefaultTargetKey;
  const defaultChanged = previousDefault !== defaultTargetKey.value;
  previousSelectionSignature = targetContextSignature.value;
  previousDefaultTargetKey = defaultTargetKey.value;

  if (selectionChanged || (defaultChanged && activeTargetKey.value === previousDefault)) {
    activeTargetKey.value = defaultTargetKey.value;
  } else if (!activeTargetKey.value || !props.section.targets.some((target) => target.key === activeTargetKey.value && target.canSelect)) {
    activeTargetKey.value = defaultTargetKey.value;
  }
  fieldProblem.value = null;
});

function commit(fieldId: MaterialFieldId, value: unknown): boolean {
  if (value === "" && !fieldId.startsWith("textures.")) {
    return false;
  }
  fieldProblem.value = null;
  const result = buildSetMaterialCommand(props.editor.getSnapshot(), fieldId, value, activeTarget.value);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (!dispatch.ok) {
      const messageDescriptor = createMessageDescriptor(dispatch.error ? {
        key: "reactWorkbench.inspector.material.editFailedDetail.message",
        fallback: "Material edit failed: {detail}", values: { detail: dispatch.error }
      } : { key: "reactWorkbench.inspector.material.editFailed.message", fallback: "Material edit failed." });
      fieldProblem.value = { code: "inspector-material-dispatch-failed", fieldId, message: resolvedI18n.value.t(messageDescriptor), messageDescriptor, severity: "warning" };
    }
    return dispatch.ok;
  } else {
    fieldProblem.value = result.problem;
  }
  return result.ok;
}

function describeTarget(target: MaterialInspectorTarget): string {
  return [
    target.kind === "object"
      ? resolvedI18n.value.t("reactWorkbench.inspector.material.target.objectOverride")
      : target.hasOverride
        ? resolvedI18n.value.t("reactWorkbench.inspector.material.target.slotOverride")
        : resolvedI18n.value.t("reactWorkbench.inspector.material.target.noOverride"),
    target.unresolved ? resolvedI18n.value.t("reactWorkbench.inspector.material.target.unresolved") : null
  ].filter(Boolean).join(" · ");
}

function problemId(fieldId: string): string {
  return `${id}-material-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}
</script>
