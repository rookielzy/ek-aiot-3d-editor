<template>
  <form
    class="ek-workbench__binding-form"
    :aria-label="t('dataBinding.section.label')"
    novalidate
    @submit.prevent="saveBinding"
  >
    <p class="ek-workbench__binding-description">{{ t("dataBinding.section.description") }}</p>

    <p v-if="fixedQueryId" class="ek-workbench__binding-fixed-query">
      <span>{{ t("dataBinding.form.query") }}</span>
      <strong>{{ query?.name ?? fixedQueryId }}</strong>
    </p>
    <label v-else class="ek-workbench__field">
      <span>{{ t("dataBinding.form.query") }}</span>
      <select :aria-label="t('dataBinding.form.query')" :value="draft.queryId" @change="changeQuery(($event.target as HTMLSelectElement).value)">
        <option value="">{{ t("dataBinding.form.query.placeholder") }}</option>
        <option v-for="item in queries" :key="item.id" :value="item.id">{{ queryLabel(item) }}</option>
      </select>
    </label>
    <p v-if="!fixedQueryId && queries.length === 0" class="ek-workbench__binding-hint">{{ t("dataBinding.form.query.empty") }}</p>
    <template v-if="!fixedQueryId">
      <p v-if="connections.length === 0" class="ek-workbench__binding-hint">{{ t("dataBinding.form.query.noConnections") }}</p>
      <div v-else class="ek-workbench__binding-query-create">
        <label v-if="connections.length > 1" class="ek-workbench__field">
          <span>{{ t("dataBinding.form.query.connection") }}</span>
          <select :aria-label="t('dataBinding.form.query.connection')" :value="queryConnectionId" @change="newQueryConnectionId = ($event.target as HTMLSelectElement).value">
            <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}</option>
          </select>
        </label>
        <button type="button" :disabled="!queryConnectionId" @click="queryEditorOpen = true">{{ t("dataBinding.form.query.create") }}</button>
      </div>
    </template>

    <label class="ek-workbench__field">
      <span>{{ t("dataBinding.form.device") }}</span>
      <input
        type="text"
        :aria-label="t('dataBinding.form.device')"
        :placeholder="t('dataBinding.form.device.placeholder')"
        :value="draft.deviceId"
        @input="updateDraft({ deviceId: ($event.target as HTMLInputElement).value })"
      />
    </label>
    <div class="ek-workbench__binding-candidates">
      <button
        type="button"
        :disabled="!service || !query || candidates.status === 'loading'"
        @click="loadCandidates"
      >{{ candidates.status === "loading" ? t("dataBinding.form.device.loading") : t("dataBinding.form.device.load") }}</button>
      <small v-if="candidatesStale" role="status">{{ t("dataBinding.form.device.stale") }}</small>
      <small v-else-if="candidates.status === 'error'" role="alert">
        {{ candidates.problems.length > 0
          ? candidates.problems.map((problem) => formatDataQueryProblem(i18n, problem)).join(" ")
          : candidates.message ?? t("dataBinding.problem.candidatesFailed") }}
      </small>
      <template v-else-if="candidates.status === 'ready'">
        <small v-if="currentCandidates.length === 0" role="status">{{ t("dataBinding.form.device.none") }}</small>
        <label v-else class="ek-workbench__field">
          <span>{{ t("dataBinding.form.device.candidates") }}</span>
          <select
            :aria-label="t('dataBinding.form.device.candidates')"
            :value="currentCandidates.some((entity) => entity.entityId === draft.deviceId) ? draft.deviceId : ''"
            @change="updateDraft({ deviceId: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">{{ t("dataBinding.form.device.placeholder") }}</option>
            <option v-for="entity in currentCandidates" :key="entity.entityId" :value="entity.entityId">
              {{ entity.displayName ? `${entity.displayName} (${entity.entityId})` : entity.entityId }}
            </option>
          </select>
        </label>
      </template>
    </div>

    <fieldset class="ek-workbench__binding-parameters">
      <legend>{{ t("dataBinding.form.parameters") }}</legend>
      <p v-if="query && query.parameters.length > 0" class="ek-workbench__binding-hint">{{ t("dataBinding.form.parameters.note") }}</p>
      <small v-if="!query || query.parameters.length === 0">{{ t("dataBinding.form.parameters.empty") }}</small>
      <div
        v-for="parameter in query?.parameters ?? []"
        :key="parameter.name"
        class="ek-workbench__binding-parameter"
        role="group"
        :aria-label="`${parameter.name}`"
      >
        <div class="ek-workbench__binding-parameter-main">
          <strong class="ek-workbench__binding-parameter-name">{{ parameter.name }}</strong>
          <small>{{ t(parameterTypeKey(parameter.type)) }}</small>
          <small>
            {{ t("dataBinding.form.parameters.default") }}: {{ hasDefault(parameter)
              ? String(parameter.defaultValue)
              : t("dataBinding.form.parameters.noValue") }}
          </small>
        </div>
        <label class="ek-workbench__request-check">
          <input
            type="checkbox"
            :aria-label="t('dataBinding.form.parameters.overrideAria', { name: parameter.name })"
            :checked="overrideFor(parameter.name).enabled"
            @change="toggleOverride(parameter.name, parameter.type, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("dataBinding.form.parameters.override") }}</span>
        </label>
        <DataParameterValueInput
          v-if="overrideFor(parameter.name).enabled"
          :id="`${id}-${parameter.name}-override`"
          :type="parameter.type"
          :value="overrideFor(parameter.name).text"
          :disabled="false"
          :label="t('dataBinding.form.parameters.overrideValueAria', { name: parameter.name })"
          :true-label="t('dataSources.request.boolean.true')"
          :false-label="t('dataSources.request.boolean.false')"
          @change="updateOverride(parameter.name, { text: $event })"
        />
      </div>
    </fieldset>

    <fieldset class="ek-workbench__binding-details">
      <legend>{{ t("dataBinding.form.details") }}</legend>
      <p class="ek-workbench__binding-hint">{{ t("dataBinding.form.details.hint") }}</p>
      <small v-if="draft.details.length === 0">{{ t("dataBinding.form.details.required") }}</small>
      <div v-for="(detail, index) in draft.details" :key="detail.key" class="ek-workbench__binding-detail-row">
        <div class="ek-workbench__binding-detail-name">
          <strong>{{ detailName(detail) }}</strong>
          <small>{{ detailProperty(detail)?.unit ?? "" }}</small>
        </div>
        <button
          type="button"
          :aria-label="t('dataBinding.form.details.moveUpAria', { name: detailName(detail) })"
          :disabled="index === 0"
          @click="moveDetail(detail.key, -1)"
        >{{ t("dataBinding.form.details.moveUp") }}</button>
        <button
          type="button"
          :aria-label="t('dataBinding.form.details.moveDownAria', { name: detailName(detail) })"
          :disabled="index === draft.details.length - 1"
          @click="moveDetail(detail.key, 1)"
        >{{ t("dataBinding.form.details.moveDown") }}</button>
        <label class="ek-workbench__field">
          <span>{{ t("dataBinding.form.details.label") }}</span>
          <input
            type="text"
            :aria-label="t('dataBinding.form.details.labelAria', { name: detailName(detail) })"
            :placeholder="t('dataBinding.form.details.labelPlaceholder')"
            :value="detail.label"
            @input="updateDetail(detail.key, { label: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label v-if="detailProperty(detail)?.type === 'number'" class="ek-workbench__field">
          <span>{{ t("dataBinding.form.details.precision") }}</span>
          <input
            type="number"
            min="0"
            :max="DATA_DETAIL_MAX_PRECISION"
            step="1"
            :aria-label="t('dataBinding.form.details.precisionAria', { name: detailName(detail) })"
            :value="detail.precision"
            @input="updateDetail(detail.key, { precision: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <button
          type="button"
          :aria-label="t('dataBinding.form.details.removeAria', { name: detailName(detail) })"
          @click="removeDetail(detail.key)"
        >{{ t("dataBinding.form.details.remove") }}</button>
      </div>
      <div v-if="unavailableProperties.length > 0" class="ek-workbench__binding-add-details">
        <span>{{ t("dataBinding.form.details.add") }}</span>
        <button
          v-for="property in unavailableProperties"
          :key="property.key"
          type="button"
          :aria-label="t('dataBinding.form.details.addAria', { name: property.label })"
          @click="addDetail(property.key)"
        >{{ property.label }}</button>
      </div>
    </fieldset>

    <fieldset class="ek-workbench__binding-colors">
      <legend>{{ t("dataBinding.form.colors") }}</legend>
      <label class="ek-workbench__request-check">
        <input
          type="checkbox"
          :aria-label="t('dataBinding.form.colors.enable')"
          :checked="draft.color !== null"
          @change="toggleColor(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t("dataBinding.form.colors.enable") }}</span>
      </label>
      <template v-if="draft.color">
        <p class="ek-workbench__binding-hint">{{ t("dataBinding.form.colors.hint") }}</p>
        <label class="ek-workbench__field">
          <span>{{ t("dataBinding.form.colors.property") }}</span>
          <select
            :aria-label="t('dataBinding.form.colors.property')"
            :value="draft.color.propertyKey"
            @change="changeColorProperty(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t("dataBinding.form.colors.propertyPlaceholder") }}</option>
            <option v-for="property in colorProperties" :key="property.key" :value="property.key">{{ property.label }}</option>
          </select>
        </label>
        <div class="ek-workbench__binding-color-rules" role="group" :aria-label="t('dataBinding.form.colors.rules')">
          <small v-if="draft.color.rules.length === 0">{{ t("dataBinding.problem.colorRulesRequired") }}</small>
          <div
            v-for="(rule, index) in draft.color.rules"
            :key="index"
            class="ek-workbench__binding-color-rule"
            role="group"
            :aria-label="ruleLabel(index)"
          >
            <span class="ek-workbench__binding-color-order" aria-hidden="true">{{ index + 1 }}</span>
            <label class="ek-workbench__field">
              <span>{{ t("dataBinding.form.colors.operator") }}</span>
              <select
                :aria-label="`${ruleLabel(index)} · ${t('dataBinding.form.colors.operator')}`"
                :value="rule.operator"
                @change="updateColorRule(index, { operator: ($event.target as HTMLSelectElement).value as DataColorOperator })"
              >
                <option v-for="operator in colorOperatorsForRule(colorProperty)" :key="operator" :value="operator">
                  {{ t(`dataBinding.color.operator.${operator}`) }}
                </option>
              </select>
            </label>
            <label class="ek-workbench__field">
              <span>{{ t("dataBinding.form.colors.value") }}</span>
              <select
                v-if="rulePropertyType === 'boolean'"
                :aria-label="`${ruleLabel(index)} · ${t('dataBinding.form.colors.value')}`"
                :value="rule.value === 'false' ? 'false' : 'true'"
                @change="updateColorRule(index, { value: ($event.target as HTMLSelectElement).value })"
              >
                <option value="true">{{ t("dataSources.request.boolean.true") }}</option>
                <option value="false">{{ t("dataSources.request.boolean.false") }}</option>
              </select>
              <input
                v-else
                :type="rulePropertyType === 'number' ? 'number' : 'text'"
                :step="rulePropertyType === 'number' ? 'any' : undefined"
                :aria-label="`${ruleLabel(index)} · ${t('dataBinding.form.colors.value')}`"
                :value="rule.value"
                @input="updateColorRule(index, { value: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label v-if="rule.operator === 'between'" class="ek-workbench__field">
              <span>{{ t("dataBinding.form.colors.max") }}</span>
              <input
                type="number"
                step="any"
                :aria-label="`${ruleLabel(index)} · ${t('dataBinding.form.colors.max')}`"
                :value="rule.max"
                @input="updateColorRule(index, { max: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label class="ek-workbench__field ek-workbench__binding-color-swatch">
              <span>{{ t("dataBinding.form.colors.color") }}</span>
              <input
                type="color"
                :aria-label="`${ruleLabel(index)} · ${t('dataBinding.form.colors.color')}`"
                :value="normalizedRuleColor(rule.color)"
                @input="updateColorRule(index, { color: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <div class="ek-workbench__binding-color-palette" role="group" :aria-label="t('dataBinding.form.colors.palette')">
              <button
                v-for="swatch in DATA_BINDING_COLOR_PALETTE"
                :key="swatch"
                type="button"
                class="ek-workbench__binding-color-chip"
                :style="{ backgroundColor: swatch }"
                :aria-label="t('dataBinding.form.colors.swatch', { color: swatch })"
                :aria-pressed="normalizedRuleColor(rule.color) === swatch"
                @click="updateColorRule(index, { color: swatch })"
              />
            </div>
            <div class="ek-workbench__binding-color-actions">
              <button
                type="button"
                :aria-label="t('dataBinding.form.colors.moveUpAria', { index: index + 1 })"
                :disabled="index === 0"
                @click="moveColorRule(index, -1)"
              >{{ t("dataBinding.form.colors.moveUp") }}</button>
              <button
                type="button"
                :aria-label="t('dataBinding.form.colors.moveDownAria', { index: index + 1 })"
                :disabled="index === draft.color.rules.length - 1"
                @click="moveColorRule(index, 1)"
              >{{ t("dataBinding.form.colors.moveDown") }}</button>
              <button
                type="button"
                :aria-label="t('dataBinding.form.colors.removeAria', { index: index + 1 })"
                @click="removeColorRule(index)"
              >{{ t("dataBinding.form.colors.remove") }}</button>
            </div>
          </div>
        </div>
        <button type="button" @click="addColorRule">{{ t("dataBinding.form.colors.addRule") }}</button>
        <small class="ek-workbench__binding-hint">{{ t("dataBinding.form.colors.default") }}</small>
        <div v-if="colorCapability" class="ek-workbench__binding-color-capability" :data-status="colorCapability.status" role="status">
          <span>{{ colorCapabilityLabel(colorCapability, i18n) }}</span>
          <ul v-if="colorCapability.problems.length > 0">
            <li v-for="(problem, index) in colorCapability.problems" :key="`${problem.meshName}-${problem.slotIndex}-${index}`">
              {{ t("dataBinding.colors.capability.problem", { materialType: problem.materialType, meshName: problem.meshName }) }}
            </li>
          </ul>
        </div>
        <div class="ek-workbench__binding-color-trial">
          <template v-if="trialActive">
            <span role="status">{{ t("dataBinding.colors.trial.active") }}</span>
            <button type="button" @click="endDraftTrial">{{ t("dataBinding.colors.trial.end") }}</button>
          </template>
          <template v-else>
            <button type="button" :disabled="!dataColorService || trialHint !== null" @click="startDraftTrial">
              {{ t("dataBinding.colors.trial.start") }}
            </button>
            <small v-if="trialHint">{{ t(trialHint) }}</small>
          </template>
          <small v-if="trialProblem" role="alert">{{ t(trialProblem) }}</small>
        </div>
      </template>
    </fieldset>

    <label class="ek-workbench__request-check">
      <input
        type="checkbox"
        :aria-label="t('dataBinding.form.enabled')"
        :checked="draft.enabled"
        @change="updateDraft({ enabled: ($event.target as HTMLInputElement).checked })"
      />
      <span>{{ t("dataBinding.form.enabled") }}</span>
    </label>
    <small class="ek-workbench__binding-hint">{{ t("dataBinding.form.enabledHint") }}</small>

    <div v-if="problems.length > 0" class="ek-workbench__binding-problems" role="alert" :aria-label="t('dataBinding.form.problems')">
      <strong>{{ t("dataBinding.form.problems") }}</strong>
      <ul>
        <li v-for="(problem, index) in problems" :key="`${problem.code}-${problem.parameterName ?? ''}-${problem.propertyKey ?? ''}-${index}`">
          {{ formatBindingProblem(i18n, problem) }}
        </li>
      </ul>
    </div>

    <p v-if="status" class="ek-workbench__data-status" role="status">{{ t(BINDING_STATUS_MESSAGE_KEYS[status]) }}</p>

    <div class="ek-workbench__binding-actions">
      <button type="submit">{{ t(savedBinding ? "dataBinding.form.save" : "dataBinding.form.create") }}</button>
      <button type="button" :disabled="!dirty && !savedBinding" @click="resetDraft">{{ t("dataBinding.form.cancel") }}</button>
      <button v-if="savedBinding" type="button" @click="removeBinding">{{ t("dataBinding.form.unbind") }}</button>
    </div>
  </form>

  <DataQueryEditor
    v-if="queryEditorOpen"
    :key="`binding-query:${queryConnectionId}`"
    :context="context"
    :connection-id="queryConnectionId"
    :query-id="null"
    @close="queryEditorOpen = false"
    @saved="handleQuerySaved"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch, type ComputedRef } from "vue";
