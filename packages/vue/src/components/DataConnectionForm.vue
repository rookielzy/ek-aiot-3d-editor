<template>
  <form class="ek-workbench__connection-form" :aria-label="title" novalidate @submit.prevent="save">
    <header class="ek-workbench__connection-form-header">
      <h4>{{ title }}</h4>
      <button type="button" :aria-label="t('dataSources.form.cancel')" @click="emit('close')">×</button>
    </header>

    <label class="ek-workbench__field">
      <span>{{ t("dataSources.form.name") }}</span>
      <input ref="nameInput" type="text" :aria-label="t('dataSources.form.name')" :value="form.name" @input="setName" />
    </label>

    <label class="ek-workbench__field">
      <span>{{ t("dataSources.form.baseUrl") }}</span>
      <input
        type="text"
        :aria-label="t('dataSources.form.baseUrl')"
        :placeholder="t('dataSources.form.baseUrlHint')"
        :value="form.baseUrl"
        @input="setField('baseUrl', $event)"
      />
    </label>

    <label class="ek-workbench__field">
      <span>{{ t("dataSources.form.timeout") }}</span>
      <input
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        :aria-label="t('dataSources.form.timeout')"
        :value="form.timeoutSeconds"
        @input="setField('timeoutSeconds', $event)"
      />
    </label>

    <label class="ek-workbench__field">
      <span>{{ t("dataSources.form.auth") }}</span>
      <select :aria-label="t('dataSources.form.auth')" :value="form.authKind" @change="changeAuth">
        <option value="none">{{ t("dataSources.form.auth.none") }}</option>
        <option value="bearer">{{ t("dataSources.form.auth.bearer") }}</option>
        <option value="api-key">{{ t("dataSources.form.auth.apiKey") }}</option>
      </select>
    </label>

    <template v-if="form.authKind !== 'none'">
      <label class="ek-workbench__field">
        <span>{{ t("dataSources.form.credential") }}</span>
        <select
          :aria-label="t('dataSources.form.credential')"
          :value="form.credentialRef"
          @change="setField('credentialRef', $event)"
        >
          <option value="">{{ t("dataSources.form.credential.placeholder") }}</option>
          <option v-for="credential in credentials" :key="credential.ref" :value="credential.ref">
            {{ credential.available
              ? credential.label
              : t("dataSources.form.credential.unavailable", { label: credential.label }) }}
          </option>
          <option v-if="missingCredentialRef" :value="missingCredentialRef">
            {{ t("dataSources.form.credential.missing", { ref: missingCredentialRef }) }}
          </option>
        </select>
      </label>
      <p v-if="credentials.length === 0" class="ek-workbench__request-hint">
        {{ t("dataSources.form.credential.empty") }}
      </p>
      <label v-if="form.authKind === 'api-key'" class="ek-workbench__field">
        <span>{{ t("dataSources.form.apiKeyHeader") }}</span>
        <input
          type="text"
          :aria-label="t('dataSources.form.apiKeyHeader')"
          :placeholder="t('dataSources.form.apiKeyHeaderHint')"
          :value="form.apiKeyHeader"
          @input="setField('apiKeyHeader', $event)"
        />
      </label>
    </template>

    <fieldset class="ek-workbench__connection-headers">
      <legend>{{ t("dataSources.form.headers") }}</legend>
      <p class="ek-workbench__request-hint">{{ t("dataSources.form.headers.hint") }}</p>
      <p v-if="form.headers.length === 0" class="ek-workbench__request-hint">{{ t("dataSources.form.headers.empty") }}</p>
      <div v-for="(header, index) in form.headers" :key="header.id" class="ek-workbench__connection-header-row">
        <input
          type="text"
          :aria-label="t('dataSources.form.headers.name') + ' ' + (index + 1)"
          :placeholder="t('dataSources.form.headers.name')"
          :value="header.name"
          @input="updateHeader(header.id, 'name', $event)"
        />
        <input
          type="text"
          :aria-label="t('dataSources.form.headers.value') + ' ' + (index + 1)"
          :placeholder="t('dataSources.form.headers.value')"
          :value="header.value"
          @input="updateHeader(header.id, 'value', $event)"
        />
        <button
          type="button"
          :aria-label="t('dataSources.form.headers.removeAria', { index: index + 1 })"
          @click="removeHeader(header.id)"
        >{{ t("dataSources.form.headers.remove") }}</button>
      </div>
      <button type="button" @click="addHeader">{{ t("dataSources.form.headers.add") }}</button>
    </fieldset>

    <div v-if="problems.length > 0" class="ek-workbench__connection-problems" role="alert" :aria-label="t('dataSources.form.problems')">
      <strong>{{ t("dataSources.form.problems") }}</strong>
      <ul>
        <li v-for="(problem, index) in problems" :key="`${problem.code}-${index}`">
          {{ problemMessage(problem) }}
        </li>
      </ul>
    </div>

    <div class="ek-workbench__connection-form-actions">
      <button type="submit">{{ t("dataSources.form.save") }}</button>
      <button type="button" @click="emit('close')">{{ t("dataSources.form.cancel") }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import {
  DEFAULT_API_KEY_HEADER_NAME,
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  buildSaveDataConnectionCommand,
  type DataConnectionAuth,
  type DataConnectionDraft,
  type DataConnectionProblem,
  type DataConnectionProblemCode
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";

interface ConnectionHeaderDraft {
  id: string;
  name: string;
  value: string;
}

interface ConnectionFormState {
  name: string;
  baseUrl: string;
  authKind: DataConnectionAuth["kind"];
  credentialRef: string;
  apiKeyHeader: string;
  timeoutSeconds: string;
  headers: ConnectionHeaderDraft[];
}

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  connectionId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [connectionId: string, created: boolean];
}>();

const PROBLEM_MESSAGE_KEYS = {
  "auth-invalid": "dataSources.problem.authInvalid",
  "base-url-credentials": "dataSources.problem.baseUrlCredentials",
  "base-url-invalid": "dataSources.problem.baseUrlInvalid",
  "base-url-query": "dataSources.problem.baseUrlQuery",
  "base-url-required": "dataSources.problem.baseUrlRequired",
  "command-failed": "dataSources.problem.commandFailed",
  "connection-in-use": "dataSources.problem.connectionInUse",
  "connection-not-found": "dataSources.problem.connectionNotFound",
  "credential-required": "dataSources.problem.credentialRequired",
  "header-reserved": "dataSources.problem.headerReserved",
  "headers-invalid": "dataSources.problem.headersInvalid",
  "name-duplicate": "dataSources.problem.nameDuplicate",
  "name-required": "dataSources.problem.nameRequired",
  "timeout-invalid": "dataSources.problem.timeoutInvalid"
} satisfies Record<DataConnectionProblemCode, WorkbenchMessageKey>;

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) =>
  props.context.i18n.t(message, values);
