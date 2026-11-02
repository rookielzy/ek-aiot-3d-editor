<template>
  <dialog
    ref="dialogRef"
    class="ek-workbench__query-editor"
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataSources.queryEditor.label')"
    @keydown.capture="onKeyDown"
    @cancel.prevent="cancelDialog"
  >
    <div class="ek-workbench__query-editor-header">
      <h3>{{ title }}</h3>
      <button ref="closeButton" type="button" @click="requestClose()">{{ t("dataSources.queryEditor.close") }}</button>
    </div>

    <p v-if="!connection" class="ek-workbench__request-warning" role="alert">
      {{ t("dataSources.queryEditor.connectionMissing") }}
    </p>

    <div v-else class="ek-workbench__query-editor-form">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.queryEditor.name") }}</span>
        <input
          ref="nameInput"
          type="text"
          :aria-label="t('dataSources.queryEditor.name')"
          :value="form.name"
          @input="updateForm({ name: ($event.target as HTMLInputElement).value })"
        />
      </label>

      <section v-if="referenceModel && referenceCount > 0" class="ek-workbench__query-references" :aria-label="referenceCountLabel">
        <h4>{{ referenceCountLabel }}</h4>
        <p class="ek-workbench__request-hint">{{ t("dataSources.queryEditor.referencesHint") }}</p>
        <ul>
          <li v-for="binding in referenceModel.bindings" :key="binding.objectNodeId">
            <div>
              <strong>{{ binding.objectName }}</strong>
              <small>{{ t("dataSources.queryEditor.referenceDevice", { deviceId: binding.deviceId }) }}</small>
            </div>
            <button
              type="button"
              :aria-label="t('dataSources.queryEditor.selectReferenceAria', { name: binding.objectName })"
              @click="selectReferencedObject(binding.objectNodeId)"
            >{{ t("dataSources.queryEditor.select") }}</button>
          </li>
        </ul>
        <p v-for="usage in missingUsedProperties" :key="`property:${usage.propertyKey}`" class="ek-workbench__request-warning" role="alert">
          {{ t("dataSources.queryEditor.usedPropertyMissing", { propertyKey: usage.propertyKey }) }}
        </p>
        <p v-for="usage in missingUsedParameters" :key="`parameter:${usage.parameterName}`" class="ek-workbench__request-warning" role="alert">
          {{ t("dataSources.queryEditor.usedParameterMissing", { parameterName: usage.parameterName }) }}
        </p>
        <p v-for="usage in typeChangedUsedProperties" :key="`property-type:${usage.propertyKey}`" class="ek-workbench__request-warning" role="alert">
          {{ t("dataSources.queryEditor.usedPropertyTypeChanged", { propertyKey: usage.propertyKey }) }}
        </p>
        <p v-for="usage in typeChangedUsedParameters" :key="`parameter-type:${usage.parameterName}`" class="ek-workbench__request-warning" role="alert">
          {{ t("dataSources.queryEditor.usedParameterTypeChanged", { parameterName: usage.parameterName }) }}
        </p>
      </section>

      <form class="ek-workbench__query-section" :aria-label="t('dataSources.queryEditor.requestSection')" novalidate @submit.prevent="runRequest">
        <h4>{{ t("dataSources.queryEditor.requestSection") }}</h4>
        <p class="ek-workbench__request-hint">{{ t("dataSources.request.draftHint") }}</p>
        <p v-if="!service" class="ek-workbench__request-warning" role="alert">{{ t("dataSources.request.unavailable") }}</p>
        <p v-else-if="!context.dataServiceState.executorAvailable" class="ek-workbench__request-warning" role="status">
          {{ t("dataSources.request.executorMissing") }}
        </p>

        <label class="ek-workbench__field">
          <span>{{ t("dataSources.request.method") }}</span>
          <select :aria-label="t('dataSources.request.method')" :value="form.method" @change="changeMethod">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
        <template v-if="form.method === 'POST'">
          <label class="ek-workbench__request-check">
            <input
              type="checkbox"
              :aria-label="t('dataSources.request.readOnlyConfirm')"
              :checked="form.readOnly"
              @change="updateRequestForm({ readOnly: ($event.target as HTMLInputElement).checked })"
            />
            <span>{{ t("dataSources.request.readOnlyConfirm") }}</span>
          </label>
          <p class="ek-workbench__request-hint">{{ t("dataSources.request.postManualHint") }}</p>
        </template>

        <label class="ek-workbench__field">
          <span>{{ t("dataSources.request.path") }}</span>
          <input
            type="text"
            :aria-label="t('dataSources.request.path')"
            :placeholder="t('dataSources.request.pathPlaceholder')"
            :value="form.path"
            @input="updateRequestForm({ path: ($event.target as HTMLInputElement).value })"
          />
        </label>

        <div class="ek-workbench__request-preview">
          <span>{{ t("dataSources.request.preview") }}</span>
          <small v-if="!requestPreview.ok">{{ t("dataSources.request.previewPending") }}</small>
          <template v-else>
            <span :data-method="requestPreview.method">{{ requestPreview.method }}</span>
            <code>{{ requestPreview.url }}</code>
            <pre v-if="requestPreview.body !== null" class="ek-workbench__request-payload" :aria-label="t('dataSources.request.bodyPreview')">{{ JSON.stringify(requestPreview.body, null, 2) }}</pre>
          </template>
        </div>

        <fieldset class="ek-workbench__request-headers">
          <legend>{{ t("dataSources.request.headers") }}</legend>
          <p class="ek-workbench__request-hint">{{ t("dataSources.request.headers.hint") }}</p>
          <small v-if="form.headers.length === 0">{{ t("dataSources.request.headers.empty") }}</small>
          <div v-for="(header, index) in form.headers" :key="header.id" class="ek-workbench__request-header-row">
            <input
              type="text"
              :aria-label="t('dataSources.request.header.name', { index: index + 1 })"
              :placeholder="t('dataSources.request.header.name', { index: index + 1 })"
              :value="header.name"
              @input="updateHeader(header.id, { name: ($event.target as HTMLInputElement).value })"
            />
            <input
              type="text"
              :aria-label="t('dataSources.request.header.value', { index: index + 1 })"
              :placeholder="t('dataSources.request.header.value', { index: index + 1 })"
              :value="header.value"
              @input="updateHeader(header.id, { value: ($event.target as HTMLInputElement).value })"
            />
            <button type="button" :aria-label="t('dataSources.request.header.remove', { index: index + 1 })" @click="removeHeader(header.id)">
              {{ t("dataSources.request.header.removeLabel") }}
            </button>
          </div>
          <button type="button" @click="addHeader">{{ t("dataSources.request.headers.add") }}</button>
        </fieldset>

        <div class="ek-workbench__query-inline">
          <label v-if="form.method === 'GET'" class="ek-workbench__field">
            <span>{{ t("dataSources.queryEditor.refreshInterval") }}</span>
            <input
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              :aria-label="t('dataSources.queryEditor.refreshInterval')"
              :value="form.refreshIntervalSeconds"
              @input="updateRequestForm({ refreshIntervalSeconds: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="ek-workbench__field">
            <span>{{ t("dataSources.queryEditor.maxAge") }}</span>
            <input
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              :aria-label="t('dataSources.queryEditor.maxAge')"
              :value="form.maxAgeSeconds"
              @input="updateRequestForm({ maxAgeSeconds: ($event.target as HTMLInputElement).value })"
            />
          </label>
        </div>
        <p class="ek-workbench__request-hint">
          {{ form.method === "POST" ? t("dataSources.queryEditor.manualPolicyHint") : t("dataSources.queryEditor.updatePolicyHint") }}
        </p>

        <fieldset class="ek-workbench__request-parameters">
          <legend>{{ t("dataSources.request.parameters") }}</legend>
          <small v-if="form.parameters.length === 0">{{ t("dataSources.request.parameters.empty") }}</small>
          <DataQueryParameterRow
            v-for="(parameter, index) in form.parameters"
            :key="parameter.id"
            :context="context"
            :parameter="parameter"
            :index="index + 1"
            :usage="parameterUsage.get(parameter.name.trim()) ?? null"
            @patch="updateParameter(parameter.id, $event)"
            @change-type="changeParameterType(parameter.id, $event)"
            @remove="removeParameter(parameter.id)"
          />
          <button type="button" @click="addParameter">{{ t("dataSources.request.parameters.add") }}</button>
        </fieldset>

        <fieldset class="ek-workbench__query-success">
          <legend>{{ t("dataSources.request.success.title") }}</legend>
          <p class="ek-workbench__request-hint">{{ t("dataSources.request.success.hint") }}</p>
          <div class="ek-workbench__query-inline">
            <DataQueryPathField
              :context="context"
              :label="t('dataSources.request.success.path')"
              :value="form.successPath"
              :list-id="suggestionListId"
              @update="updateRequestForm({ successPath: $event })"
            />
            <label class="ek-workbench__field">
              <span>{{ t("dataSources.request.success.type") }}</span>
              <select
                :aria-label="t('dataSources.request.success.type')"
                :value="form.successType"
                @change="updateRequestForm({ successType: ($event.target as HTMLSelectElement).value as QuerySuccessValueType })"
              >
                <option v-for="type in successTypes" :key="type" :value="type">{{ t(SUCCESS_TYPE_MESSAGE_KEYS[type]) }}</option>
              </select>
            </label>
            <label v-if="form.successType !== 'null'" class="ek-workbench__field">
              <span>{{ t("dataSources.request.success.value") }}</span>
              <DataParameterValueInput
                id="query-success-value"
                :type="form.successType"
                :value="form.successValue"
                :disabled="false"
                :label="t('dataSources.request.success.value')"
                :true-label="t('dataSources.request.boolean.true')"
                :false-label="t('dataSources.request.boolean.false')"
                @change="updateRequestForm({ successValue: $event })"
              />
            </label>
          </div>
        </fieldset>

        <div class="ek-workbench__request-actions">
          <button type="submit" :disabled="!service || running">{{ t("dataSources.request.run") }}</button>
          <button v-if="running" type="button" @click="cancelRun">{{ t("dataSources.request.cancel") }}</button>
        </div>
        <pre v-if="runningText" class="ek-workbench__request-payload" role="status">{{ runningText }}</pre>
      </form>

      <section class="ek-workbench__query-section" :aria-label="t('dataSources.queryEditor.mappingSection')">
        <h4>{{ t("dataSources.queryEditor.mappingSection") }}</h4>
        <DataQueryPathField
          :context="context"
          :label="t('dataSources.mapping.root')"
          :value="form.rootPath"
          :list-id="rootSuggestionListId"
          :hint="t('dataSources.mapping.rootHint')"
          @update="updateForm({ rootPath: $event })"
        />

        <div class="ek-workbench__query-inline">
          <label class="ek-workbench__field">
            <span>{{ t("dataSources.mapping.mode") }}</span>
            <select
              :aria-label="t('dataSources.mapping.mode')"
              :value="form.mode"
              @change="changeMode(($event.target as HTMLSelectElement).value as QueryFormState['mode'])"
            >
              <option value="array">{{ t(MODE_MESSAGE_KEYS.array) }}</option>
              <option value="single">{{ t(MODE_MESSAGE_KEYS.single) }}</option>
            </select>
          </label>
          <label v-if="form.mode === 'single'" class="ek-workbench__field">
            <span>{{ t("dataSources.mapping.identity.kind") }}</span>
            <select
              :aria-label="t('dataSources.mapping.identity.kind')"
              :value="form.identityKind"
              @change="updateForm({ identityKind: ($event.target as HTMLSelectElement).value as QueryFormState['identityKind'] })"
            >
              <option value="path">{{ t(IDENTITY_KIND_MESSAGE_KEYS.path) }}</option>
              <option value="parameter">{{ t(IDENTITY_KIND_MESSAGE_KEYS.parameter) }}</option>
              <option value="literal">{{ t(IDENTITY_KIND_MESSAGE_KEYS.literal) }}</option>
            </select>
          </label>
        </div>

        <div v-if="form.identityKind === 'path'" class="ek-workbench__query-inline">
          <DataQueryPathField
            :context="context"
            :label="t('dataSources.mapping.identity.pathLabel')"
            :value="form.identityPath"
            :list-id="suggestionListId"
            @update="updateForm({ identityPath: $event })"
          />
          <label class="ek-workbench__field">
            <span>{{ t("dataSources.mapping.identity.valueType") }}</span>
            <select
              :aria-label="t('dataSources.mapping.identity.valueType')"
              :value="form.identityValueType"
              @change="updateForm({ identityValueType: ($event.target as HTMLSelectElement).value as QueryFormState['identityValueType'] })"
            >
              <option value="string">{{ t(VALUE_TYPE_MESSAGE_KEYS.string) }}</option>
              <option value="number">{{ t(VALUE_TYPE_MESSAGE_KEYS.number) }}</option>
            </select>
          </label>
        </div>
        <label v-else-if="form.identityKind === 'parameter'" class="ek-workbench__field">
          <span>{{ t("dataSources.mapping.identity.parameterField") }}</span>
          <select
            :aria-label="t('dataSources.mapping.identity.parameterField')"
            :value="form.identityParameter"
            @change="updateForm({ identityParameter: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">{{ t("dataSources.mapping.identity.parameterEmpty") }}</option>
            <option
              v-for="parameter in identityParameters"
              :key="parameter.id"
              :value="parameter.name.trim()"
            >{{ parameter.name.trim() }}</option>
          </select>
        </label>
        <label v-else class="ek-workbench__field">
          <span>{{ t("dataSources.mapping.identity.literalField") }}</span>
          <input
            type="text"
            :aria-label="t('dataSources.mapping.identity.literalField')"
            :value="form.identityLiteral"
            @input="updateForm({ identityLiteral: ($event.target as HTMLInputElement).value })"
          />
        </label>

        <DataQueryPathField
          :context="context"
          :label="t('dataSources.mapping.displayName')"
          :value="form.displayNamePath"
          :list-id="suggestionListId"
          @update="updateForm({ displayNamePath: $event })"
        />

        <fieldset class="ek-workbench__query-properties">
          <legend>{{ t("dataSources.mapping.properties") }}</legend>
          <small>{{ t("dataSources.mapping.properties.hint") }}</small>
          <DataQueryPropertyRow
            v-for="(property, index) in form.properties"
            :key="property.id"
            :context="context"
            :property="property"
            :index="index + 1"
            :suggestion-list-id="suggestionListId"
            :usage="propertyUsage.get(property.key.trim()) ?? null"
            @patch="updateProperty(index, $event)"
            @change-type="changePropertyType(index, $event)"
            @change-transform="changePropertyTransform(index, $event)"
            @update-entry="(entryId, patch) => updateMapEntry(index, entryId, patch)"
            @add-entry="addMapEntry(index)"
            @remove-entry="removeMapEntry(index, $event)"
            @remove="removeProperty(index)"
          />
          <button type="button" @click="addProperty">{{ t("dataSources.mapping.property.add") }}</button>
        </fieldset>

        <fieldset class="ek-workbench__query-observed">
          <legend>{{ t("dataSources.mapping.observedAt") }}</legend>
          <p class="ek-workbench__request-hint">{{ t("dataSources.mapping.observedAt.hint") }}</p>
          <div class="ek-workbench__query-inline">
            <DataQueryPathField
              :context="context"
              :label="t('dataSources.mapping.observedAt.path')"
              :value="form.observedPath"
              :list-id="suggestionListId"
              @update="updateForm({ observedPath: $event })"
            />
            <label class="ek-workbench__field">
              <span>{{ t("dataSources.mapping.observedAt.format") }}</span>
              <select
                :aria-label="t('dataSources.mapping.observedAt.format')"
                :value="form.observedFormat"
                @change="updateForm({ observedFormat: ($event.target as HTMLSelectElement).value as DataTimeFormat })"
              >
                <option v-for="format in timeFormats" :key="format" :value="format">{{ t(TIME_FORMAT_MESSAGE_KEYS[format]) }}</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset class="ek-workbench__query-quality">
          <legend>{{ t("dataSources.mapping.quality") }}</legend>
          <p class="ek-workbench__request-hint">{{ t("dataSources.mapping.quality.hint") }}</p>
          <DataQueryPathField
            :context="context"
            :label="t('dataSources.mapping.quality.path')"
            :value="form.qualityPath"
            :list-id="suggestionListId"
            @update="updateForm({ qualityPath: $event })"
          />
          <div v-for="(entry, index) in form.qualityEntries" :key="entry.id" class="ek-workbench__query-map-entry">
            <input
              type="text"
              :aria-label="t('dataSources.mapping.quality.from', { index: index + 1 })"
              :placeholder="t('dataSources.mapping.mapValueError')"
              :value="entry.from"
              @input="updateQualityEntry(entry.id, { from: ($event.target as HTMLInputElement).value })"
            />
            <select
              :aria-label="t('dataSources.mapping.quality.value', { index: index + 1 })"
              :value="entry.quality"
              @change="updateQualityEntry(entry.id, { quality: ($event.target as HTMLSelectElement).value as DataQuality })"
            >
              <option v-for="quality in qualities" :key="quality" :value="quality">{{ t(QUALITY_MESSAGE_KEYS[quality]) }}</option>
            </select>
            <button type="button" :aria-label="t('dataSources.mapping.quality.remove', { index: index + 1 })" @click="removeQualityEntry(entry.id)">
              {{ t("dataSources.mapping.property.removeLabel") }}
            </button>
          </div>
          <button type="button" @click="addQualityEntry">{{ t("dataSources.mapping.quality.add") }}</button>
        </fieldset>
      </section>

      <section class="ek-workbench__query-section" :aria-label="t('dataSources.queryEditor.previewSection')">
        <h4>{{ t("dataSources.queryEditor.previewSection") }}</h4>
        <p class="ek-workbench__request-hint" role="status">{{ sampleStatus }}</p>
        <label class="ek-workbench__field">
          <span>{{ t("dataSources.sample.exampleLabel") }}</span>
          <textarea
            :aria-label="t('dataSources.sample.exampleLabel')"
            :placeholder="t('dataSources.sample.hint')"
            :value="sampleText"
            @input="setSampleText"
          />
        </label>
        <div class="ek-workbench__request-actions">
          <button type="button" @click="applyExample">{{ t("dataSources.sample.apply") }}</button>
        </div>
        <p v-if="sampleError" class="ek-workbench__request-warning" role="alert">{{ t(sampleError) }}</p>

        <DataQueryMappingPreview
          :context="context"
          :mapping="mapping"
          :preview="preview"
          :stale="sampleStale"
          :show-validation="showValidation"
          :mapping-build-problems="mappingBuild.problems"
        />
      </section>

      <div v-if="validationProblems.length > 0" class="ek-workbench__connection-problems" role="alert" :aria-label="t('dataSources.queryEditor.problems')">
        <strong>{{ t("dataSources.queryEditor.problems") }}</strong>
        <ul>
          <li v-for="(problem, index) in validationProblems" :key="`${problem.code}-${index}`">
            {{ t(DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], {
              detail: problem.message,
              parameterName: problem.parameterName ?? "",
              propertyKey: problem.propertyKey ?? ""
            }) }}
          </li>
        </ul>
      </div>

      <div class="ek-workbench__connection-form-actions">
        <button type="button" @click="save">{{ t("dataSources.queryEditor.save") }}</button>
        <button ref="cancelButton" type="button" @click="requestClose()">{{ t("dataSources.queryEditor.cancel") }}</button>
      </div>
    </div>

    <div
      v-if="discardOpen"
      class="ek-workbench__connection-discard"
      role="alertdialog"
      :aria-label="t('dataSources.queryEditor.discard.title')"
    >
      <strong>{{ t("dataSources.queryEditor.discard.title") }}</strong>
      <p>{{ t("dataSources.queryEditor.discard.description") }}</p>
      <div class="ek-workbench__connection-discard-actions">
        <button ref="keepEditingButton" type="button" @click="keepEditing">{{ t("dataSources.queryEditor.discard.keep") }}</button>
        <button ref="discardButton" type="button" @click="discardChanges">{{ t("dataSources.queryEditor.discard.confirm") }}</button>
      </div>
    </div>

    <datalist :id="rootSuggestionListId">
      <option v-for="suggestion in rootSuggestions" :key="suggestion" :value="suggestion" />
    </datalist>
    <datalist :id="suggestionListId">
      <option v-for="suggestion in suggestions" :key="suggestion" :value="suggestion" />
    </datalist>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watchEffect } from "vue";