import {
  DATA_DETAIL_MAX_PRECISION,
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  buildDeleteDataObjectBindingCommand,
  buildSaveDataObjectBindingCommand,
  type DataBindingProblem,
  type DataColorObjectCapability,
  type DataColorOperator,
  type DataMappingProblem,
  type DataMappedEntity,
  type DataParameterValue,
  type DataPropertyMapping,
  type DataQuery,
  type DataParameterType
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchI18n, WorkbenchMessageKey } from "../i18n/workbench-i18n";
import DataParameterValueInput from "./DataParameterValueInput.vue";
import DataQueryEditor from "./DataQueryEditor.vue";
import {
  BINDING_STATUS_MESSAGE_KEYS,
  COLOR_TRIAL_PROBLEM_MESSAGE_KEYS,
  DATA_BINDING_COLOR_PALETTE,
  collectBindingColor,
  collectBindingInput,
  colorCapabilityLabel,
  colorForQuery,
  colorOperatorsForRule,
  collectBindingOverrides,
  createBindingDraft,
  createDefaultColorDraft,
  createDefaultColorRule,
  detailsForQuery,
  draftOverridesForQuery,
  formatBindingProblem,
  mapCandidateResponse,
  normalizedRuleColor,
  parameterTypeKey,
  queryOptionLabel,
  serializeBindingDraft,
  type BindingCandidateState,
  type BindingDraft,
  type BindingStatus,
  type ColorRuleDraft,
  type DetailDraft,
  type OverrideDraft
} from "./data-binding-ui";
import { formatDataQueryProblem } from "./data-query-ui";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  objectNodeId: string;
  fixedQueryId?: string | null;
}>();

