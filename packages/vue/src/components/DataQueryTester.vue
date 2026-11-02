<template>
  <dialog
    ref="dialogRef"
    class="ek-workbench__request-tester"
    role="dialog"
    aria-modal="true"
    :aria-label="t('dataSources.request.label')"
    @keydown.capture="onKeyDown"
    @cancel.prevent="emit('close')"
  >
    <div class="ek-workbench__query-editor-header">
      <h3>{{ t("dataSources.request.title", { name: connection?.name ?? "" }) }}</h3>
      <button ref="closeButton" type="button" @click="emit('close')">{{ t("dataSources.request.close") }}</button>
    </div>

    <p class="ek-workbench__request-hint">{{ t("dataSources.request.draftHint") }}</p>
    <p class="ek-workbench__request-hint">{{ t("dataSources.request.sessionOnly") }}</p>
    <p v-if="!service" class="ek-workbench__request-warning" role="alert">{{ t("dataSources.request.unavailable") }}</p>
    <p v-else-if="!context.dataServiceState.executorAvailable" class="ek-workbench__request-warning" role="status">
      {{ t("dataSources.request.executorMissing") }}
    </p>

    <form class="ek-workbench__request-form" novalidate @submit.prevent="runRequest">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.request.method") }}</span>
        <select :aria-label="t('dataSources.request.method')" :value="method" @change="changeMethod">
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
      </label>
      <template v-if="method === 'POST'">
        <label class="ek-workbench__request-check">
          <input
            type="checkbox"
            :aria-label="t('dataSources.request.readOnlyConfirm')"
            :checked="readOnly"
            @change="changeReadOnly"
          />
          <span>{{ t("dataSources.request.readOnlyConfirm") }}</span>
        </label>
        <p class="ek-workbench__request-hint">{{ t("dataSources.request.postManualHint") }}</p>
      </template>

      <label class="ek-workbench__field">
        <span>{{ t("dataSources.request.path") }}</span>
        <input
          ref="pathInput"
          type="text"
          :aria-label="t('dataSources.request.path')"
          :placeholder="t('dataSources.request.pathPlaceholder')"
          :value="path"
          @input="changePath"
        />
      </label>

      <div class="ek-workbench__request-preview">
        <span>{{ t("dataSources.request.preview") }}</span>
        <small v-if="!preview.ok">{{ t("dataSources.request.previewPending") }}</small>
        <template v-else>
          <span :data-method="preview.method">{{ preview.method }}</span>
          <code>{{ preview.url }}</code>
          <pre v-if="preview.body !== null" class="ek-workbench__request-payload" :aria-label="t('dataSources.request.bodyPreview')">{{ JSON.stringify(preview.body, null, 2) }}</pre>
        </template>
      </div>

      <fieldset class="ek-workbench__request-parameters">
        <legend>{{ t("dataSources.request.parameters") }}</legend>
        <small v-if="parameters.length === 0">{{ t("dataSources.request.parameters.empty") }}</small>
        <DataQueryParameterRow
          v-for="(parameter, index) in parameters"
          :key="parameter.id"
          :context="context"
          :parameter="parameter"
          :index="index + 1"
          :usage="null"
          @patch="updateParameter(parameter.id, $event)"
          @change-type="changeParameterType(parameter.id, $event)"
          @remove="removeParameter(parameter.id)"
        />
        <button type="button" @click="addParameter">{{ t("dataSources.request.parameters.add") }}</button>
      </fieldset>

      <div class="ek-workbench__request-actions">
        <button type="submit" :disabled="!service || running">{{ t("dataSources.request.run") }}</button>
        <button v-if="running" type="button" @click="cancelRun">{{ t("dataSources.request.cancel") }}</button>
      </div>
    </form>

    <section v-if="run" class="ek-workbench__request-result" :aria-label="t('dataSources.request.result')" :data-status="run.status">
      <header>
        <h4>{{ t("dataSources.request.result") }}</h4>
        <span>{{ t(DATA_QUERY_RUN_STATUS_MESSAGE_KEYS[run.status]) }}</span>
      </header>
      <p>{{ t("dataSources.request.resultRevision", { revision: run.configRevision }) }}</p>
      <dl>
        <dt>{{ t("dataSources.request.summary.method") }}</dt>
        <dd>{{ run.request?.method ?? "" }}</dd>
        <dt>{{ t("dataSources.request.summary.url") }}</dt>
        <dd><code>{{ run.request?.url ?? "" }}</code></dd>
        <dt>{{ t("dataSources.request.summary.parameters") }}</dt>
        <dd>{{ formatRecord(run.request?.parameters) }}</dd>
        <dt>{{ t("dataSources.request.summary.headers") }}</dt>
        <dd>{{ formatRecord(run.request?.headers) }}</dd>
        <dt>{{ t("dataSources.request.summary.body") }}</dt>
        <dd>{{ run.request?.body === null || run.request?.body === undefined ? t("dataSources.request.summary.none") : JSON.stringify(run.request.body, null, 2) }}</dd>
        <dt>{{ t("dataSources.request.summary.credential") }}</dt>
        <dd>{{ run.request?.credentialRef ?? t("dataSources.request.summary.none") }}</dd>
        <dt>{{ t("dataSources.request.summary.timeout") }}</dt>
        <dd>{{ t("dataSources.request.summary.timeoutValue", { milliseconds: run.request?.timeoutMs ?? 0 }) }}</dd>
        <dt>{{ t("dataSources.request.summary.successCondition") }}</dt>
        <dd>{{ formatSuccessCondition(run.request?.successCondition ?? null) }}</dd>
      </dl>

      <div v-if="run.problems.length > 0" class="ek-workbench__connection-problems" role="alert" :aria-label="t('dataSources.request.problems')">
        <strong>{{ t("dataSources.request.problems") }}</strong>
        <ul>
          <li v-for="(problem, index) in run.problems" :key="`${problem.code}-${index}`">
            {{ formatDataQueryProblem(context.i18n, problem) }}
          </li>
        </ul>
      </div>

      <template v-if="run.response">
        <h4>{{ t("dataSources.request.response") }}</h4>
        <dl>
          <dt>{{ t("dataSources.request.response.status") }}</dt>
          <dd>{{ run.response.status ?? "" }}</dd>
          <dt>{{ t("dataSources.request.response.contentType") }}</dt>
          <dd>{{ run.response.contentType ?? "" }}</dd>
          <dt>{{ t("dataSources.request.response.durationValue", { milliseconds: run.elapsedMs ?? 0 }) }}</dt>
          <dd></dd>
        </dl>
        <p v-if="run.response.bodyKind === 'empty'">{{ t("dataSources.request.response.empty") }}</p>
        <template v-else>
          <h5>{{ t("dataSources.request.response.raw") }}</h5>
          <pre class="ek-workbench__request-payload" :aria-label="t('dataSources.request.response.rawLabel')">{{ run.response.bodyText }}</pre>
        </template>
        <template v-if="run.response.bodyKind === 'json'">
          <h5>{{ t("dataSources.request.response.json") }}</h5>
          <pre class="ek-workbench__request-payload" :aria-label="t('dataSources.request.response.jsonLabel')">{{ JSON.stringify(run.response.json, null, 2) }}</pre>
        </template>
      </template>
    </section>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  DATA_QUERY_RUN_STATUS_MESSAGE_KEYS,
  buildSuccessConditionFromForm,
  collectQueryOverrides,
  createQueryFormState,
  createQueryParameterForm,
  formatDataPath,
  queryHeadersToRecord,
  toQueryParameterDrafts,
  type DataParameterType,
  type DataParameterValue,
  type DataQueryMethod,
  type DataQueryRunState,
  type DataSuccessCondition,
  type QueryParameterForm
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageValues } from "../i18n/workbench-i18n";
import DataQueryParameterRow from "./DataQueryParameterRow.vue";
import { buildRequestPreview, formatDataQueryProblem } from "./data-query-ui";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  connectionId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) =>
  props.context.i18n.t(message, values);

