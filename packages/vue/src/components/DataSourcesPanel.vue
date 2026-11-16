<template>
  <section ref="panelRef" class="ek-workbench__data-sources" :aria-label="t('dataSources.panel.label')">
    <div class="ek-workbench__section-header">
      <h2>{{ t("dataSources.panel.label") }}</h2>
      <span>{{ t("dataSources.panel.count", { visibleCount: visibleConnections.length, totalCount: workspace.totalCount }) }}</span>
    </div>

    <div class="ek-workbench__data-controls">
      <button type="button" @click="startNewConnection($event)">{{ t("dataSources.new") }}</button>
      <label class="ek-workbench__field ek-workbench__field--search">
        <span>{{ t("dataSources.search.label") }}</span>
        <input
          type="search"
          :aria-label="t('dataSources.search.label')"
          :placeholder="t('dataSources.search.placeholder')"
          :value="search"
          @input="search = ($event.target as HTMLInputElement).value"
        />
      </label>
    </div>

    <p v-if="status" class="ek-workbench__data-status" role="status">{{ status }}</p>

    <p v-if="workspace.empty" class="ek-workbench__data-empty">
      <strong>{{ t("dataSources.empty.title") }}</strong>
      <span>{{ t("dataSources.empty.description") }}</span>
    </p>
    <p v-else-if="visibleConnections.length === 0" class="ek-workbench__data-empty">
      {{ t("dataSources.noMatches") }}
    </p>

    <ul v-else class="ek-workbench__data-list" :aria-label="t('dataSources.list.label')">
      <li v-for="connection in visibleConnections" :key="connection.id" class="ek-workbench__data-row">
        <article :aria-label="t('dataSources.list.rowLabel', { name: connection.name })">
          <header>
            <strong>{{ connection.name }}</strong>
            <span :data-tone="connection.referenced ? 'active' : 'neutral'">
              {{ connection.referenced ? t("dataSources.list.referenced") : t("dataSources.list.unreferenced") }}
            </span>
          </header>
          <code>{{ connection.baseUrl }}</code>
          <p>{{ authLabel(connection) }}</p>
          <p v-if="connection.credentialHeaderName">
            {{ t("dataSources.list.authHeader", { name: connection.credentialHeaderName }) }}
          </p>
          <p v-if="connection.credentialRef">
            {{ connection.credentialAvailable
              ? t("dataSources.list.credential", { label: connection.credentialLabel ?? connection.credentialRef })
              : t("dataSources.list.credentialMissing") }}
          </p>
          <p>{{ t("dataSources.list.timeout", { seconds: connection.timeoutMs / 1000 }) }}</p>
          <p v-if="connection.headerCount > 0">{{ t("dataSources.list.headers", { count: connection.headerCount }) }}</p>
          <p>{{ t("dataSources.list.queries", { count: connection.queryCount }) }}</p>
          <p>{{ boundObjectsLabel(connection.bindingCount) }}</p>
          <p v-if="appliedNames(connection).length > 0">
            {{ t("dataSources.list.appliedTo", { names: appliedNames(connection).join(", ") }) }}
          </p>

          <div class="ek-workbench__data-row-actions">
            <button type="button" :aria-label="t('dataSources.actions.editAria', { name: connection.name })" @click="startEditConnection(connection.id, $event)">
              {{ t("dataSources.actions.edit") }}
            </button>
            <button type="button" :aria-label="t('dataSources.actions.testAria', { name: connection.name })" @click="startTester(connection.id, $event)">
              {{ t("dataSources.actions.test") }}
            </button>
            <button type="button" :aria-label="t('dataSources.actions.duplicateAria', { name: connection.name })" @click="duplicateConnection(connection.id, $event)">
              {{ t("dataSources.actions.duplicate") }}
            </button>
            <button type="button" :aria-label="t('dataSources.actions.deleteAria', { name: connection.name })" @click="deleteConnection(connection, $event)" :disabled="connection.referenced">
              {{ t("dataSources.actions.delete") }}
            </button>
          </div>
          <p v-if="connection.referenced" class="ek-workbench__request-hint">{{ t("dataSources.delete.referencedReason") }}</p>

          <section class="ek-workbench__data-queries" :aria-label="t('dataSources.queries.listAria', { name: connection.name })">
            <h5>{{ t("dataSources.queries.label") }}</h5>
            <p v-if="connection.queries.length === 0" class="ek-workbench__request-hint">{{ t("dataSources.queries.empty") }}</p>
            <ul>
              <li v-for="query in connection.queries" :key="query.id">
                <div>
                  <strong>{{ query.name }}</strong>
                  <small>{{ queryRequestLabel(query) }}</small>
                  <small>{{ querySummary(query) }}</small>
                  <small v-if="query.bindingCount > 0">{{ boundObjectsLabel(query.bindingCount) }}</small>
                </div>
                <div class="ek-workbench__data-row-actions">
                  <button type="button" :aria-label="t('dataSources.queries.editAria', { name: query.name })" @click="startQueryEditor(connection.id, query.id, $event)">
                    {{ t("dataSources.queries.edit") }}
                  </button>
                  <button type="button" :aria-label="t('dataBinding.queryDialog.openAria', { name: query.name })" @click="openBindings(query.id, $event)">
                    {{ t("dataBinding.queryDialog.open") }}
                  </button>
                  <button type="button" :aria-label="t('dataSources.queries.duplicateAria', { name: query.name })" @click="duplicateQuery(query.id, $event)">
                    {{ t("dataSources.queries.duplicate") }}
                  </button>
                  <button type="button" :aria-label="t('dataSources.queries.deleteAria', { name: query.name })" @click="deleteQuery(query, $event)" :disabled="query.referenced">
                    {{ t("dataSources.queries.delete") }}
                  </button>
                </div>
                <p v-if="query.referenced" class="ek-workbench__request-hint">{{ t("dataSources.queries.deleteReferenced") }}</p>
              </li>
            </ul>
            <button type="button" :aria-label="t('dataSources.queries.newAria', { name: connection.name })" @click="startQueryEditor(connection.id, null, $event)">
              {{ t("dataSources.queries.new") }}
            </button>
          </section>
        </article>
      </li>
    </ul>

    <DataConnectionForm
      v-if="connectionForm"
      ref="connectionFormRef"
      :context="context"
      :connection-id="connectionForm.connectionId"
      @close="closeConnectionForm"
      @saved="onConnectionSaved"
    />

    <div v-if="pendingAction && dirty" class="ek-workbench__connection-discard" role="alertdialog" :aria-label="t('dataSources.form.discard.title')">
      <strong>{{ t("dataSources.form.discard.title") }}</strong>
      <p>{{ t("dataSources.form.discard.description") }}</p>
      <div class="ek-workbench__connection-discard-actions">
        <button ref="keepEditingRef" type="button" @click="keepEditing">{{ t("dataSources.form.discard.keep") }}</button>
        <button type="button" @click="confirmDiscard">{{ t("dataSources.form.discard.confirm") }}</button>
      </div>
    </div>

    <DataQueryEditor
      v-if="queryEditor"
      ref="queryEditorRef"
      :context="context"
      :connection-id="queryEditor.connectionId"
      :query-id="queryEditor.queryId"
      @close="closeQueryEditor"
      @saved="onQuerySaved"
    />

    <DataQueryTester
      v-if="tester"
      ref="testerRef"
      :context="context"
      :connection-id="tester.connectionId"
      @close="closeTester"
    />

    <DataQueryBindingsDialog
      v-if="bindingsQueryId"
      :key="bindingsQueryId"
      :context="context"
      :query-id="bindingsQueryId"
      @close="closeBindings"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS,
  buildDataSourcesWorkspaceModel,
  buildDeleteDataConnectionCommand,
  buildDeleteDataQueryCommand,
  buildDuplicateDataConnectionCommand,
  buildDuplicateDataQueryCommand,
  filterDataConnectionItems,
  type DataConnectionListItem,
  type DataConnectionProblemCode,
  type DataQueryDefinitionProblem,
  type DataQueryListItem,
  type EditorWithGlbImport
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import DataConnectionForm from "./DataConnectionForm.vue";
import DataQueryBindingsDialog from "./DataQueryBindingsDialog.vue";
import DataQueryEditor from "./DataQueryEditor.vue";
import DataQueryTester from "./DataQueryTester.vue";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  locate?: { connectionId: string; queryId: string } | null;
}>();