const emit = defineEmits<{
  dirtyChange: [dirty: boolean];
}>();

const id = useId();
const i18n: WorkbenchI18n = props.context.i18n as WorkbenchI18n;
const t = (message: Parameters<WorkbenchI18n["t"]>[0], values?: Parameters<WorkbenchI18n["t"]>[1]) =>
  props.context.i18n.t(message, values);
const snapshot = computed(() => props.context.snapshot);
const fixedQueryId = computed(() => props.fixedQueryId ?? null);
const savedBinding = computed(() => snapshot.value.dataSources.bindings[props.objectNodeId] ?? null);
const savedSignature = computed(() => savedBinding.value ? JSON.stringify(savedBinding.value) : "");
const queries = computed(() => Object.values(snapshot.value.dataSources.queries));
const connections = computed(() => Object.values(snapshot.value.dataSources.connections));
const service = computed(() => props.context.editor.getDataService?.() ?? null);
const dataColorService = computed(() => props.context.editor.getDataColorService?.() ?? null);
const colorCapability = computed<DataColorObjectCapability | null>(() =>
  props.context.dataColorState.objects[props.objectNodeId]?.capabilities ?? null
);
const trialActive = computed(() => props.context.dataColorState.trial?.objectNodeId === props.objectNodeId);

const draft = ref<BindingDraft>(createBindingDraft(snapshot.value, props.objectNodeId, fixedQueryId.value));
const baseline = ref(serializeBindingDraft(draft.value));
const problems = ref<readonly DataBindingProblem[]>([]);
const status = ref<BindingStatus | null>(null);
const candidates = ref<BindingCandidateState>({ status: "idle", signature: "" });
const newQueryConnectionId = ref(connections.value[0]?.id ?? "");
const queryEditorOpen = ref(false);
const trialProblem = ref<WorkbenchMessageKey | null>(null);
let candidateRunId: string | null = null;