const nameInput = ref<HTMLInputElement | null>(null);
const problems = ref<DataConnectionProblem[]>([]);
const form = ref<ConnectionFormState>(createFormState(storedConnection()));
let baseline = serializeForm(form.value);
const credentials = computed(() => props.context.editor.getDataCredentials?.() ?? []);
const stored = computed(() => storedConnection());
const title = computed(() =>
  stored.value ? t("dataSources.form.editTitle") : t("dataSources.form.newTitle")
);
const missingCredentialRef = computed(() => {
  const ref = form.value.credentialRef;
  if (!ref || credentials.value.some((credential) => credential.ref === ref)) {
    return "";
  }
  return ref;
});

onMounted(() => {
  void nextTick(() => nameInput.value?.focus());
});

function storedConnection(): DataConnectionDraft | null {
  return props.connectionId ? props.context.snapshot.dataSources.connections[props.connectionId] ?? null : null;
}

function createFormState(connection: DataConnectionDraft | null): ConnectionFormState {
  return {
    name: connection?.name ?? "",
    baseUrl: connection?.baseUrl ?? "",
    authKind: connection?.auth.kind ?? "none",
    credentialRef: connection && connection.auth.kind !== "none" ? connection.auth.credentialRef : "",
    apiKeyHeader: connection?.auth.kind === "api-key" ? connection.auth.headerName : DEFAULT_API_KEY_HEADER_NAME,
    timeoutSeconds: String((connection?.timeoutMs ?? DEFAULT_DATA_CONNECTION_TIMEOUT_MS) / 1000),
    headers: Object.entries(connection?.headers ?? {}).map(([name, value], index) => ({
      id: `connection-header-${index}`,
      name,
      value
    }))
  };
}