const emit = defineEmits<{
  locateHandled: [];
}>();

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) =>
  props.context.i18n.t(message, values);

const search = ref("");
const panelRef = ref<HTMLElement | null>(null);
const status = ref("");
const connectionForm = ref<{ connectionId: string | null } | null>(null);
const connectionFormRef = ref<InstanceType<typeof DataConnectionForm> | null>(null);
const queryEditor = ref<{ connectionId: string; queryId: string | null } | null>(null);
const queryEditorRef = ref<InstanceType<typeof DataQueryEditor> | null>(null);
const bindingsQueryId = ref<string | null>(null);
const tester = ref<{ connectionId: string } | null>(null);
const testerRef = ref<InstanceType<typeof DataQueryTester> | null>(null);
const pendingAction = ref<(() => void) | null>(null);
const keepEditingRef = ref<HTMLButtonElement | null>(null);
const dirty = ref(false);
const focusTarget = ref<string | null>(null);
const returnFocus = ref<HTMLElement | null>(null);
const sessionEditor = ref<EditorWithGlbImport>(props.context.editor);

const workspace = computed(() => buildDataSourcesWorkspaceModel(props.context.snapshot, {
  credentials: props.context.editor.getDataCredentials?.() ?? []
}));
const visibleConnections = computed(() => filterDataConnectionItems(workspace.value.connections, { query: search.value }));
const objectNames = computed(() => {
  const names = new Map<string, string>();
  for (const node of Object.values(props.context.snapshot.nodes)) {
    names.set(node.id, node.kind === "object" ? node.name : node.name);
  }
  return names;
});