const query = computed(() => draft.value.queryId ? snapshot.value.dataSources.queries[draft.value.queryId] ?? null : null);
const queryConnectionId = computed(() =>
  connections.value.some((connection) => connection.id === newQueryConnectionId.value)
    ? newQueryConnectionId.value
    : connections.value[0]?.id ?? ""
);
const connection = computed(() => query.value ? snapshot.value.dataSources.connections[query.value.connectionId] ?? null : null);
const signature = computed(() => JSON.stringify([draft.value.queryId, draft.value.overrides, query.value, connection.value]));
const dirty = computed(() => serializeBindingDraft(draft.value) !== baseline.value);
const candidateEntities = computed((): DataMappedEntity[] => {
  const state = candidates.value;
  if (state.status === "ready") {
    return ([...state.entities] as unknown) as DataMappedEntity[];
  }
  return [];
});
const candidateSignature = computed((): string | null => {
  const state = candidates.value;
  return state.status === "ready" ? state.signature : null;
});
const candidatesStale = computed(() => candidateSignature.value !== null && candidateSignature.value !== signature.value);
const currentCandidates = computed(() => candidatesStale.value ? [] : candidateEntities.value) as ComputedRef<DataMappedEntity[]>;
const unavailableProperties = computed(() =>
  query.value
    ? query.value.mapping.properties.filter((property) => !draft.value.details.some((detail) => detail.key === property.key))
    : []
);
const colorProperties = computed(() => query.value?.mapping.properties ?? []);
const colorProperty = computed(() => draft.value.color
  ? colorProperties.value.find((property) => property.key === draft.value.color?.propertyKey) ?? null
  : null
);
const rulePropertyType = computed(() => colorProperty.value?.type ?? "string");
const previewEnabled = computed(() => props.context.dataState.preview.enabled);
const trialEntity = computed(() => currentCandidates.value.find((entity) => entity.entityId === draft.value.deviceId) ?? null);
const trialField = computed(() => draft.value.color && trialEntity.value
  ? trialEntity.value.fields.find((field) => field.key === draft.value.color?.propertyKey) ?? null
  : null
);
const trialValue = computed<DataParameterValue | null>(() =>
  trialField.value?.status === "ok" ? trialField.value.value : null
);
const trialHint = computed<WorkbenchMessageKey | null>(() => previewEnabled.value
  ? "dataBinding.colors.trial.previewActive"
  : trialValue.value === null
    ? "dataBinding.colors.trial.noValue"
    : null
);

