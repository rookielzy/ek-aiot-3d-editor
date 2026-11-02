<template>
  <dialog
    v-if="query"
    ref="dialogRef"
    class="ek-workbench__binding-dialog"
    :aria-labelledby="titleId"
    @cancel="handleCancel"
    @keydown.capture="handleKeydown"
  >
    <div :inert="discardOpen ? true : undefined">
      <header class="ek-workbench__binding-dialog-header">
        <h2 :id="titleId">{{ t("dataBinding.queryDialog.title", { name: query.name }) }}</h2>
        <button ref="closeRef" type="button" @click="requestAction(close)">{{ t("dataBinding.queryDialog.close") }}</button>
      </header>

      <p v-if="objectNodes.length === 0" class="ek-workbench__empty">{{ t("dataBinding.queryDialog.noObjects") }}</p>
      <template v-else>
        <p v-if="bindings.length === 0" class="ek-workbench__binding-hint">{{ t("dataBinding.queryDialog.empty") }}</p>
        <div v-else class="ek-workbench__binding-dialog-list">
          <strong>{{ t("dataBinding.queryDialog.list") }}</strong>
          <ul>
            <li v-for="binding in bindings" :key="binding.objectNodeId">
              <span>{{ nodeName(binding.objectNodeId) }}</span>
              <small>{{ binding.deviceId }}</small>
              <button type="button" :aria-label="t('dataBinding.queryDialog.edit', { name: nodeName(binding.objectNodeId) })" @click="selectObject(binding.objectNodeId)">
                {{ t("dataBinding.queryDialog.open") }}
              </button>
              <button type="button" :aria-label="t('dataBinding.queryDialog.selectAria', { name: nodeName(binding.objectNodeId) })" @click="selectInScene(binding.objectNodeId)">
                {{ t("dataBinding.queryDialog.select") }}
              </button>
              <button type="button" :aria-label="t('dataBinding.queryDialog.unbindAria', { name: nodeName(binding.objectNodeId) })" @click="unbind(binding.objectNodeId)">
                {{ t("dataBinding.queryDialog.unbind") }}
              </button>
            </li>
          </ul>
        </div>

        <p v-if="status" class="ek-workbench__data-status" role="status">{{ status }}</p>
        <div v-if="problems.length > 0" class="ek-workbench__binding-problems" role="alert">
          <ul>
            <li v-for="(problem, index) in problems" :key="`${problem.code}-${index}`">{{ problem.message }}</li>
          </ul>
        </div>

        <label class="ek-workbench__field">
          <span>{{ t("dataBinding.queryDialog.object") }}</span>
          <select :aria-label="t('dataBinding.queryDialog.object')" :value="selectedObjectId" @change="selectObject(($event.target as HTMLSelectElement).value)">
            <option value="">{{ t("dataBinding.queryDialog.selectObject") }}</option>
            <option v-for="node in objectNodes" :key="node.id" :value="node.id">{{ node.name }}</option>
          </select>
        </label>

        <DataBindingForm
          v-if="selectedObjectId"
          :key="`${queryId}:${selectedObjectId}`"
          :context="context"
          :object-node-id="selectedObjectId"
          :fixed-query-id="queryId"
          @dirty-change="dirty = $event"
        />
      </template>
    </div>

    <div
      v-if="discardOpen"
      class="ek-workbench__connection-discard"
      role="alertdialog"
      :aria-label="t('dataBinding.queryDialog.discard.title')"
      :aria-describedby="`${titleId}-discard-description`"
    >
      <strong>{{ t("dataBinding.queryDialog.discard.title") }}</strong>
      <p :id="`${titleId}-discard-description`">{{ t("dataBinding.queryDialog.discard.description") }}</p>
      <div class="ek-workbench__connection-discard-actions">
        <button ref="keepEditingRef" type="button" @click="keepEditing">{{ t("dataSources.queryEditor.discard.keep") }}</button>
        <button ref="discardRef" type="button" @click="discardChanges">{{ t("dataSources.queryEditor.discard.confirm") }}</button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { buildDeleteDataObjectBindingCommand, type DataBindingProblem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import DataBindingForm from "./DataBindingForm.vue";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  queryId: string;
}>();