watch(() => props.context.editor, (editor) => {
  if (editor === sessionEditor.value) {
    return;
  }
  // Drafts, response samples, and tester sessions belong to the editor that opened them.
  sessionEditor.value = editor;
  connectionForm.value = null;
  queryEditor.value = null;
  tester.value = null;
  bindingsQueryId.value = null;
  pendingAction.value = null;
  dirty.value = false;
  status.value = "";
});

watch(
  () => props.locate,
  (locate) => {
    if (!locate) {
      return;
    }
    const query = props.context.snapshot.dataSources.queries[locate.queryId];
    if (!query || query.connectionId !== locate.connectionId) {
      return;
    }
    const open = () => {
      closeSessions();
      queryEditor.value = { connectionId: locate.connectionId, queryId: locate.queryId };
      emit("locateHandled");
    };
    if (hasDirtyDraft()) {
      guardDirty(open);
      return;
    }
    open();
  },
  { immediate: true }
);

watch(focusTarget, async (label) => {
  if (!label) {
    return;
  }
  await nextTick();
  const target = [...(panelRef.value?.querySelectorAll("button") ?? [])]
    .find((button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label);
  target?.focus();
  focusTarget.value = null;
});

async function nextTickFocus(): Promise<void> {
  await nextTick();
  keepEditingRef.value?.focus();
}

function rememberTrigger(event?: Event): void {
  const target = event?.currentTarget;
  if (target instanceof HTMLElement) {
    returnFocus.value = target;
  }
}

function restoreFocus(): void {
  void nextTick(() => returnFocus.value?.focus());
}

function closeConnectionForm(): void {
  // The form asks the panel first so a dirty draft is never dropped silently.
  guardDirty(() => {
    connectionForm.value = null;
    restoreFocus();
  });
}

function guardDirty(action: () => void): void {
  if (hasDirtyDraft()) {
    dirty.value = true;
    pendingAction.value = action;
    void nextTickFocus();
    return;
  }
  action();
}

function hasDirtyDraft(): boolean {
  return connectionFormRef.value?.isDirty() === true
    || queryEditorRef.value?.isDirty() === true
    || testerRef.value?.isDirty() === true;
}

function closeSessions(): void {
  connectionForm.value = null;
  queryEditor.value = null;
  tester.value = null;
  bindingsQueryId.value = null;
}

function requestAction(action: () => void): void {
  guardDirty(action);
}

function keepEditing(): void {
  pendingAction.value = null;
  dirty.value = false;
  void nextTick(() => {
    if (connectionForm.value) {
      connectionFormRef.value?.focusPrimary();
      return;
    }
    if (queryEditor.value) {
      queryEditorRef.value?.focusPrimary();
      return;
    }
    testerRef.value?.focusPrimary();
  });
}

function confirmDiscard(): void {
  const action = pendingAction.value;
  pendingAction.value = null;
  dirty.value = false;
  action?.();
}

function startNewConnection(event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    closeSessions();
    status.value = "";
    connectionForm.value = { connectionId: null };
  });
}