watch(dirty, (value) => emit("dirtyChange", value), { immediate: true });

// A binding saved or reverted elsewhere replaces the draft wholesale unless the
// form itself produced that change.
watch(savedSignature, () => {
  const next = createBindingDraft(snapshot.value, props.objectNodeId, fixedQueryId.value);
  draft.value = next;
  baseline.value = serializeBindingDraft(next);
  problems.value = [];
  candidates.value = { status: "idle", signature: "" };
});

// Device names in a candidate list belong to the parameter set that produced it.
watch(signature, (next) => {
  if (candidates.value.status !== "loading" || candidates.value.signature === next) {
    return;
  }
  cancelCandidateRun();
  candidates.value = { status: "idle", signature: next };
});

onBeforeUnmount(() => {
  cancelCandidateRun();
  endTrialForThisObject();
});

function cancelCandidateRun(): void {
  if (candidateRunId) {
    service.value?.cancelQueryRun(candidateRunId);
    candidateRunId = null;
  }
}

function updateDraft(patch: Partial<BindingDraft>): void {
  problems.value = [];
  draft.value = { ...draft.value, ...patch };
}

function changeQuery(queryId: string): void {
  const nextQuery = queryId ? snapshot.value.dataSources.queries[queryId] ?? null : null;
  endTrialForThisObject();
  problems.value = [];
  candidates.value = { status: "idle", signature: "" };
  draft.value = {
    ...draft.value,
    queryId,
    overrides: draftOverridesForQuery(draft.value.overrides, nextQuery),
    details: detailsForQuery(draft.value.details, nextQuery),
    color: colorForQuery(draft.value.color, nextQuery)
  };
}

