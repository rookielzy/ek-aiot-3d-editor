<template>
  <section
    v-if="model && visible"
    ref="cardRef"
    class="ek-workbench__detail-card"
    role="region"
    :aria-label="t('dataBinding.card.label')"
    :data-status="model.status"
    :data-freshness="expired ? 'expired' : 'current'"
  >
    <header class="ek-workbench__detail-card-header">
      <div>
        <span class="ek-workbench__detail-card-eyebrow">{{ t("dataBinding.card.title") }}</span>
        <h3>{{ model.objectName }}</h3>
        <small>{{ model.displayName ? `${model.displayName} · ${model.deviceId}` : model.deviceId }}</small>
      </div>
      <button type="button" :aria-label="t('dataBinding.card.close')" @click="closeCard">×</button>
    </header>

    <div class="ek-workbench__detail-card-status">
      <span :data-status="model.paused ? 'paused' : expired ? 'expired' : model.status">{{ t(statusKey) }}</span>
      <small>{{ model.queryName }}</small>
    </div>

    <p class="ek-workbench__detail-card-context">
      {{ t("dataBinding.card.sharedContext", {
        count: contextState?.objectNodeIds.length ?? 1,
        parameters: formatParameters(contextState?.parameters)
      }) }}
    </p>

    <p v-if="loading" class="ek-workbench__detail-card-loading">{{ t("dataBinding.card.status.loading") }}</p>

    <dl v-if="!loading && runtime && model.fields.length > 0" class="ek-workbench__detail-card-fields">
      <div
        v-for="field in model.fields"
        :key="field.key"
        :data-status="field.status"
        :data-field-key="field.key"
        :data-focused="field.key === focusFieldKey ? 'true' : undefined"
        :data-history="field.historyValue !== null ? 'true' : undefined"
      >
        <dt>
          {{ field.label }}<small v-if="field.unit"> · {{ field.unit }}</small>
        </dt>
        <dd>
          <strong>{{ field.displayValue ?? t("dataBinding.card.noValue") }}</strong>
          <small v-for="problem in field.problems" :key="`${problem.code}-${problem.propertyKey ?? ''}`">
            {{ formatMappingProblem(problem) }}
          </small>
          <small v-if="field.historyValue !== null" class="ek-workbench__detail-card-history">
            {{ t("dataBinding.card.lastValue", {
              value: field.historyDisplayValue ?? "",
              time: formatTimestamp(field.historyReceivedAt)
            }) }}
          </small>
        </dd>
      </div>
    </dl>

    <dl v-if="!loading && runtime" class="ek-workbench__detail-card-meta">
      <div>
        <dt>{{ t("dataBinding.card.received") }}</dt>
        <dd>{{ formatTimestamp(model.receivedAt) }}</dd>
      </div>
      <div>
        <dt>{{ t("dataBinding.card.observed") }}</dt>
        <dd>{{ formatTimestamp(model.observedAt) }}</dd>
      </div>
      <div>
        <dt>{{ t("dataBinding.card.quality") }}</dt>
        <dd>{{ model.sourceQuality ? t(QUALITY_MESSAGE_KEYS[model.sourceQuality]) : t("dataBinding.card.unknown") }}</dd>
      </div>
    </dl>

    <p v-if="model.observedAtProblem" class="ek-workbench__detail-card-note">{{ formatMappingProblem(model.observedAtProblem) }}</p>
    <p v-if="model.qualityProblem" class="ek-workbench__detail-card-note">{{ formatMappingProblem(model.qualityProblem) }}</p>
    <p v-if="model.paused" class="ek-workbench__detail-card-note" data-state="paused">
      {{ t("dataBinding.card.authPausedDetail", { status: model.paused.status }) }}
    </p>
    <p v-if="expired" class="ek-workbench__detail-card-note" data-state="expired">
      {{ t("dataBinding.card.expiredDetail", { maxAgeSeconds: Math.max(0, Math.round(model.freshness.maxAgeMs / 1000)) }) }}
    </p>
    <p v-if="model.status === 'error' || model.status === 'missing-device'" class="ek-workbench__detail-card-note">
      {{ t("dataBinding.card.retryHint") }}
    </p>

    <ul v-if="model.problems.length > 0" class="ek-workbench__detail-card-problems" :aria-label="t('dataBinding.card.problems')">
      <li v-for="(problem, index) in model.problems" :key="`${problem.code}-${problem.propertyKey ?? ''}-${index}`">
        {{ formatRuntimeProblem(problem, model.deviceId) }}
      </li>
    </ul>
    <p v-if="!runtime" class="ek-workbench__detail-card-note">{{ t("dataBinding.preview.needsRefresh") }}</p>

    <div class="ek-workbench__detail-card-actions">
      <button type="button" :disabled="context.dataState.preview.refreshing" @click="retry">
        {{ t("dataBinding.card.retry") }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_PROBLEM_MESSAGE_KEYS,
  buildDataObjectDetailModel,
  type DataMappingProblem,
  type DataObjectRuntimeProblem,
  type DataObjectRuntimeStatus,
  type DataParameterValue,
  type DataQuality
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import { formatDataParameters } from "./data-context-format";
import { QUALITY_MESSAGE_KEYS } from "./data-query-ui";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  focusField?: { propertyKey: string } | null;
}>();