function startEditConnection(connectionId: string, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    closeSessions();
    status.value = "";
    connectionForm.value = { connectionId };
  });
}

function onConnectionSaved(_connectionId: string, created: boolean): void {
  connectionForm.value = null;
  status.value = created ? t("dataSources.status.saved") : t("dataSources.status.updated");
  restoreFocus();
}

function startTester(connectionId: string, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    closeSessions();
    tester.value = { connectionId };
    focusTarget.value = null;
  });
}

function startQueryEditor(connectionId: string, queryId: string | null, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    closeSessions();
    status.value = "";
    queryEditor.value = { connectionId, queryId };
  });
}

function openBindings(queryId: string, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    closeSessions();
    status.value = "";
    bindingsQueryId.value = queryId;
  });
}

function closeQueryEditor(): void {
  const closing = queryEditor.value;
  queryEditor.value = null;
  restoreFocus();
}

function onQuerySaved(_queryId: string, created: boolean): void {
  queryEditor.value = null;
  status.value = created ? t("dataSources.status.querySaved") : t("dataSources.status.queryUpdated");
  restoreFocus();
}

function closeTester(): void {
  requestAction(() => {
    const connectionId = tester.value?.connectionId;
    tester.value = null;
    const connection = connectionId ? props.context.snapshot.dataSources.connections[connectionId] : null;
    if (connection) restoreFocus();
  });
}

function closeBindings(): void {
  const queryId = bindingsQueryId.value;
  bindingsQueryId.value = null;
  const query = queryId ? props.context.snapshot.dataSources.queries[queryId] : null;
  if (query) restoreFocus();
}

function duplicateConnection(connectionId: string, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    const result = buildDuplicateDataConnectionCommand(props.context.snapshot, connectionId);
    if (!result.ok) {
      status.value = result.problems.map((problem) => problemMessage(problem)).join(" ");
      return;
    }
    const previousIds = new Set(Object.keys(props.context.snapshot.dataSources.connections));
    const dispatched = props.context.dispatch(result.command);
    if (!dispatched.ok) {
      status.value = t("dataSources.problem.commandFailed", { detail: dispatched.error ?? "" });
      return;
    }
    const copyId = Object.keys(dispatched.snapshot.dataSources.connections).find((id) => !previousIds.has(id));
    closeSessions();
    status.value = t("dataSources.status.duplicated", {
      name: copyId ? dispatched.snapshot.dataSources.connections[copyId].name : ""
    });
    if (copyId) {
      focusTarget.value = t("dataSources.actions.editAria", { name: dispatched.snapshot.dataSources.connections[copyId].name });
    }
  });
}

function deleteConnection(connection: DataConnectionListItem, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    const result = buildDeleteDataConnectionCommand(props.context.snapshot, connection.id);
    if (!result.ok) {
      status.value = result.problems.map((problem) => problemMessage(problem)).join(" ");
      return;
    }
    const dispatched = props.context.dispatch(result.command);
    if (!dispatched.ok) {
      status.value = t("dataSources.problem.commandFailed", { detail: dispatched.error ?? "" });
      return;
    }
    if (connectionForm.value?.connectionId === connection.id) {
      connectionForm.value = null;
    }
    queryEditor.value = null;
    tester.value = null;
    bindingsQueryId.value = null;
    status.value = t("dataSources.status.deleted", { name: connection.name });
    const nextConnection = Object.values(dispatched.snapshot.dataSources.connections)[0];
    focusTarget.value = nextConnection
      ? t("dataSources.actions.editAria", { name: nextConnection.name })
      : t("dataSources.new");
  });
}