function overrideFor(name: string): OverrideDraft {
  return draft.value.overrides[name] ?? { enabled: false, text: "" };
}

function toggleOverride(name: string, type: DataParameterType, enabled: boolean): void {
  updateOverride(name, {
    enabled,
    ...(enabled && type === "boolean" && overrideFor(name).text === "" ? { text: "false" } : {})
  });
}

function updateOverride(name: string, patch: Partial<OverrideDraft>): void {
  problems.value = [];
  const current = overrideFor(name);
  draft.value = {
    ...draft.value,
    overrides: {
      ...draft.value.overrides,
      [name]: { ...current, ...patch }
    }
  };
}

function updateDetail(key: string, patch: Partial<DetailDraft>): void {
  problems.value = [];
  draft.value = {
    ...draft.value,
    details: draft.value.details.map((detail) => detail.key === key ? { ...detail, ...patch } : detail)
  };
}

function moveDetail(key: string, direction: -1 | 1): void {
  problems.value = [];
  const index = draft.value.details.findIndex((detail) => detail.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.value.details.length) {
    return;
  }
  const details = [...draft.value.details];
  [details[index], details[target]] = [details[target]!, details[index]!];
  draft.value = { ...draft.value, details };
}

function addDetail(key: string): void {
  if (!key || draft.value.details.some((detail) => detail.key === key)) {
    return;
  }
  problems.value = [];
  draft.value = {
    ...draft.value,
    details: [...draft.value.details, { key, label: "", precision: "" }]
  };
}