function serializeForm(state: ConnectionFormState): string {
  return JSON.stringify({
    name: state.name,
    baseUrl: state.baseUrl,
    authKind: state.authKind,
    credentialRef: state.credentialRef,
    apiKeyHeader: state.apiKeyHeader,
    timeoutSeconds: state.timeoutSeconds,
    headers: state.headers.map(({ name, value }) => ({ name, value }))
  });
}

function setName(event: Event): void {
  form.value = { ...form.value, name: (event.target as HTMLInputElement).value };
}

function setField(field: "baseUrl" | "credentialRef" | "apiKeyHeader" | "timeoutSeconds", event: Event): void {
  form.value = { ...form.value, [field]: (event.target as HTMLInputElement | HTMLSelectElement).value };
}

function changeAuth(event: Event): void {
  form.value = { ...form.value, authKind: (event.target as HTMLSelectElement).value as DataConnectionAuth["kind"] };
}

function addHeader(): void {
  form.value = {
    ...form.value,
    headers: [...form.value.headers, { id: `connection-header-${Date.now()}-${form.value.headers.length}`, name: "", value: "" }]
  };
}

function updateHeader(id: string, field: "name" | "value", event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  form.value = {
    ...form.value,
    headers: form.value.headers.map((header) => header.id === id ? { ...header, [field]: value } : header)
  };
}

function removeHeader(id: string): void {
  form.value = { ...form.value, headers: form.value.headers.filter((header) => header.id !== id) };
}

function problemMessage(problem: DataConnectionProblem): string {
  return t(PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message });
}

function buildDraft(): DataConnectionDraft {
  const auth: DataConnectionAuth = form.value.authKind === "none"
    ? { kind: "none" }
    : form.value.authKind === "bearer"
      ? { kind: "bearer", credentialRef: form.value.credentialRef }
      : { kind: "api-key", credentialRef: form.value.credentialRef, headerName: form.value.apiKeyHeader };
  const headers: Record<string, string> = {};
  for (const header of form.value.headers) {
    if (!header.name && !header.value) {
      continue;
    }
    headers[header.name] = header.value;
  }
  return {
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    auth,
    headers,
    timeoutMs: Number(form.value.timeoutSeconds) * 1000
  };
}

function save(): void {
  problems.value = [];
  const result = buildSaveDataConnectionCommand(props.context.snapshot, buildDraft(), {
    connectionId: props.connectionId
  });
  if (!result.ok) {
    problems.value = result.problems;
    return;
  }
  const dispatched = props.context.dispatch(result.command);
  if (!dispatched.ok) {
    problems.value = [{
      field: "connection",
      code: "command-failed",
      message: dispatched.error ?? ""
    }];
    return;
  }
  baseline = serializeForm(form.value);
  emit("saved", props.connectionId ?? findCreatedConnectionId(dispatched.snapshot.dataSources.connections), props.connectionId === null);
}

function findCreatedConnectionId(connections: Record<string, { id: string }>): string {
  const known = new Set(Object.keys(props.context.snapshot.dataSources.connections));
  return Object.keys(connections).find((id) => !known.has(id)) ?? "";
}

/** Exposed for the panel's dirty-draft guard. */
function isDirty(): boolean {
  return serializeForm(form.value) !== baseline;
}

defineExpose({ isDirty });
</script>