import {
  DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS,
  buildDataQueryReferenceModel,
  buildMappingFromForm,
  buildQueryDefinitionFromForm,
  buildSaveDataQueryCommand,
  createQueryHeaderForm,
  createQueryFormState,
  createQueryMapEntryForm,
  createQueryParameterForm,
  createQueryPropertyForm,
  createQueryQualityEntryForm,
  hasQueryOverrides,
  mapDataQueryBody,
  queryDraftSignature,
  queryFormFromQuery,
  queryHeadersToRecord,
  resolvedParametersForForm,
  serializeQueryForm,
  toQueryParameterDrafts,
  collectQueryOverrides,
  validateDataQueryMapping,
  buildSuccessConditionFromForm,
  type DataMappingResult,
  type DataMappingValidationResult,
  type DataParameterType,
  type DataQuality,
  type DataQueryMapping,
  type DataQueryDefinitionProblem,
  type DataQueryMethod,
  type DataTimeFormat,
  type JsonValue,
  type QueryFormProblem,
  type QueryFormState,
  type QueryHeaderForm,
  type QueryMapEntryForm,
  type QueryPropertyForm,
  type QueryQualityEntryForm,
  type QuerySuccessValueType
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import DataParameterValueInput from "./DataParameterValueInput.vue";
import DataQueryMappingPreview from "./DataQueryMappingPreview.vue";
import DataQueryParameterRow from "./DataQueryParameterRow.vue";
import DataQueryPathField from "./DataQueryPathField.vue";
import DataQueryPropertyRow from "./DataQueryPropertyRow.vue";
import {
  IDENTITY_KIND_MESSAGE_KEYS,
  MODE_MESSAGE_KEYS,
  QUALITY_MESSAGE_KEYS,
  SUCCESS_TYPE_MESSAGE_KEYS,
  TIME_FORMAT_MESSAGE_KEYS,
  VALUE_TYPE_MESSAGE_KEYS,
  buildRequestPreview,
  collectPathSuggestions,
  mappingSuggestions
} from "./data-query-ui";

interface QuerySample {
  source: "request" | "example";
  body: JsonValue;
  receivedAt: number;
  executionId: string;
  signature: string;
  parameters: Readonly<Record<string, import("@ek-aiot/3d-editor-core").DataParameterValue>>;
  usedOverrides: boolean;
  status: number | null;
}

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  connectionId: string;
  queryId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [queryId: string, created: boolean];
}>();

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) =>
  props.context.i18n.t(message, values);