function removeDetail(key: string): void {
  problems.value = [];
  draft.value = {
    ...draft.value,
    details: draft.value.details.filter((detail) => detail.key !== key)
  };
}

function detailProperty(detail: DetailDraft): DataPropertyMapping | null {
  return query.value?.mapping.properties.find((property) => property.key === detail.key) ?? null;
}

function detailName(detail: DetailDraft): string {
  return detailProperty(detail)?.label ?? detail.key;
}

function hasDefault(parameter: { name: string }): boolean {
  return Object.prototype.hasOwnProperty.call(parameter, "defaultValue");
}

function endTrialForThisObject(): void {
  if (dataColorService.value?.getTrial()?.objectNodeId === props.objectNodeId) {
    dataColorService.value.endTrial();
  }
  trialProblem.value = null;
}

function toggleColor(enabled: boolean): void {
  endTrialForThisObject();
  problems.value = [];
  draft.value = {
    ...draft.value,
    color: enabled && query.value ? createDefaultColorDraft(query.value.mapping.properties) : null
  };
}

function changeColorProperty(propertyKey: string): void {
  const property = colorProperties.value.find((candidate) => candidate.key === propertyKey) ?? null;
  endTrialForThisObject();
  problems.value = [];
  draft.value = {
    ...draft.value,
    color: property
      ? { propertyKey, rules: [createDefaultColorRule(property, 0)] }
      : null
  };
}

function updateColorRule(index: number, patch: Partial<ColorRuleDraft>): void {
  endTrialForThisObject();
  problems.value = [];
  if (!draft.value.color) {
    return;
  }
  draft.value = {
    ...draft.value,
    color: {
      ...draft.value.color,
      rules: draft.value.color.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule)
    }
  };
}

function addColorRule(): void {
  if (!colorProperty.value || !draft.value.color) {
    return;
  }
  endTrialForThisObject();
  problems.value = [];
  draft.value = {
    ...draft.value,
    color: {
      ...draft.value.color,
      rules: [
        ...draft.value.color.rules,
        createDefaultColorRule(colorProperty.value, draft.value.color.rules.length)
      ]
    }
  };
}

function moveColorRule(index: number, direction: -1 | 1): void {
  endTrialForThisObject();
  problems.value = [];
  if (!draft.value.color) {
    return;
  }
  const target = index + direction;
  if (target < 0 || target >= draft.value.color.rules.length) {
    return;
  }
  const rules = [...draft.value.color.rules];
  [rules[index], rules[target]] = [rules[target]!, rules[index]!];
  draft.value = { ...draft.value, color: { ...draft.value.color, rules } };
}

function removeColorRule(index: number): void {
  endTrialForThisObject();
  problems.value = [];
  if (!draft.value.color) {
    return;
  }
  draft.value = {
    ...draft.value,
    color: {
      ...draft.value.color,
      rules: draft.value.color.rules.filter((_, ruleIndex) => ruleIndex !== index)
    }
  };
}

function startDraftTrial(): void {
  if (!dataColorService.value || !draft.value.color || trialValue.value === null) {
    return;
  }
  trialProblem.value = null;
  const result = dataColorService.value.startTrial({
    objectNodeId: props.objectNodeId,
    color: collectBindingColor(draft.value, query.value),
    value: trialValue.value,
    source: "test"
  });
  if (!result.ok) {
    const problem = result.problems[0];
    trialProblem.value = problem ? COLOR_TRIAL_PROBLEM_MESSAGE_KEYS[problem.code] : "dataBinding.colors.trial.failed";
  }
}

function endDraftTrial(): void {
  dataColorService.value?.endTrial();
  trialProblem.value = null;
}

