<template>
  <dialog
    v-if="query"
    ref="dialogRef"
    class="ek-workbench__binding-dialog"
    role="dialog"
    aria-modal="true"
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
        <div class="ek-workbench__binding-dialog-list" role="group" :aria-label="t('dataBinding.queryDialog.list')">
          <strong>{{ t("dataBinding.queryDialog.list") }}</strong>
          <p v-if="bindings.length === 0" class="ek-workbench__binding-hint">{{ t("dataBinding.queryDialog.empty") }}</p>
          <ul v-else>
            <li v-for="binding in bindings" :key="binding.objectNodeId" :data-current="binding.objectNodeId === selectedObjectId ? 'true' : undefined">
              <div class="ek-workbench__binding-dialog-row-name">
                <span>{{ objectLabel(binding.objectNodeId) }}</span>
                <small>{{ binding.deviceId }}</small>
              </div>
              <div class="ek-workbench__binding-dialog-row-actions">
                <button type="button" :aria-pressed="binding.objectNodeId === selectedObjectId" :aria-label="t('dataBinding.queryDialog.edit', { name: objectLabel(binding.objectNodeId) })" @click="selectObject(binding.objectNodeId, $event.currentTarget)">
                  {{ t("dataBinding.queryDialog.editAction") }}
                </button>
                <button type="button" :aria-label="t('dataBinding.queryDialog.locateAria', { name: objectLabel(binding.objectNodeId) })" @click="selectInScene(binding.objectNodeId, $event.currentTarget)">
                  {{ t("dataBinding.queryDialog.locate") }}
                </button>
                <button type="button" :aria-label="t('dataBinding.queryDialog.unbindAria', { name: objectLabel(binding.objectNodeId) })" @click="unbind(binding.objectNodeId, $event.currentTarget)">
                  {{ t("dataBinding.queryDialog.unbind") }}
                </button>
              </div>
            </li>
          </ul>
        </div>

        <p v-if="status" class="ek-workbench__data-status" role="status">{{ status }}</p>
        <div v-if="problems.length > 0" class="ek-workbench__binding-problems" role="alert">
          <ul>
            <li v-for="(problem, index) in problems" :key="`${problem.code}-${index}`">{{ problem.message }}</li>
          </ul>
        </div>

        <section class="ek-workbench__form-section ek-workbench__binding-dialog-target" :aria-label="t('dataBinding.queryDialog.target')">
          <label class="ek-workbench__field">
            <span>{{ t("dataBinding.queryDialog.object") }}</span>
            <select ref="objectRef" :aria-label="t('dataBinding.queryDialog.object')" :value="selectedObjectId" @change="selectObject(($event.target as HTMLSelectElement).value, $event.target)">
              <option value="">{{ t("dataBinding.queryDialog.selectObject") }}</option>
              <option v-for="node in objectNodes" :key="node.id" :value="node.id">{{ node.label }}</option>
            </select>
          </label>
          <div class="ek-workbench__binding-dialog-target-name">
            <small data-tone="target">
              {{ selectedBinding
                ? t("dataBinding.queryDialog.deviceNamed", { deviceId: selectedBinding.deviceId })
                : t("dataBinding.queryDialog.selectObject") }}
            </small>
            <small v-if="selectedBinding" data-tone="stored">
              {{ t("dataBinding.queryDialog.stored") }} · {{ selectedBinding.enabled
                ? t("dataBinding.queryDialog.enabled")
                : t("dataBinding.queryDialog.disabled") }}
            </small>
            <small v-if="dirty" data-tone="draft">{{ t("dataBinding.queryDialog.draft") }}</small>
          </div>
        </section>

        <DataBindingForm
          v-if="selectedObjectId"
          :key="`${queryId}:${selectedObjectId}:${draftRevision}`"
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
      aria-modal="true"
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
import { computed, nextTick, onMounted, ref, useId, watch } from "vue";
import { buildDeleteDataObjectBindingCommand, type DataBindingProblem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import DataBindingForm from "./DataBindingForm.vue";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  queryId: string;
}>();