const dialogRef = ref<HTMLDialogElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const keepEditingButton = ref<HTMLButtonElement | null>(null);
const discardButton = ref<HTMLButtonElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);
const rootSuggestionListId = `data-root-paths-${useId()}`;
const suggestionListId = `data-paths-${useId()}`;
const successTypes: QuerySuccessValueType[] = ["string", "number", "boolean", "null"];
const timeFormats: DataTimeFormat[] = ["iso", "unix-seconds", "unix-milliseconds"];
const qualities: DataQuality[] = ["good", "uncertain", "bad", "unknown"];

const storedQuery = props.queryId ? props.context.snapshot.dataSources.queries[props.queryId] ?? null : null;
const connection = computed(() => props.context.snapshot.dataSources.connections[props.connectionId] ?? null);
const service = props.context.editor.getDataService?.() ?? null;
const form = ref<QueryFormState>(storedQuery ? queryFormFromQuery(storedQuery) : createQueryFormState());
const problems = ref<DataQueryDefinitionProblem[]>([]);
const showValidation = ref(false);
const sample = shallowRef<QuerySample | null>(null);
const sampleText = ref("");
const sampleError = ref<WorkbenchMessageKey | null>(null);
const runId = ref<string | null>(null);
const discardOpen = ref(false);
let pendingAction: (() => void) | null = null;