async function loadCandidates(): Promise<void> {
  const currentService = service.value;
  const currentQuery = query.value;
  if (!currentService || !currentQuery) {
    return;
  }
  const requestSignature = signature.value;
  const overrideValues = collectBindingOverrides(draft.value, currentQuery);
  problems.value = [];
  candidates.value = { status: "loading", signature: requestSignature };
  const handle = currentService.executeQueryDraft({
    connectionId: currentQuery.connectionId,
    method: currentQuery.method,
    readOnly: currentQuery.readOnly,
    path: currentQuery.path,
    headers: currentQuery.headers,
    parameters: currentQuery.parameters,
    successCondition: currentQuery.successCondition
  }, { overrides: overrideValues });
  candidateRunId = handle.id;
  const result = await handle.result;
  if (candidateRunId !== handle.id) {
    return;
  }
  candidateRunId = null;
  if (!result.current) {
    candidates.value = { status: "idle", signature: requestSignature };
    return;
  }
  if (result.status !== "success" || !result.response) {
    candidates.value = { status: "error", signature: requestSignature, problems: result.problems, message: null };
    return;
  }
  if (result.response.bodyKind !== "json" || result.response.json === undefined) {
    candidates.value = {
      status: "error",
      signature: requestSignature,
      problems: [],
      message: t(result.response.bodyKind === "empty" ? "dataSources.sample.emptyBody" : "dataSources.sample.invalidJson")
    };
    return;
  }
  const mapped = mapCandidateResponse(currentQuery, result.response.json, {
    executionId: result.id,
    receivedAt: result.response.receivedAt,
    parameters: result.request?.parameters ?? overrideValues
  });
  if (!mapped.ok) {
    candidates.value = {
      status: "error",
      signature: requestSignature,
      problems: [],
      message: mapped.errors.length > 0
        ? mapped.errors.map((problem) => t(
            DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code as DataMappingProblem["code"]],
            { propertyKey: problem.propertyKey ?? "" }
          )).join(" ")
        : t("dataBinding.problem.candidatesFailed")
    };
    return;
  }
  candidates.value = { status: "ready", signature: requestSignature, entities: mapped.entities };
}

function saveBinding(): void {
  endTrialForThisObject();
  const currentQuery = query.value;
  if (!currentQuery) {
    // The code selects the dictionary message; the raw text only reaches diagnostics.
    problems.value = [{
      field: "query",
      code: "query-not-found",
      message: ""
    }];
    return;
  }
  const result = buildSaveDataObjectBindingCommand(snapshot.value, collectBindingInput(draft.value, props.objectNodeId, currentQuery));
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  const wasSaved = savedBinding.value !== null;
  const dispatched = props.context.dispatch(result.command);
  if (!dispatched.ok) {
    problems.value = [{ field: "binding", code: "command-failed", message: dispatched.error ?? "" }];
    return;
  }
  const next = createBindingDraft(dispatched.snapshot, props.objectNodeId, fixedQueryId.value);
  draft.value = next;
  baseline.value = serializeBindingDraft(next);
  problems.value = [];
  status.value = wasSaved ? "updated" : "saved";
  if (candidates.value.status === "ready") {
    candidates.value = { status: "idle", signature: "" };
  }
}

function resetDraft(): void {
  endTrialForThisObject();
  const next = createBindingDraft(snapshot.value, props.objectNodeId, fixedQueryId.value);
  draft.value = next;
  baseline.value = serializeBindingDraft(next);
  problems.value = [];
  candidates.value = { status: "idle", signature: "" };
  status.value = "reset";
}

function removeBinding(): void {
  endTrialForThisObject();
  const result = buildDeleteDataObjectBindingCommand(snapshot.value, props.objectNodeId);
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  const dispatched = props.context.dispatch(result.command);
  if (!dispatched.ok) {
    problems.value = [{ field: "binding", code: "command-failed", message: dispatched.error ?? "" }];
    return;
  }
  const next = createBindingDraft(dispatched.snapshot, props.objectNodeId, fixedQueryId.value);
  draft.value = next;
  baseline.value = serializeBindingDraft(next);
  problems.value = [];
  candidates.value = { status: "idle", signature: "" };
  status.value = "removed";
}

function handleQuerySaved(savedQueryId: string): void {
  endTrialForThisObject();
  const freshSnapshot = props.context.editor.getSnapshot();
  const savedQuery = freshSnapshot.dataSources.queries[savedQueryId] ?? null;
  draft.value = {
    ...draft.value,
    queryId: savedQueryId,
    overrides: draftOverridesForQuery({}, savedQuery),
    details: detailsForQuery([], savedQuery),
    color: colorForQuery(draft.value.color, savedQuery)
  };
  problems.value = [];
  candidates.value = { status: "idle", signature: "" };
  queryEditorOpen.value = false;
}

function queryLabel(item: DataQuery): string {
  return queryOptionLabel(item, snapshot.value);
}

function ruleLabel(index: number): string {
  return t("dataBinding.form.colors.rule", { index: index + 1 });
}
</script>