const STATUS_MESSAGE_KEYS = {
  inactive: "dataBinding.card.status.inactive",
  loading: "dataBinding.card.status.loading",
  ready: "dataBinding.card.status.ready",
  partial: "dataBinding.card.status.partial",
  "missing-device": "dataBinding.card.status.missingDevice",
  empty: "dataBinding.card.status.empty",
  error: "dataBinding.card.status.error"
} satisfies Record<DataObjectRuntimeStatus, WorkbenchMessageKey>;

const t = (message: WorkbenchMessageKey, values?: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[1]) =>
  props.context.i18n.t(message, values);
const service = computed(() => props.context.editor.getDataService?.() ?? null);
const closedNodeId = ref<string | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const focusFieldKey = computed(() => props.focusField?.propertyKey ?? null);

const selection = computed(() => props.context.selection);
const nodeId = computed(() => selection.value.count === 1 ? selection.value.nodeId : null);
const node = computed(() => nodeId.value ? props.context.snapshot.nodes[nodeId.value] ?? null : null);
const binding = computed(() => nodeId.value ? props.context.snapshot.dataSources.bindings[nodeId.value] ?? null : null);
const runtime = computed(() => nodeId.value ? props.context.dataState.objects[nodeId.value] ?? null : null);
const model = computed(() => nodeId.value && node.value?.kind === "object" && binding.value?.enabled
  ? buildDataObjectDetailModel(props.context.snapshot, nodeId.value, runtime.value)
  : null
);
const visible = computed(() => Boolean(
  service.value &&
  props.context.dataState.preview.enabled &&
  node.value?.kind === "object" &&
  binding.value?.enabled &&
  nodeId.value &&
  closedNodeId.value !== nodeId.value &&
  model.value
));
const loading = computed(() => model.value?.status === "loading");
const contextState = computed(() => model.value?.contextKey
  ? props.context.dataState.contexts[model.value.contextKey] ?? null
  : null
);
const expired = computed(() => Boolean(
  model.value &&
  (model.value.status === "ready" || model.value.status === "partial") &&
  model.value.receivedAt !== null &&
  !model.value.freshness.fresh
));
const statusKey = computed<WorkbenchMessageKey>(() => {
  const currentModel = model.value;
  if (!currentModel) {
    return "dataBinding.preview.idle";
  }
  if (currentModel.paused) {
    return "dataBinding.card.status.authPaused";
  }
  if (currentModel.refreshing && !loading.value) {
    return "dataBinding.card.status.refreshing";
  }
  if (expired.value) {
    return "dataBinding.card.status.expired";
  }
  return runtime.value ? STATUS_MESSAGE_KEYS[currentModel.status] : "dataBinding.preview.idle";
});

// Each locate request may reopen the card, including repeated requests for one field.
watch(
  () => [props.context.dataState.preview.enabled, nodeId.value, service.value, props.focusField] as const,
  () => { closedNodeId.value = null; }
);

watch(
  () => [focusFieldKey.value, nodeId.value, closedNodeId.value] as const,
  async () => {
    if (!focusFieldKey.value) {
      return;
    }
    await nextTick();
    const field = [...cardRef.value?.querySelectorAll<HTMLElement>("[data-field-key]") ?? []]
      .find((candidate) => candidate.dataset.fieldKey === focusFieldKey.value);
    field?.scrollIntoView?.({ block: "nearest" });
  },
  { flush: "post" }
);

function closeCard(): void {
  closedNodeId.value = nodeId.value;
}

function retry(): void {
  void service.value?.refreshPreview();
}

function formatParameters(parameters: Readonly<Record<string, DataParameterValue>> | undefined): string {
  return formatDataParameters(parameters, t("dataBinding.preview.noParameters"));
}

function formatMappingProblem(problem: DataMappingProblem): string {
  return props.context.i18n.t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], {
    propertyKey: problem.propertyKey ?? ""
  });
}

function formatRuntimeProblem(problem: DataObjectRuntimeProblem, deviceId: string): string {
  if (problem.kind === "device") {
    return props.context.i18n.t("dataBinding.card.deviceMissing", { deviceId });
  }
  if (problem.kind === "mapping") {
    const mappingKey = DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code as DataMappingProblem["code"]];
    if (mappingKey) {
      return props.context.i18n.t(mappingKey, { propertyKey: problem.propertyKey ?? "" });
    }
    if (problem.code === "response-empty") {
      return props.context.i18n.t("dataBinding.card.responseEmpty");
    }
    return props.context.i18n.t("dataBinding.card.mappingFailed", { detail: problem.message });
  }
  if (problem.kind === "request") {
    const requestKey = DATA_QUERY_PROBLEM_MESSAGE_KEYS[problem.code as keyof typeof DATA_QUERY_PROBLEM_MESSAGE_KEYS];
    if (requestKey) {
      return props.context.i18n.t(requestKey, { status: problem.status ?? "", detail: problem.message });
    }
    return problem.message;
  }
  if (problem.kind === "parameters") {
    return props.context.i18n.t("dataBinding.card.runtimeParameters", { detail: problem.message });
  }
  return props.context.i18n.t("dataBinding.card.runtimeBinding", { detail: problem.message });
}

function formatTimestamp(milliseconds: number | null): string {
  const fallback = t("dataBinding.card.unknown");
  if (milliseconds === null) {
    return fallback;
  }
  return new Intl.DateTimeFormat(toRaw(props.context.i18n).locale, {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(milliseconds));
}
</script>
