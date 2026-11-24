<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowReactive, watch } from "vue";
import {
  buildSetDataDisplayAnchorCommand, formatDataDisplayText, formatDeviceRealtimeField, getDataDisplayAnchorOptions,
  type Command, type DataDeviceListItem, type DataDisplayStyle, type Transform
} from "@ek-aiot/3d-editor-core";
import type { DataDisplayRealtimeContext } from "../composables/use-data-display-realtime";
import { useDeviceEndpoint } from "../composables/use-device-endpoint";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import { resolveDataDisplayMessage } from "../i18n/data-display-i18n";
import InspectorColorInput from "./InspectorColorInput.vue";
import InspectorNumberInput from "./InspectorNumberInput.vue";
import InspectorSelect from "./InspectorSelect.vue";
import InspectorTextInput from "./InspectorTextInput.vue";
import Button from "./ui/Button.vue";
import DeviceMultiSelect from "./ui/DeviceMultiSelect.vue";
import "./data-display.css";

const props = defineProps<{ context: ResolvedWorkbenchContext; data: DataDisplayRealtimeContext; active: boolean }>();
const numericStyleFields = ["width", "height", "fontSize"] as const;
const colorStyleFields = ["backgroundColor", "borderColor", "textColor"] as const;
const affixFields = ["prefix", "suffix"] as const;
const axes = ["X", "Y", "Z"] as const;

function t(key: Parameters<typeof resolveDataDisplayMessage>[1], values?: Parameters<typeof resolveDataDisplayMessage>[2]): string {
  return resolveDataDisplayMessage(props.context.i18n, key, values);
}

const cards = computed(() => props.data.cards.value);
const connections = computed(() => Object.values(props.context.snapshot.dataSources.connections).filter((connection) =>
  connection.deviceEndpoints?.deviceList && connection.deviceEndpoints.deviceRealtime));
const preferredConnection = ref("");
const selections = shallowReactive(new Map<string, DataDeviceListItem[]>());
const listRefresh = ref(0);
const commandError = ref<string>();
const connection = computed(() => connections.value.find((item) => item.id === preferredConnection.value) ?? connections.value[0]);
const connectionId = computed(() => connection.value?.id ?? "");
const selectedDevices = computed({
  get: () => selections.get(connectionId.value) ?? [],
  set: (items) => { selections.set(connectionId.value, items); }
});
const list = useDeviceEndpoint(props.data, () => props.active ? connection.value : undefined, "deviceList", () => listRefresh.value);
const realtime = computed(() => props.data.getResult(connectionId.value));
const browsingConnection = computed(() => props.active && selectedDevices.value.length ? connectionId.value : null);
watch(browsingConnection, (id) => props.data.browse(id), { immediate: true });
onScopeDispose(() => props.data.browse(null));
watch(() => props.context.editor, () => {
  selections.clear();
  preferredConnection.value = "";
  commandError.value = undefined;
});

const card = computed(() => cards.value.find((item) => item.id === props.context.snapshot.selection.nodeId));
const anchorId = computed(() => card.value?.anchorNodeId ?? "");
const anchorOptions = computed(() => getDataDisplayAnchorOptions(props.context.snapshot));
const anchorChoices = computed(() => [
  { value: "", label: t("dataDisplay.unattached"), disabled: true },
  ...(anchorId.value && !anchorOptions.value.some((item) => item.value === anchorId.value)
    ? [{ value: anchorId.value, label: t("dataDisplay.anchorMissing"), disabled: true }] : []),
  ...anchorOptions.value
]);
const pickingCardId = ref<string | null>(null);
const pickingAnchor = computed(() => pickingCardId.value !== null && card.value?.id === pickingCardId.value);
watch([() => props.active, () => card.value?.id, () => props.context.runtime, pickingCardId], ([active, cardId, runtime, pickingId], _, cleanup) => {
  if (!pickingId) return;
  if (!active || pickingId !== cardId) {
    pickingCardId.value = null;
    return;
  }
  const editor = props.context.editor;
  const cancel = runtime?.startDataDisplayAnchorPick?.((nodeId) => {
    pickingCardId.value = null;
    const current = editor.getSnapshot().nodes[pickingId];
    if (nodeId && current?.kind === "data-display") commit(buildSetDataDisplayAnchorCommand(editor, current, nodeId));
  });
  if (cancel) cleanup(cancel);
  if (!cancel) pickingCardId.value = null;
});
const cardConnection = computed(() => card.value && props.context.snapshot.dataSources.connections[card.value.source.connectionId]);
const cardRealtime = computed(() => card.value && props.data.getResult(card.value.source.connectionId));
const cardDevices = useDeviceEndpoint(props.data,
  () => props.active && cardConnection.value?.id !== connectionId.value ? cardConnection.value : undefined, "deviceList");
