<template>
  <fieldset class="ek-workbench__request-property" :aria-label="t('dataSources.mapping.property.group', { index })">
    <legend>{{ t("dataSources.mapping.property.group", { index }) }}</legend>
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.mapping.property.key", { index }) }}</span>
      <input
        type="text"
        :aria-label="t('dataSources.mapping.property.key', { index })"
        :value="property.key"
        @input="patch({ key: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.mapping.property.label", { index }) }}</span>
      <input
        type="text"
        :aria-label="t('dataSources.mapping.property.label', { index })"
        :value="property.label"
        @input="patch({ label: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <div class="ek-workbench__query-inline">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.type", { index }) }}</span>
        <select
          :aria-label="t('dataSources.mapping.property.type', { index })"
          :value="property.type"
          @change="emit('changeType', ($event.target as HTMLSelectElement).value as QueryPropertyForm['type'])"
        >
          <option v-for="type in propertyTypes" :key="type" :value="type">{{ t(PROPERTY_TYPE_MESSAGE_KEYS[type]) }}</option>
        </select>
      </label>
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.transform", { index }) }}</span>
        <select
          :aria-label="t('dataSources.mapping.property.transform', { index })"
          :value="property.transformKind"
          @change="emit('changeTransform', ($event.target as HTMLSelectElement).value as QueryPropertyForm['transformKind'])"
        >
          <option v-for="kind in transformKinds" :key="kind" :value="kind">{{ t(TRANSFORM_MESSAGE_KEYS[kind]) }}</option>
        </select>
      </label>
    </div>
    <DataQueryPathField
      :context="context"
      :label="t('dataSources.mapping.property.source', { index })"
      :value="property.source"
      :list-id="suggestionListId"
      @update="patch({ source: $event })"
    />
    <div v-if="property.transformKind === 'scale'" class="ek-workbench__query-inline">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.factor", { index }) }}</span>
        <input
          type="number"
          step="any"
          inputmode="decimal"
          :aria-label="t('dataSources.mapping.property.factor', { index })"
          :value="property.factor"
          @input="patch({ factor: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.offset", { index }) }}</span>
        <input
          type="number"
          step="any"
          inputmode="decimal"
          :aria-label="t('dataSources.mapping.property.offset', { index })"
          :value="property.offset"
          @input="patch({ offset: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>
    <fieldset v-if="property.transformKind === 'map'" class="ek-workbench__query-map">
      <legend>{{ t("dataSources.mapping.map.entries") }}</legend>
      <div v-for="(entry, entryIndex) in property.mapEntries" :key="entry.id" class="ek-workbench__query-map-entry">
        <input
          type="text"
          :aria-label="t('dataSources.mapping.map.from', { index: entryIndex + 1 })"
          :placeholder="t('dataSources.mapping.mapValueError')"
          :value="entry.from"
          @input="emit('updateEntry', entry.id, { from: ($event.target as HTMLInputElement).value })"
        />
        <input
          type="text"
          :aria-label="t('dataSources.mapping.map.to', { index: entryIndex + 1 })"
          :value="entry.to"
          @input="emit('updateEntry', entry.id, { to: ($event.target as HTMLInputElement).value })"
        />
        <button type="button" :aria-label="t('dataSources.mapping.map.remove', { index: entryIndex + 1 })" @click="emit('removeEntry', entry.id)">
          {{ t("dataSources.mapping.property.removeLabel") }}
        </button>
      </div>
      <button type="button" @click="emit('addEntry')">{{ t("dataSources.mapping.map.add") }}</button>
    </fieldset>
    <div class="ek-workbench__query-inline">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.unit", { index }) }}</span>
        <input
          type="text"
          :aria-label="t('dataSources.mapping.property.unit', { index })"
          :value="property.unit"
          @input="patch({ unit: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="ek-workbench__request-check">
        <input
          type="checkbox"
          :aria-label="t('dataSources.mapping.property.nullable', { index })"
          :checked="property.nullable"
          @change="patch({ nullable: ($event.target as HTMLInputElement).checked })"
        />
        <span>{{ t("dataSources.mapping.property.nullable", { index }) }}</span>
      </label>
    </div>
    <div v-if="property.type === 'number'" class="ek-workbench__query-inline">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.rangeMin", { index }) }}</span>
        <input
          type="number"
          step="any"
          inputmode="decimal"
          :aria-label="t('dataSources.mapping.property.rangeMin', { index })"
          :value="property.rangeMin"
          @input="patch({ rangeMin: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.mapping.property.rangeMax", { index }) }}</span>
        <input
          type="number"
          step="any"
          inputmode="decimal"
          :aria-label="t('dataSources.mapping.property.rangeMax', { index })"
          :value="property.rangeMax"
          @input="patch({ rangeMax: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>
    <label class="ek-workbench__field">
      <span>{{ t("dataSources.mapping.property.allowed", { index }) }}</span>
      <input
        type="text"
        :aria-label="t('dataSources.mapping.property.allowed', { index })"
        :placeholder="t('dataSources.mapping.property.allowedHint')"
        :value="property.allowedText"
        @input="patch({ allowedText: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <button type="button" :aria-label="t('dataSources.mapping.property.remove', { index })" @click="emit('remove')">
      {{ t("dataSources.mapping.property.removeLabel") }}
    </button>
    <p v-if="usage" class="ek-workbench__query-usage" role="status">
      {{ t("dataSources.queryEditor.propertyUsage", { objects: usage.objects.map((object) => object.objectName).join(", ") }) }}
    </p>
  </fieldset>
</template>

<script setup lang="ts">
import type { DataQueryPropertyUsage, QueryMapEntryForm, QueryPropertyForm } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import {
  PROPERTY_TYPE_MESSAGE_KEYS,
  TRANSFORM_MESSAGE_KEYS
} from "./data-query-ui";
import DataQueryPathField from "./DataQueryPathField.vue";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  property: QueryPropertyForm;
  index: number;
  suggestionListId: string;
  usage: DataQueryPropertyUsage | null;
}>();

const emit = defineEmits<{
  patch: [patch: Partial<QueryPropertyForm>];
  changeType: [type: QueryPropertyForm["type"]];
  changeTransform: [kind: QueryPropertyForm["transformKind"]];
  updateEntry: [entryId: string, patch: Partial<QueryMapEntryForm>];
  addEntry: [];
  removeEntry: [entryId: string];
  remove: [];
}>();

const propertyTypes: QueryPropertyForm["type"][] = ["number", "string", "boolean"];
const transformKinds: QueryPropertyForm["transformKind"][] = ["raw", "number", "scale", "map"];
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);

function patch(next: Partial<QueryPropertyForm>): void {
  emit("patch", next);
}
</script>