const emit = defineEmits<{
  close: [];
  located: [node: { nodeId: string; name: string }];
}>();

const t = (message: WorkbenchMessageKey, values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);
const titleId = useId();
const dialogRef = ref<HTMLDialogElement | null>(null);
const objectRef = ref<HTMLSelectElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
const keepEditingRef = ref<HTMLButtonElement | null>(null);
const discardRef = ref<HTMLButtonElement | null>(null);
const dirty = ref(false);
const draftRevision = ref(0);
const discardOpen = ref(false);
const status = ref<string | null>(null);
const problems = ref<readonly DataBindingProblem[]>([]);
let pendingAction: (() => void) | null = null;
let pendingTrigger: HTMLElement | null = null;

const query = computed(() => props.context.snapshot.dataSources.queries[props.queryId] ?? null);
const objectNodes = computed(() => Object.values(props.context.snapshot.nodes)
  .filter((node) => node.kind === "object")
  .map((node) => ({
    id: node.id,
    label: props.context.snapshot.objects[node.objectId]?.asset.label ?? node.name
  })));
const bindings = computed(() => Object.values(props.context.snapshot.dataSources.bindings)
  .filter((binding) => binding.queryId === props.queryId)
);
const selectedObjectId = ref(
  bindings.value.find((binding) => objectNodes.value.some((node) => node.id === binding.objectNodeId))?.objectNodeId
  ?? objectNodes.value[0]?.id
  ?? ""
);
const selectedBinding = computed(() => selectedObjectId.value
  ? props.context.snapshot.dataSources.bindings[selectedObjectId.value] ?? null
  : null);

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
  objectRef.value?.focus();
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
  void nextTick(() => {
    const target = pendingTrigger?.isConnected ? pendingTrigger : objectRef.value;
    target?.focus();
    pendingTrigger = null;
  });
});

function close(): void {
  emit("close");
}

function requestAction(action: () => void, trigger?: EventTarget | null): void {
  if (dirty.value) {
    pendingAction = action;
    pendingTrigger = trigger instanceof HTMLElement
      ? trigger
      : document.activeElement instanceof HTMLElement ? document.activeElement : closeRef.value;
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
  draftRevision.value += 1;
  action?.();
}

function selectObject(objectNodeId: string, trigger?: EventTarget | null): void {
  if (objectNodeId === selectedObjectId.value) {
    return;
  }
  requestAction(() => { selectedObjectId.value = objectNodeId; }, trigger);
}

function selectInScene(objectNodeId: string, trigger?: EventTarget | null): void {
  requestAction(() => {
    props.context.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: [objectNodeId],
      primaryNodeId: objectNodeId
    });
    emit("located", { nodeId: objectNodeId, name: objectLabel(objectNodeId) });
  }, trigger);
}

function unbind(objectNodeId: string, trigger?: EventTarget | null): void {
  const name = objectLabel(objectNodeId);
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
    } else {
      pendingTrigger = objectRef.value;
    }
    status.value = t("dataBinding.queryDialog.unbound", { name });
  }, trigger);
}

function objectLabel(objectNodeId: string): string {
  return objectNodes.value.find((node) => node.id === objectNodeId)?.label ?? objectNodeId;
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
  if (event.target instanceof Element && event.target.closest("dialog") !== event.currentTarget) {
    return;
  }
  event.stopPropagation();
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (discardOpen.value) {
      keepEditing();
      return;
    }
    requestAction(close);
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  const focusable = [...dialog.querySelectorAll<HTMLElement>(
    "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]"
  )].filter((element) => element.tabIndex >= 0 && !element.closest("[inert], [hidden], [aria-hidden='true']"));
  const first = discardOpen.value ? keepEditingRef.value : focusable[0];
  const last = discardOpen.value ? discardRef.value : focusable.at(-1);
  if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) {
    event.preventDefault();
    last?.focus();
    return;
  }
  if (!event.shiftKey && (event.target === last || event.target === event.currentTarget)) {
    event.preventDefault();
    first?.focus();
  }
}
</script>