const cardDevice = computed(() => card.value && cardRealtime.value?.ok
  ? cardRealtime.value.devices.get(card.value.source.deviceId) : undefined);
const cardField = computed(() => cardDevice.value?.data.find((field) => field.key === card.value?.source.fieldKey));
const cardText = computed(() => card.value && formatDataDisplayText(card.value.style,
  formatDeviceRealtimeField(cardDevice.value, card.value.source.fieldKey, { includeUnit: false })));
const quickFillEntries = computed(() => {
  const deviceList = cardConnection.value?.id === connectionId.value ? list.value : cardDevices.value;
  return [
    { key: "deviceName", text: deviceList?.ok ? deviceList.records.find((entry) => entry.deviceId === card.value?.source.deviceId)?.deviceName : undefined },
    { key: "fieldName", text: card.value?.source.fieldKey === null ? t("dataDisplay.runningStatus") : cardField.value?.desc },
    { key: "unit", text: cardField.value?.unit },
    { key: "deviceId", text: card.value?.source.deviceId },
    { key: "fieldKey", text: card.value?.source.fieldKey }
  ] as const;
});
const quickFillOptions = computed(() => [
  { value: "", label: t("dataDisplay.quickFill"), disabled: true },
  ...quickFillEntries.value.map((entry) => ({
    value: entry.key, label: t(`dataDisplay.fill.${entry.key}`), disabled: !entry.text
  }))
]);
const position = computed(() => {
  const feedback = props.context.viewportHelpers.state.snapFeedback;
  return card.value && feedback.nodeId === card.value.id && feedback.mode === "translate"
    ? feedback.snapped ?? feedback.preview ?? card.value.transform.position : card.value?.transform.position;
});
const deviceFields = computed(() => {
  const response = realtime.value;
  if (!response?.ok) return [];
  return selectedDevices.value.map((entry) => {
    const device = response.devices.get(entry.deviceId);
    const fields = device ? [
      { key: null, label: t("dataDisplay.runningStatus") },
      ...device.data.map((field) => ({ key: field.key, label: field.desc }))
    ] : [];
    return {
      entry,
      fields: fields.map((field) => ({
        ...field,
        value: formatDeviceRealtimeField(device, field.key)
      }))
    };
  });
});

function commit(command: Command): boolean {
  const result = props.context.editor.dispatch(command);
  commandError.value = result.ok ? undefined : result.error;
  return result.ok;
}

function selectConnection(id: string): boolean {
  preferredConnection.value = id;
  return true;
}

function addCard(entry: DataDeviceListItem, field: { key: string | null; label: string }): void {
  commit({
    type: "create-data-display",
    source: { connectionId: connectionId.value, deviceId: entry.deviceId, fieldKey: field.key },
    name: `${entry.deviceName} · ${field.label}`,
    position: [0, cards.value.length * 0.7, 0]
  });
}

function updateStyle(style: Partial<DataDisplayStyle>): boolean {
  return !!card.value && commit({ type: "update-data-display-style", nodeId: card.value.id, style });
}