const run = computed(() => {
  const state = props.context.dataServiceState.run;
  return runId.value && state?.id === runId.value ? state : null;
});
const running = computed(() => run.value?.status === "running");
const runningText = computed(() => running.value ? t("dataSources.request.running") : "");
const parameterDrafts = computed(() => toQueryParameterDrafts(form.value.parameters));
const overrides = computed(() => collectQueryOverrides(form.value.parameters));
const mappingBuild = computed(() => buildMappingFromForm(form.value));
const mappingValidation = computed<DataMappingValidationResult | null>(() => mappingBuild.value.mapping
  ? validateDataQueryMapping(mappingBuild.value.mapping, { parameters: parameterDrafts.value })
  : null);
const mapping = computed<DataQueryMapping | null>(() =>
  mappingBuild.value.problems.length === 0 && mappingValidation.value?.ok
    ? mappingValidation.value.value ?? null
    : null
);
const requestPreview = computed(() => buildRequestPreview(props.context.snapshot, props.connectionId, form.value));
const signature = computed(() => JSON.stringify([connection.value, queryDraftSignature(form.value, overrides.value)]));
const sampleStale = computed(() => sample.value !== null && sample.value.signature !== signature.value);
const preview = shallowRef<DataMappingResult | null>(null);
watchEffect(() => {
  const current = sample.value;
  const activeMapping = mapping.value;
  if (!current || !activeMapping) {
    preview.value = null;
    return;
  }
  preview.value = mapDataQueryBody(activeMapping, current.body, {
    connectionId: props.connectionId,
    queryId: props.queryId,
    executionId: current.executionId,
    receivedAt: current.receivedAt,
    parameters: current.parameters
  });
});
const rootSuggestions = computed(() => collectPathSuggestions(sample.value?.body));
const suggestions = computed(() => mappingSuggestions(sample.value?.body, form.value.rootPath, form.value.mode));
const dirty = computed(() => serializeQueryForm(form.value) !== form.value.baseline);
const referenceModel = computed(() =>
  props.queryId ? buildDataQueryReferenceModel(props.context.snapshot, props.queryId) : null
);
const referenceCount = computed(() => referenceModel.value?.bindings.length ?? 0);
const referenceCountLabel = computed(() => t(
  referenceCount.value === 1 ? "dataSources.queryEditor.references.one" : "dataSources.queryEditor.references.other",
  { count: referenceCount.value }
));
const propertyUsage = computed(() => new Map((referenceModel.value?.properties ?? []).map((usage) => [usage.propertyKey, usage])));
const parameterUsage = computed(() => new Map((referenceModel.value?.parameters ?? []).map((usage) => [usage.parameterName, usage])));
const identityParameters = computed(() =>
  form.value.parameters.filter((parameter) => parameter.name.trim() && parameter.type !== "boolean")
);
const missingUsedProperties = computed(() => {
  const draftKeys = new Set(form.value.properties.map((property) => property.key.trim()).filter(Boolean));
  return (referenceModel.value?.properties ?? []).filter((usage) => !draftKeys.has(usage.propertyKey));
});
const missingUsedParameters = computed(() => {
  const draftNames = new Set(form.value.parameters.map((parameter) => parameter.name.trim()).filter(Boolean));
  return (referenceModel.value?.parameters ?? []).filter((usage) => !draftNames.has(usage.parameterName));
});
const typeChangedUsedProperties = computed(() => {
  const storedTypes = new Map((storedQuery?.mapping.properties ?? []).map((property) => [property.key, property.type]));
  return (referenceModel.value?.properties ?? []).filter((usage) => {
    const draft = form.value.properties.find((property) => property.key.trim() === usage.propertyKey);
    const storedType = storedTypes.get(usage.propertyKey);
    return draft !== undefined && storedType !== undefined && draft.type !== storedType;
  });
});
const typeChangedUsedParameters = computed(() => {
  const storedTypes = new Map((storedQuery?.parameters ?? []).map((parameter) => [parameter.name, parameter.type]));
  return (referenceModel.value?.parameters ?? []).filter((usage) => {
    const draft = form.value.parameters.find((parameter) => parameter.name.trim() === usage.parameterName);
    const storedType = storedTypes.get(usage.parameterName);
    return draft !== undefined && storedType !== undefined && draft.type !== storedType;
  });
});
const validationProblems = computed<DataQueryDefinitionProblem[]>(() => {
  const items: DataQueryDefinitionProblem[] = [];
  if (showValidation.value) {
    if (mappingValidation.value && !mappingValidation.value.ok) {
      items.push(...mappingValidation.value.problems);
    }
  }
  items.push(...problems.value);
  return items;
});
const sampleStatus = computed(() => {
  if (!sample.value) {
    return t("dataSources.queryEditor.notTested");
  }
  const source = sample.value.source === "example"
    ? t("dataSources.queryEditor.exampleSource")
    : sample.value.usedOverrides
      ? t("dataSources.queryEditor.testedOverrides")
      : t("dataSources.queryEditor.tested");
  return sampleStale.value ? `${source} · ${t("dataSources.queryEditor.stale")}` : source;
});
const title = computed(() => props.queryId
  ? t("dataSources.queryEditor.editTitle", { name: storedQuery?.name ?? "" })
  : t("dataSources.queryEditor.newTitle", { connection: connection.value?.name ?? "" })
);