const dialogRef = ref<HTMLDialogElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const pathInput = ref<HTMLInputElement | null>(null);
const service = props.context.editor.getDataService?.() ?? null;
const connection = computed(() => props.context.snapshot.dataSources.connections[props.connectionId] ?? null);
const method = ref<DataQueryMethod>("GET");
const readOnly = ref(true);
const path = ref("");
const parameters = ref<QueryParameterForm[]>([]);

const run = computed<DataQueryRunState | null>(() => {
  const state = props.context.dataServiceState.run;
  return state?.connectionId === props.connectionId ? state : null;
});
const running = computed(() => run.value?.status === "running");
const preview = computed(() => buildRequestPreview(props.context.snapshot, props.connectionId, {
  ...createQueryFormState(),
  method: method.value,
  readOnly: readOnly.value,
  path: path.value,
  parameters: parameters.value
}));

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
  service?.invalidateQueryRuns();
  await nextTick();
  pathInput.value?.focus();
});

onBeforeUnmount(() => {
  service?.invalidateQueryRuns();
});

function invalidateRuns(): void {
  service?.invalidateQueryRuns();
}

function changeMethod(event: Event): void {
  const next = (event.target as HTMLSelectElement).value as DataQueryMethod;
  invalidateRuns();
  method.value = next;
  readOnly.value = next === "GET";
  if (next === "GET") {
    parameters.value = parameters.value.map((parameter) =>
      parameter.location === "body" ? { ...parameter, location: "auto" } : parameter
    );
  }
}