function fillAffix(field: typeof affixFields[number], key: string): boolean {
  const text = quickFillEntries.value.find((entry) => entry.key === key)?.text;
  if (!text) return false;
  const current = card.value?.style[field] ?? "";
  const separator = current && !/\s$/.test(current) ? " " : "";
  return updateStyle({
    [field]: field === "prefix" ? `${current}${separator}${text} ` : `${current || " "}${separator}${text}`
  });
}

function updatePosition(index: number, raw: string): boolean {
  if (!card.value || raw.trim() === "" || !Number.isFinite(Number(raw))) return false;
  const next: Transform["position"] = [...card.value.transform.position];
  next[index] = Number(raw);
  return commit({ type: "set-node-transform", nodeId: card.value.id, transform: { position: next } });
}

function setAnchor(nodeId: string | null): boolean {
  pickingCardId.value = null;
  return !!card.value && commit(buildSetDataDisplayAnchorCommand(props.context.editor, card.value, nodeId));
}
</script>

<template>
  <div class="ek-data-display">
    <template v-if="connections.length">
      <div class="ek-data-display-row">
        <span>{{ t("dataDisplay.source") }}</span>
        <InspectorSelect :aria-label="t('dataDisplay.source')" :value="connectionId"
          :options="connections.map((item) => ({ value: item.id, label: item.name }))" :i18n="context.i18n" :on-commit="selectConnection" />
      </div>
      <template v-if="list?.ok">
        <DeviceMultiSelect :key="connectionId" v-model="selectedDevices" :items="list.records"
          :label="t('dataDisplay.search')" :empty="t('dataDisplay.noDevices')" />
        <div v-if="selectedDevices.length" class="ek-data-display-row">
          <span role="status">{{ t("dataDisplay.selected", { count: selectedDevices.length }) }}</span>
          <Button @click="data.refresh(connectionId)">{{ t("dataDisplay.refresh") }}</Button>
        </div>
      </template>
      <div v-else-if="list" class="ek-data-display-row">
        <span role="alert">{{ t("dataDisplay.loadFailed", { detail: list.message }) }}</span>
        <Button @click="listRefresh++">{{ t("dataDisplay.retry") }}</Button>
      </div>
      <p v-else role="status">{{ t("dataDisplay.loadingDevices") }}</p>
    </template>
    <p v-else>{{ t("dataDisplay.configureSource") }}</p>
    <p v-if="selectedDevices.length && !realtime" role="status">{{ t("dataDisplay.loadingRealtime") }}</p>
    <p v-if="selectedDevices.length && realtime && !realtime.ok" role="alert">
      {{ t("dataDisplay.loadFailed", { detail: realtime.message }) }}
    </p>
    <section v-for="device in deviceFields" :key="device.entry.deviceId" class="ek-data-display-section">
      <div class="ek-data-display-row"><strong>{{ device.entry.deviceName }}</strong><small>{{ device.entry.deviceId }}</small></div>
      <div v-for="field in device.fields" :key="JSON.stringify(field.key)" class="ek-data-display-row">
        <span>{{ field.label }} · {{ field.value ?? "—" }}</span>
        <Button :aria-label="t('dataDisplay.addField', { field: field.label })"
          @click="addCard(device.entry, field)">{{ t("dataDisplay.add") }}</Button>
      </div>
      <p v-if="!device.fields.length">{{ t("dataDisplay.noRealtime") }}</p>
    </section>
    <section class="ek-data-display-section" :aria-label="t('dataDisplay.cards')">
      <strong>{{ t("dataDisplay.cards") }}</strong>
      <div v-for="item in cards" :key="item.id" class="ek-data-display-row">
        <Button class="ek-data-display-card-select" :aria-pressed="item.id === card?.id"
          @click="commit({ type: 'select-node', nodeId: item.id })">{{ item.name }}</Button>
        <Button :aria-label="t('dataDisplay.removeCard', { name: item.name })"
          @click="commit({ type: 'delete-nodes', nodeIds: [item.id] })">{{ t("dataDisplay.remove") }}</Button>
      </div>
      <p v-if="!cards.length">{{ t("dataDisplay.noCards") }}</p>
    </section>
    <section v-if="card && position" :key="card.id" class="ek-data-display-section" :aria-label="t('dataDisplay.style')">
      <div class="ek-data-display-row">
        <strong>{{ card.name }}</strong>
        <Button v-if="cardConnection?.deviceEndpoints?.deviceRealtime"
          @click="data.refresh(cardConnection.id)">{{ t("dataDisplay.refresh") }}</Button>
      </div>
      <p v-if="cardRealtime && !cardRealtime.ok" role="alert">{{ t("dataDisplay.loadFailed", { detail: cardRealtime.message }) }}</p>
      <p v-else :aria-label="t('dataDisplay.preview')" class="ek-data-display-text-preview">
        {{ cardConnection ? cardText : t("dataDisplay.sourceUnavailable") }}
      </p>
      <div v-for="field in affixFields" :key="field" class="ek-data-display-affix">
        <span>{{ t(`dataDisplay.${field}`) }}</span>
        <div class="ek-data-display-row">
          <InspectorTextInput :aria-label="t(`dataDisplay.${field}`)" :value="card.style[field] ?? ''"
            :on-commit="(value) => updateStyle({ [field]: value })" />
          <InspectorSelect :aria-label="t(`dataDisplay.fill.${field}`)" value="" :options="quickFillOptions" :i18n="context.i18n"
            :on-commit="(key) => fillAffix(field, key)" />
        </div>
      </div>
      <label v-for="field in numericStyleFields" :key="field" class="ek-data-display-row">
        <span>{{ t(`dataDisplay.${field}`) }}</span>
        <InspectorNumberInput :aria-label="t(`dataDisplay.${field}`)" :value="card.style[field]" :min="1" :max="2048" :step="1"
          :on-commit="(raw) => raw.trim() !== '' && updateStyle({ [field]: Number(raw) })" />
      </label>
      <div v-for="field in colorStyleFields" :key="field" class="ek-data-display-row">
        <span>{{ t(`dataDisplay.${field}`) }}</span>
        <InspectorColorInput :aria-label="t(`dataDisplay.${field}`)" :value="card.style[field]" :i18n="context.i18n"
          :on-commit="(value) => updateStyle({ [field]: value })" />
      </div>
      <div class="ek-data-display-anchor">
        <strong>{{ t("dataDisplay.anchor") }}</strong>
        <InspectorSelect searchable :aria-label="t('dataDisplay.anchor')" :value="anchorId"
          :options="anchorChoices" :disabled="!anchorOptions.length" :i18n="context.i18n" :on-commit="setAnchor" />
        <div class="ek-data-display-anchor-actions">
          <Button v-if="context.runtime?.startDataDisplayAnchorPick && anchorOptions.length" :aria-pressed="pickingAnchor"
            @click="pickingCardId = pickingAnchor ? null : card.id">
            {{ t(pickingAnchor ? "dataDisplay.cancelAnchorPick" : "dataDisplay.pickAnchor") }}
          </Button>
          <Button v-if="anchorId" @click="setAnchor(null)">{{ t("dataDisplay.detachAnchor") }}</Button>
        </div>
        <p v-if="pickingAnchor" role="status">{{ t("dataDisplay.anchorPickHint") }}</p>
      </div>
      <strong>{{ t(anchorId ? "dataDisplay.localPosition" : "dataDisplay.position") }}</strong>
      <div class="ek-data-display-position">
        <label v-for="(axis, index) in axes" :key="axis">
          {{ axis }}
          <InspectorNumberInput :aria-label="axis" :value="position[index] ?? 0" step="any" :on-commit="(raw) => updatePosition(index, raw)" />
        </label>
      </div>
    </section>
    <p v-if="commandError" role="alert">{{ commandError }}</p>
  </div>
</template>