onMounted(async () => {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  if (!dialog.open) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      // Nonvisual DOM hosts do not implement the modal dialog API.
      dialog.setAttribute("open", "");
    }
  }
  await nextTick();
  nameInput.value?.focus();
});

onBeforeUnmount(() => {
  service?.invalidateQueryRuns();
});

service?.invalidateQueryRuns();

function updateForm(patch: Partial<QueryFormState>): void {
  problems.value = [];
  form.value = { ...form.value, ...patch };
}

function updateRequestForm(patch: Partial<QueryFormState>): void {
  service?.invalidateQueryRuns();
  runId.value = null;
  updateForm(patch);
}

function updateParameter(id: string, patch: Partial<import("@ek-aiot/3d-editor-core").QueryParameterForm>): void {
  updateRequestForm({
    parameters: form.value.parameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter)
  });
}

function addParameter(): void {
  updateRequestForm({ parameters: [...form.value.parameters, createQueryParameterForm()] });
}

function removeParameter(id: string): void {
  updateRequestForm({ parameters: form.value.parameters.filter((parameter) => parameter.id !== id) });
}

function changeParameterType(id: string, type: DataParameterType): void {
  const initialText = type === "boolean" ? "false" : "";
  updateParameter(id, { type, defaultText: initialText, overrideText: initialText });
}