function changeReadOnly(event: Event): void {
  invalidateRuns();
  readOnly.value = (event.target as HTMLInputElement).checked;
}

function changePath(event: Event): void {
  invalidateRuns();
  path.value = (event.target as HTMLInputElement).value;
}

function addParameter(): void {
  invalidateRuns();
  parameters.value = [...parameters.value, createQueryParameterForm()];
}

function updateParameter(id: string, patch: Partial<QueryParameterForm>): void {
  invalidateRuns();
  parameters.value = parameters.value.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter);
}

function removeParameter(id: string): void {
  invalidateRuns();
  parameters.value = parameters.value.filter((parameter) => parameter.id !== id);
}

function changeParameterType(id: string, type: DataParameterType): void {
  const initialText = type === "boolean" ? "false" : "";
  updateParameter(id, { type, defaultText: initialText, overrideText: initialText });
}

/**
 * Read-only POST transports values through the body, so keep the draft method
 * and parameter drafts aligned with the editor's saved-query semantics.
 */
async function runRequest(): Promise<void> {
  if (!service || running.value) {
    return;
  }
  service.invalidateQueryRuns();
  await service.executeQueryDraft({
    connectionId: props.connectionId,
    method: method.value,
    readOnly: readOnly.value,
    path: path.value,
    headers: queryHeadersToRecord([]),
    parameters: toQueryParameterDrafts(parameters.value),
    successCondition: buildSuccessConditionFromForm({
      ...createQueryFormState(),
      successPath: "",
      successType: "number",
      successValue: ""
    })
  }, { overrides: collectQueryOverrides(parameters.value) }).result;
}

function cancelRun(): void {
  if (run.value && service) {
    service.cancelQueryRun(run.value.id);
  }
}

function formatRecord(values: Readonly<Record<string, DataParameterValue | string>> | undefined): string {
  return JSON.stringify(values ?? {}, null, 2);
}

function formatSuccessCondition(condition: DataSuccessCondition | null): string {
  if (!condition) {
    return t("dataSources.request.summary.none");
  }
  return `${formatDataPath(condition.path)} = ${String(condition.equals)}`;
}

function onKeyDown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}
</script>
