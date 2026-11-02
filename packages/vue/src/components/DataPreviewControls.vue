<template>
  <div v-if="bindings.length > 0 || context.dataState.preview.enabled" class="ek-workbench__data-preview" role="group" :aria-label="t('dataBinding.preview.label')">
    <button
      type="button"
      :aria-pressed="context.dataState.preview.enabled"
      :disabled="enabledBindings === 0 && !context.dataState.preview.enabled"
      @click="togglePreview"
    >{{ t(context.dataState.preview.enabled ? "dataBinding.preview.stop" : "dataBinding.preview.start") }}</button>
    <button
      type="button"
      :disabled="!context.dataState.preview.enabled || context.dataState.preview.refreshing"
      @click="refresh"
    >{{ t("dataBinding.preview.refresh") }}</button>
    <span
      role="status"
      aria-live="polite"
      :data-state="context.dataState.preview.enabled ? statusKey : 'off'"
    >{{ t(statusKey) }}</span>
    <small>{{ t("dataBinding.preview.summary", {
      count: enabledBindings,
      contextCount: context.dataState.preview.contextCount
    }) }}</small>
    <small v-if="lastRefresh">{{ t("dataBinding.preview.lastRefresh", { time: lastRefresh }) }}</small>
    <details v-if="contexts.length > 0" class="ek-workbench__data-preview-contexts">
      <summary>{{ t("dataBinding.preview.contexts", { count: contexts.length }) }}</summary>
      <ul>
        <li v-for="item in contexts" :key="item.key" :data-phase="item.phase">
          <strong>{{ item.queryName }}</strong>
          <span>{{ formatParameters(item.parameters) }}</span>
          <small>{{ t("dataBinding.preview.contextSummary", { count: item.objectNodeIds.length }) }}</small>
          <small>{{ phaseLabel(item) }}</small>
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, toRaw } from "vue";
import type {
  DataObjectContextState,
  DataObjectDataState,
  DataObjectRuntimeState,
  DataParameterValue
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import { formatDataParameters } from "./data-context-format";

type PreviewStatusKey =
  | "dataBinding.preview.off"
  | "dataBinding.preview.refreshing"
  | "dataBinding.preview.noBindings"
  | "dataBinding.preview.needsRefresh"
  | "dataBinding.preview.error"
  | "dataBinding.preview.partial"
  | "dataBinding.preview.empty"
  | "dataBinding.preview.expired"
  | "dataBinding.preview.paused"
  | "dataBinding.preview.ready";

const props = defineProps<{ context: ResolvedWorkbenchContext }>();

const t = (message: WorkbenchMessageKey, values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);
const service = computed(() => props.context.editor.getDataService?.() ?? null);
const bindings = computed(() => Object.values(props.context.snapshot.dataSources.bindings));
const enabledBindings = computed(() => bindings.value.filter((binding) => binding.enabled).length);
const statusKey = computed<PreviewStatusKey>(() => previewStatusKey(props.context.dataState, bindings.value));
const contexts = computed(() => Object.values(props.context.dataState.contexts));
const lastRefresh = computed(() => props.context.dataState.preview.lastRefreshAt === null
  ? null
  : new Date(props.context.dataState.preview.lastRefreshAt).toLocaleTimeString(toRaw(props.context.i18n).locale)
);

function togglePreview(): void {
  if (!service.value) {
    return;
  }
  if (props.context.dataState.preview.enabled) {
    service.value.stopPreview();
  } else {
    void service.value.startPreview();
  }
}

function refresh(): void {
  void service.value?.refreshPreview();
}

function formatParameters(parameters: Readonly<Record<string, DataParameterValue>>): string {
  return formatDataParameters(parameters, t("dataBinding.preview.noParameters"));
}

function phaseLabel(item: DataObjectContextState): string {
  if (item.paused) {
    return t("dataBinding.preview.paused");
  }
  if (item.phase === "waiting" && item.nextRefreshAt === null) {
    return t(item.method === "POST" ? "dataBinding.preview.phase.manual" : "dataBinding.preview.phase.awaitingRetry");
  }
  if (item.nextRefreshAt !== null) {
    return t("dataBinding.preview.nextRefresh", {
      time: new Date(item.nextRefreshAt).toLocaleTimeString(toRaw(props.context.i18n).locale)
    });
  }
  const keys = {
    idle: "dataBinding.preview.phase.idle",
    queued: "dataBinding.preview.phase.queued",
    requesting: "dataBinding.preview.phase.requesting",
    waiting: "dataBinding.preview.phase.waiting",
    paused: "dataBinding.preview.phase.paused"
  } satisfies Record<DataObjectContextState["phase"], WorkbenchMessageKey>;
  return t(keys[item.phase]);
}

function previewStatusKey(
  dataState: DataObjectDataState,
  currentBindings: readonly { objectNodeId: string; enabled: boolean }[]
): PreviewStatusKey {
  if (!dataState.preview.enabled) {
    return "dataBinding.preview.off";
  }
  const enabled = currentBindings.filter((binding) => binding.enabled);
  if (enabled.length === 0) {
    return "dataBinding.preview.noBindings";
  }
  if (dataState.preview.pausedCount > 0) {
    return "dataBinding.preview.paused";
  }
  if (dataState.preview.refreshing) {
    return "dataBinding.preview.refreshing";
  }
  if (enabled.some((binding) => !dataState.objects[binding.objectNodeId])) {
    return "dataBinding.preview.needsRefresh";
  }
  const states = enabled.map((binding) => dataState.objects[binding.objectNodeId]!);
  if (states.some((state) => state.status === "error" || state.status === "missing-device")) {
    return "dataBinding.preview.error";
  }
  if (states.some(isExpired)) {
    return "dataBinding.preview.expired";
  }
  if (states.some((state) => state.status === "partial")) {
    return "dataBinding.preview.partial";
  }
  if (states.some((state) => state.status === "empty")) {
    return "dataBinding.preview.empty";
  }
  return states.every((state) => state.status === "ready")
    ? "dataBinding.preview.ready"
    : "dataBinding.preview.needsRefresh";
}

function isExpired(state: DataObjectRuntimeState): boolean {
  return (state.status === "ready" || state.status === "partial") &&
    state.receivedAt !== null &&
    !state.freshness.fresh;
}
</script>