function changeMethod(event: Event): void {
  const method = (event.target as HTMLSelectElement).value as DataQueryMethod;
  updateRequestForm({
    method,
    readOnly: method === "POST" ? false : true,
    parameters: method === "GET"
      ? form.value.parameters.map((parameter) => parameter.location === "body" ? { ...parameter, location: "auto" } : parameter)
      : form.value.parameters
  });
}

function addHeader(): void {
  updateRequestForm({ headers: [...form.value.headers, createQueryHeaderForm()] });
}

function updateHeader(id: string, patch: Partial<QueryHeaderForm>): void {
  updateRequestForm({
    headers: form.value.headers.map((header) => header.id === id ? { ...header, ...patch } : header)
  });
}

function removeHeader(id: string): void {
  updateRequestForm({ headers: form.value.headers.filter((header) => header.id !== id) });
}

function updateProperty(index: number, patch: Partial<QueryPropertyForm>): void {
  updateForm({
    properties: form.value.properties.map((property, propertyIndex) => propertyIndex === index ? { ...property, ...patch } : property)
  });
}

function changePropertyType(index: number, type: QueryPropertyForm["type"]): void {
  const current = form.value.properties[index];
  const transformKind = (type === "number" || current.transformKind === "raw" || current.transformKind === "map")
    ? current.transformKind
    : "raw";
  updateProperty(index, {
    type,
    transformKind,
    ...(type !== "number" ? { rangeMin: "", rangeMax: "" } : {})
  });
}

