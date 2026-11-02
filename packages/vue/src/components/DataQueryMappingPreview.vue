<template>
  <div class="ek-workbench__mapping-preview">
    <p v-if="mappingBuildProblems.length === 0 && !mapping">
      {{ t("dataSources.preview.invalidMapping") }}
    </p>
    <template v-else>
      <p v-if="!preview">{{ t("dataSources.preview.empty") }}</p>
    </template>

    <div v-if="showValidation && mappingBuildProblems.length > 0" class="ek-workbench__connection-problems" role="alert" :aria-label="t('dataSources.preview.errors')">
      <strong>{{ t("dataSources.preview.errors") }}</strong>
      <ul>
        <li v-for="(problem, index) in mappingBuildProblems" :key="`${problem.field}-${index}`">
          {{ t(problem.messageKey) }}
        </li>
      </ul>
    </div>

    <template v-if="preview">
      <p v-if="stale" class="ek-workbench__request-warning" role="status">{{ t("dataSources.queryEditor.stale") }}</p>

      <div v-if="preview.ok === false && preview.errors.length > 0" class="ek-workbench__connection-problems" role="alert" :aria-label="t('dataSources.preview.problems')">
        <strong>{{ t("dataSources.preview.problems") }}</strong>
        <ul>
          <li v-for="(problem, index) in preview.errors" :key="`${problem.code}-${index}`">
            {{ t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], mappingProblemValues(problem)) }}
          </li>
        </ul>
      </div>

      <template v-else>
        <template v-if="preview.problems.length > 0">
          <div class="ek-workbench__connection-problems" :aria-label="t('dataSources.preview.problems')">
            <strong>{{ t("dataSources.preview.problems") }}</strong>
            <ul>
              <li v-for="(problem, index) in preview.problems" :key="`${problem.code}-${index}`">
                {{ t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], mappingProblemValues(problem)) }}
              </li>
            </ul>
          </div>
        </template>

        <p v-if="preview.entities.length === 0">{{ t("dataSources.preview.emptyEntities") }}</p>
        <ul v-else class="ek-workbench__mapping-entities" :aria-label="t('dataSources.preview.entities')">
          <li v-for="entity in preview.entities" :key="entity.entityId">
            <strong>{{ entity.displayName ?? t("dataSources.preview.entityLabel", { entityId: entity.entityId }) }}</strong>
            <dl>
              <dt>{{ t("dataSources.preview.observedAt") }}</dt>
              <dd>{{ formatTimestamp(entity.observedAt) }}</dd>
              <dt>{{ t("dataSources.preview.receivedAt") }}</dt>
              <dd>{{ formatTimestamp(entity.receivedAt) }}</dd>
              <dt>{{ t("dataSources.preview.quality") }}</dt>
              <dd>{{ t(QUALITY_MESSAGE_KEYS[entity.sourceQuality]) }}</dd>
            </dl>
            <p v-if="entity.observedAtProblem" class="ek-workbench__request-warning" role="alert">
              {{ t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[entity.observedAtProblem.code], mappingProblemValues(entity.observedAtProblem)) }}
            </p>
            <p v-if="entity.qualityProblem" class="ek-workbench__request-warning" role="alert">
              {{ t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[entity.qualityProblem.code], mappingProblemValues(entity.qualityProblem)) }}
            </p>
            <table :aria-label="t('dataSources.preview.fieldsLabel')">
              <thead>
                <tr>
                  <th>{{ t("dataSources.preview.property") }}</th>
                  <th>{{ t("dataSources.preview.raw") }}</th>
                  <th>{{ t("dataSources.preview.value") }}</th>
                  <th>{{ t("dataSources.preview.statusLabel") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in entity.fields" :key="field.key" :data-status="field.status">
                  <th scope="row">
                    {{ field.label }}
                    <small>{{ field.key }}<template v-if="field.unit"> · {{ field.unit }}</template></small>
                  </th>
                  <td>{{ formatRaw(field.raw) }}</td>
                  <td>{{ formatValue(field.value) }}</td>
                  <td>
                    {{ t(FIELD_STATUS_MESSAGE_KEYS[field.status]) }}
                    <span v-for="(problem, index) in field.problems" :key="`${problem.code}-${index}`" class="ek-workbench__mapping-problem">
                      {{ t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], mappingProblemValues(problem)) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  type DataFieldStatus,
  type DataMappingProblem,
  type DataMappingResult,
  type DataParameterValue,
  type DataQueryMapping,
  type JsonValue,
  type QueryFormProblem
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import { QUALITY_MESSAGE_KEYS } from "./data-query-ui";

const FIELD_STATUS_MESSAGE_KEYS = {
  ok: "dataSources.preview.status.ok",
  missing: "dataSources.preview.status.missing",
  null: "dataSources.preview.status.null",
  invalid: "dataSources.preview.status.invalid"
} satisfies Record<DataFieldStatus, WorkbenchMessageKey>;

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  mapping: DataQueryMapping | null;
  preview: DataMappingResult | null;
  stale: boolean;
  showValidation: boolean;
  mappingBuildProblems: readonly QueryFormProblem[];
}>();

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) =>
  props.context.i18n.t(message, values);

function mappingProblemValues(problem: DataMappingProblem): WorkbenchMessageValues {
  return {
    propertyKey: problem.propertyKey ?? "",
    entityId: problem.entityId ?? "",
    detail: problem.message
  };
}

function formatTimestamp(value: number | null): string {
  return value === null ? t("dataSources.preview.unknown") : new Date(value).toISOString();
}

function formatRaw(value: JsonValue | undefined): string {
  if (value === undefined) {
    return t("dataSources.preview.missingRaw");
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatValue(value: DataParameterValue | null): string {
  return value === null ? t("dataSources.preview.status.null") : String(value);
}
</script>