function duplicateQuery(queryId: string, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    const result = buildDuplicateDataQueryCommand(props.context.snapshot, queryId);
    if (!result.ok) {
      status.value = result.problems.map((problem) => queryProblemMessage(problem)).join(" ");
      return;
    }
    const previousIds = new Set(Object.keys(props.context.snapshot.dataSources.queries));
    const dispatched = props.context.dispatch(result.command);
    if (!dispatched.ok) {
      status.value = t("dataSources.queryProblem.commandFailed", { detail: dispatched.error ?? "" });
      return;
    }
    const copyId = Object.keys(dispatched.snapshot.dataSources.queries).find((id) => !previousIds.has(id));
    closeSessions();
    status.value = t("dataSources.status.queryDuplicated", {
      name: copyId ? dispatched.snapshot.dataSources.queries[copyId].name : ""
    });
    if (copyId) {
      focusTarget.value = t("dataSources.queries.editAria", { name: dispatched.snapshot.dataSources.queries[copyId].name });
    }
  });
}

function deleteQuery(query: DataQueryListItem, event?: Event): void {
  rememberTrigger(event);
  requestAction(() => {
    const result = buildDeleteDataQueryCommand(props.context.snapshot, query.id);
    if (!result.ok) {
      status.value = result.problems.map((problem) => queryProblemMessage(problem)).join(" ");
      return;
    }
    const dispatched = props.context.dispatch(result.command);
    if (!dispatched.ok) {
      status.value = t("dataSources.queryProblem.commandFailed", { detail: dispatched.error ?? "" });
      return;
    }
    if (queryEditor.value?.queryId === query.id) {
      queryEditor.value = null;
    }
    connectionForm.value = null;
    tester.value = null;
    bindingsQueryId.value = null;
    status.value = t("dataSources.status.queryDeleted", { name: query.name });
    focusTarget.value = t("dataSources.queries.newAria", { name: props.context.snapshot.dataSources.connections[query.connectionId]?.name ?? "" });
  });
}

function authLabel(connection: DataConnectionListItem): string {
  if (connection.authKind === "bearer") {
    return t("dataSources.list.auth.bearer");
  }
  if (connection.authKind === "api-key") {
    return t("dataSources.list.auth.apiKey");
  }
  return t("dataSources.list.auth.none");
}

function boundObjectsLabel(count: number): string {
  return t(count === 1 ? "dataSources.list.boundObjects.one" : "dataSources.list.boundObjects.other", { count });
}

function appliedNames(connection: DataConnectionListItem): string[] {
  const queryIds = new Set(connection.queries.map((query) => query.id));
  const names: string[] = [];
  for (const binding of Object.values(props.context.snapshot.dataSources.bindings)) {
    if (!queryIds.has(binding.queryId)) {
      continue;
    }
    const name = objectNames.value.get(binding.objectNodeId);
    if (name) {
      names.push(name);
    }
  }
  return [...new Set(names)].sort();
}

function querySummary(query: DataQueryListItem): string {
  return t("dataSources.queries.summary", {
    count: query.propertyCount,
    mode: t(query.mode === "array" ? "dataSources.queries.mode.array" : "dataSources.queries.mode.single")
  });
}

function queryRequestLabel(query: DataQueryListItem): string {
  return `${query.method} · ${query.path || t("dataSources.queries.manual")}`;
}

function problemMessage(problem: { code: keyof typeof CONNECTION_PROBLEM_MESSAGE_KEYS; message: string }): string {
  return t(CONNECTION_PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message });
}

function queryProblemMessage(problem: DataQueryDefinitionProblem): string {
  return t(DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], {
    detail: problem.message,
    parameterName: problem.parameterName ?? "",
    propertyKey: problem.propertyKey ?? ""
  });
}

const CONNECTION_PROBLEM_MESSAGE_KEYS = {
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
</script>