function changePropertyTransform(index: number, transformKind: QueryPropertyForm["transformKind"]): void {
  const current = form.value.properties[index];
  updateProperty(index, {
    transformKind,
    mapEntries: transformKind === "map" && current.mapEntries.length === 0
      ? [createQueryMapEntryForm()]
      : current.mapEntries
  });
}

function updateMapEntry(propertyIndex: number, entryId: string, patch: Partial<QueryMapEntryForm>): void {
  const property = form.value.properties[propertyIndex];
  updateProperty(propertyIndex, {
    mapEntries: property.mapEntries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry)
  });
}

function addMapEntry(propertyIndex: number): void {
  const property = form.value.properties[propertyIndex];
  updateProperty(propertyIndex, { mapEntries: [...property.mapEntries, createQueryMapEntryForm()] });
}

function removeMapEntry(propertyIndex: number, entryId: string): void {
  const property = form.value.properties[propertyIndex];
  updateProperty(propertyIndex, { mapEntries: property.mapEntries.filter((entry) => entry.id !== entryId) });
}

function removeProperty(index: number): void {
  updateForm({ properties: form.value.properties.filter((_, propertyIndex) => propertyIndex !== index) });
}

function addProperty(): void {
  updateForm({ properties: [...form.value.properties, createQueryPropertyForm()] });
}

function updateQualityEntry(entryId: string, patch: Partial<QueryQualityEntryForm>): void {
  updateForm({
    qualityEntries: form.value.qualityEntries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry)
  });
}