const emit = defineEmits<{ close: [] }>();

const t = (message: WorkbenchMessageKey, values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);
const titleId = useId();
const dialogRef = ref<HTMLDialogElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
const keepEditingRef = ref<HTMLButtonElement | null>(null);
const discardRef = ref<HTMLButtonElement | null>(null);
const dirty = ref(false);
const discardOpen = ref(false);
const status = ref<string | null>(null);
const problems = ref<readonly DataBindingProblem[]>([]);
let pendingAction: (() => void) | null = null;

const query = computed(() => props.context.snapshot.dataSources.queries[props.queryId] ?? null);
const objectNodes = computed(() => Object.values(props.context.snapshot.nodes).filter((node) => node.kind === "object"));
const bindings = computed(() => Object.values(props.context.snapshot.dataSources.bindings)
  .filter((binding) => binding.queryId === props.queryId)
);
const selectedObjectId = ref(
  bindings.value.find((binding) => objectNodes.value.some((node) => node.id === binding.objectNodeId))?.objectNodeId
  ?? objectNodes.value[0]?.id
  ?? ""
);

onMounted(() => {
  const dialog = dialogRef.value;
  if (!dialog || dialog.open) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  closeRef.value?.focus();
});

watch(objectNodes, (nodes) => {
  if (selectedObjectId.value && nodes.some((node) => node.id === selectedObjectId.value)) {
    return;
  }
  dirty.value = false;
  selectedObjectId.value = nodes[0]?.id ?? "";
});

watch(discardOpen, (open) => {
  if (open) {
    keepEditingRef.value?.focus();
    return;
  }
  closeRef.value?.focus();
});

function close(): void {
  emit("close");
}

function requestAction(action: () => void): void {
  if (dirty.value) {
    pendingAction = action;
    discardOpen.value = true;
    return;
  }
  action();
}

function keepEditing(): void {
  pendingAction = null;
  discardOpen.value = false;
}

function discardChanges(): void {
  const action = pendingAction;
  pendingAction = null;
  discardOpen.value = false;
  dirty.value = false;
  action?.();
}

function selectObject(objectNodeId: string): void {
  if (objectNodeId === selectedObjectId.value) {
    return;
  }
  requestAction(() => { selectedObjectId.value = objectNodeId; });
}

function selectInScene(objectNodeId: string): void {
  requestAction(() => {
    props.context.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: [objectNodeId],
      primaryNodeId: objectNodeId
    });
    emit("close");
  });
}

function unbind(objectNodeId: string): void {
  const name = nodeName(objectNodeId);
  requestAction(() => {
    const result = buildDeleteDataObjectBindingCommand(props.context.snapshot, objectNodeId);
    if (!result.ok) {
      problems.value = result.problems;
      return;
    }
    const dispatched = props.context.dispatch(result.command);
    if (!dispatched.ok) {
      problems.value = [{ field: "binding", code: "command-failed", message: dispatched.error ?? "" }];
      return;
    }
    problems.value = [];
    if (objectNodeId === selectedObjectId.value) {
      dirty.value = false;
    }
    status.value = t("dataBinding.queryDialog.unbound", { name });
  });
}

function nodeName(objectNodeId: string): string {
  return objectNodes.value.find((node) => node.id === objectNodeId)?.name ?? objectNodeId;
}

function handleCancel(event: Event): void {
  event.preventDefault();
  if (discardOpen.value) {
    keepEditing();
    return;
  }
  requestAction(close);
}

function handleKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (!discardOpen.value || event.key !== "Tab") {
    return;
  }
  if (event.shiftKey && event.target === keepEditingRef.value) {
    event.preventDefault();
    discardRef.value?.focus();
  }
  if (!event.shiftKey && event.target === discardRef.value) {
    event.preventDefault();
    keepEditingRef.value?.focus();
  }
}
</script>
