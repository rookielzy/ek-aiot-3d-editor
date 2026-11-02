<template>
  <div class="ek-workbench__request-parameter" role="group" :aria-label="t('dataSources.request.parameter.group', { index })">
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.request.parameter.name", { index }) }}</span>
      <input
        type="text"
        :aria-label="t('dataSources.request.parameter.name', { index })"
        :value="parameter.name"
        @input="patch({ name: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.request.parameter.type", { index }) }}</span>
      <select
        :aria-label="t('dataSources.request.parameter.type', { index })"
        :value="parameter.type"
        @change="changeType(($event.target as HTMLSelectElement).value as DataParameterType)"
      >
        <option v-for="type in parameterTypes" :key="type" :value="type">{{ t(PARAMETER_TYPE_MESSAGE_KEYS[type]) }}</option>
      </select>
    </label>
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.request.parameter.location", { index }) }}</span>
      <select
        :aria-label="t('dataSources.request.parameter.location', { index })"
        :value="parameter.location"
        @change="patch({ location: ($event.target as HTMLSelectElement).value as DataParameterLocationInput })"
      >
        <option value="auto">{{ t("dataSources.request.parameter.location.auto") }}</option>
        <option value="path">{{ t("dataSources.request.parameter.location.path") }}</option>
        <option value="query">{{ t("dataSources.request.parameter.location.query") }}</option>
        <option value="body">{{ t("dataSources.request.parameter.location.body") }}</option>
      </select>
    </label>
    <div class="ek-workbench__request-parameter-value">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.request.parameter.label.default") }}</span>
        <DataParameterValueInput
          :id="`${parameter.id}-default`"
          :type="parameter.type"
          :value="parameter.defaultText"
          :disabled="!parameter.useDefault"
          :label="t('dataSources.request.parameter.default', { index })"
          :true-label="t('dataSources.request.boolean.true')"
          :false-label="t('dataSources.request.boolean.false')"
          @change="patch({ defaultText: $event })"
        />
      </label>
      <label class="ek-workbench__request-check">
        <input
          type="checkbox"
          :aria-label="t('dataSources.request.parameter.useDefault', { index })"
          :checked="parameter.useDefault"
          @change="patch({ useDefault: ($event.target as HTMLInputElement).checked })"
        />
        <span>{{ t("dataSources.request.parameter.useDefault", { index }) }}</span>
      </label>
    </div>
    <div class="ek-workbench__request-parameter-value">
      <label class="ek-workbench__request-check">
        <input
          type="checkbox"
          :aria-label="t('dataSources.request.parameter.override', { index })"
          :checked="parameter.override"
          @change="toggleOverride"
        />
        <span>{{ t("dataSources.request.parameter.label.override") }}</span>
      </label>
      <label v-if="parameter.override" class="ek-workbench__field">
        <span>{{ t("dataSources.request.parameter.testValue", { index }) }}</span>
        <DataParameterValueInput
          :id="`${parameter.id}-override`"
          :type="parameter.type"
          :value="parameter.overrideText"
          :disabled="false"
          :label="t('dataSources.request.parameter.testValue', { index })"
          :true-label="t('dataSources.request.boolean.true')"
          :false-label="t('dataSources.request.boolean.false')"
          @change="patch({ overrideText: $event })"
        />
      </label>
    </div>
    <button type="button" :aria-label="t('dataSources.request.parameter.remove', { index })" @click="emit('remove')">
      {{ t("dataSources.request.parameter.label.remove") }}
    </button>
    <p v-if="usage" class="ek-workbench__query-usage" role="status">
      {{ t("dataSources.queryEditor.parameterUsage", { objects: usage.objects.map((object) => object.objectName).join(", ") }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import {
  PARAMETER_TYPE_MESSAGE_KEYS,
  type DataParameterLocationInput,
  type DataParameterType,
  type DataQueryParameterUsage,
  type QueryParameterForm
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import DataParameterValueInput from "./DataParameterValueInput.vue";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  parameter: QueryParameterForm;
  index: number;
  usage: DataQueryParameterUsage | null;
}>();

const emit = defineEmits<{
  patch: [patch: Partial<QueryParameterForm>];
  changeType: [type: DataParameterType];
  remove: [];
}>();

const parameterTypes: DataParameterType[] = ["string", "number", "boolean"];
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);

function patch(next: Partial<QueryParameterForm>): void {
  emit("patch", next);
}

function changeType(type: DataParameterType): void {
  emit("changeType", type);
}

function toggleOverride(event: Event): void {
  const override = (event.target as HTMLInputElement).checked;
  patch({
    override,
    ...(override && props.parameter.type === "boolean" && !props.parameter.overrideText
      ? { overrideText: "false" }
      : {})
  });
}
</script>