function addQualityEntry(): void {
  updateForm({ qualityEntries: [...form.value.qualityEntries, createQueryQualityEntryForm()] });
}

function removeQualityEntry(entryId: string): void {
  updateForm({ qualityEntries: form.value.qualityEntries.filter((entry) => entry.id !== entryId) });
}

function changeMode(mode: QueryFormState["mode"]): void {
  updateForm({
    mode,
    ...(mode === "array" && form.value.identityKind !== "path" ? { identityKind: "path" as const } : {})
  });
}

function setSampleText(event: Event): void {
  sampleText.value = (event.target as HTMLTextAreaElement).value;
  sampleError.value = null;
}

async function runRequest(): Promise<void> {
  if (!service || running.value) {
    return;
  }
  service.invalidateQueryRuns();
  sampleError.value = null;
  const requestOverrides = overrides.value;
  const usedOverrides = hasQueryOverrides(form.value.parameters);
  const handle = service.executeQueryDraft({
    connectionId: props.connectionId,
    method: form.value.method,
    readOnly: form.value.readOnly,
    path: form.value.path,
    headers: queryHeadersToRecord(form.value.headers),
    parameters: parameterDrafts.value,
    successCondition: buildSuccessConditionFromForm(form.value)
  }, { overrides: requestOverrides });
  runId.value = handle.id;
  const result = await handle.result;
  if (!result.current || result.status !== "success" || !result.response) {
    return;
  }
  if (result.response.bodyKind !== "json" || result.response.json === undefined) {
    sampleError.value = result.response.bodyKind === "empty"
      ? "dataSources.sample.emptyBody"
      : "dataSources.sample.invalidJson";
    return;
  }
  sample.value = {
    source: "request",
    body: result.response.json,
    receivedAt: result.response.receivedAt,
    executionId: result.id,
    signature: signature.value,
    parameters: result.request?.parameters ?? resolvedParametersForForm(form.value, requestOverrides),
    usedOverrides,
    status: result.response.status
  };
  sampleText.value = JSON.stringify(result.response.json, null, 2);
}

function applyExample(): void {
  let body: JsonValue;
  try {
    body = JSON.parse(sampleText.value) as JsonValue;
  } catch {
    sampleError.value = "dataSources.sample.invalidJson";
    return;
  }
  service?.invalidateQueryRuns();
  runId.value = null;
  sampleError.value = null;
  sample.value = {
    source: "example",
    body,
    receivedAt: Date.now(),
    executionId: `example-${Date.now()}`,
    signature: signature.value,
    parameters: resolvedParametersForForm(form.value, overrides.value),
    usedOverrides: false,
    status: null
  };
}

function cancelRun(): void {
  if (run.value && service) {
    service.cancelQueryRun(run.value.id);
  }
}

function requestClose(action: () => void = () => emit("close")): void {
  if (dirty.value) {
    pendingAction = action;
    discardOpen.value = true;
    void nextTick(() => keepEditingButton.value?.focus());
    return;
  }
  action();
}

function keepEditing(): void {
  pendingAction = null;
  discardOpen.value = false;
  void nextTick(() => nameInput.value?.focus());
}

function discardChanges(): void {
  const action = pendingAction ?? (() => emit("close"));
  pendingAction = null;
  discardOpen.value = false;
  action();
}

function cancelDialog(): void {
  if (discardOpen.value) {
    pendingAction = null;
    discardOpen.value = false;
    return;
  }
  requestClose();
}

function selectReferencedObject(objectNodeId: string): void {
  requestClose(() => {
    props.context.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: [objectNodeId],
      primaryNodeId: objectNodeId
    });
    emit("close");
  });
}

function save(): void {
  showValidation.value = true;
  problems.value = [];
  if (mappingBuild.value.problems.length > 0 || !mapping.value) {
    return;
  }
  const definition = buildQueryDefinitionFromForm(form.value, props.connectionId, mapping.value);
  const result = buildSaveDataQueryCommand(props.context.snapshot, definition, { queryId: props.queryId });
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  const previousIds = new Set(Object.keys(props.context.snapshot.dataSources.queries));
  const dispatched = props.context.dispatch(result.command);
  if (!dispatched.ok) {
    problems.value = [{ field: "query", code: "command-failed", message: dispatched.error ?? "" }];
    return;
  }
  const savedId = props.queryId ?? Object.keys(dispatched.snapshot.dataSources.queries).find((id) => !previousIds.has(id));
  if (savedId) {
    emit("saved", savedId, props.queryId === null);
  }
}

function onKeyDown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    cancelDialog();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const first = discardOpen.value ? keepEditingButton.value : closeButton.value;
  const last = discardOpen.value ? discardButton.value : cancelButton.value ?? closeButton.value;
  if (event.shiftKey && event.target === first) {
    event.preventDefault();
    last?.focus();
    return;
  }
  if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>
