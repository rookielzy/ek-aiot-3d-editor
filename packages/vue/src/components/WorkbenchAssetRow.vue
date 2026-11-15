<template>
  <li class="ek-workbench__asset-row" :data-missing="asset.missing ? 'true' : undefined" :data-severity="asset.highestProblemSeverity ?? undefined" :data-status="asset.status" :data-expanded="expanded ? 'true' : undefined">
    <div class="ek-workbench__asset-summary-row">
      <button ref="summary" type="button" class="ek-workbench__asset-summary" :aria-expanded="expanded" :aria-controls="detailId"
        :aria-label="t(expanded ? 'reactWorkbench.leftPanel.assets.details.hide' : 'reactWorkbench.leftPanel.assets.details.show', { assetLabel: asset.label })"
        :title="t('reactWorkbench.leftPanel.assets.details.label', { assetLabel: asset.label })" @click="expanded = !expanded">
        <WorkbenchIcon name="data" />
      </button>
      <div class="ek-workbench__asset-row-main">
        <span class="ek-workbench__asset-label">{{ asset.label }}</span>
        <small>{{ asset.id }}</small>
      </div>
      <CommandMenu ref="menu" :label="menuLabel" :trigger-label="menuLabel" icon="more" compact :commands="commands" :return-focus="() => summary" />
    </div>
    <div class="ek-workbench__asset-meta-row">
      <div class="ek-workbench__asset-badges" :aria-label="t('reactWorkbench.leftPanel.assets.state.label', { assetLabel: asset.label })">
        <span>{{ formatAssetKind(i18n, asset.kind) }}</span>
        <span>{{ formatWorkspaceStatus(i18n, asset.status) }}</span>
        <span>{{ formatPayloadStatus(i18n, asset.payloadStatus) }}</span>
        <span>{{ formatPackageStatus(i18n, asset.packageStatus) }}</span>
        <span v-if="asset.importStatus">{{ formatImportStatus(i18n, asset.importStatus) }}</span>
        <span v-if="!asset.referenced">{{ t('reactWorkbench.leftPanel.assets.unreferenced') }}</span>
      </div>
      <p class="ek-workbench__asset-meta">
        {{ t('reactWorkbench.leftPanel.assets.details.summary', { referenceCount: asset.referenceCount, problemCount: asset.problemCount, payloadStatus: formatPayloadStatus(i18n, asset.payloadStatus) }) }}{{ asset.references.length > 0 ? ` · ${asset.references.map((reference) => reference.labelDescriptor ? t(reference.labelDescriptor) : reference.label).join(', ')}` : '' }}
      </p>
    </div>
    <div v-if="asset.missing && recovery.length > 0" class="ek-workbench__recovery-list" :aria-label="t('reactWorkbench.leftPanel.assets.recovery.label')">
      <label v-for="item in recovery" :key="item.problemId" class="ek-workbench__file-action" :data-severity="item.severity">
        <span>{{ item.actionLabelDescriptor ? t(item.actionLabelDescriptor) : item.actionLabel ?? t('reactWorkbench.leftPanel.assets.replace.label') }}</span>
        <strong>{{ item.label }}</strong>
        <small role="status">{{ recoveryState[item.assetId] ? renderStatusMessage(i18n, recoveryState[item.assetId]!) : item.titleDescriptor ? t(item.titleDescriptor) : item.title }}</small>
        <input type="file" @change="onRecoveryChange(item.assetId, $event)" />
      </label>
    </div>
    <div :id="detailId" class="ek-workbench__asset-details" :hidden="!expanded">
      <dl class="ek-workbench__asset-facts">
        <div><dt>{{ t('reactWorkbench.leftPanel.assets.sort.payload') }}</dt><dd>{{ formatPayloadStatus(i18n, asset.payloadStatus) }}</dd></div>
        <div v-if="asset.payload?.byteSize !== undefined"><dt>{{ t('reactWorkbench.leftPanel.assets.details.byteSize') }}</dt><dd>{{ asset.payload.byteSize }}</dd></div>
        <div v-if="asset.payload?.mimeType"><dt>{{ t('reactWorkbench.leftPanel.assets.details.mimeType') }}</dt><dd>{{ asset.payload.mimeType }}</dd></div>
        <div><dt>{{ t('reactWorkbench.leftPanel.assets.sort.status') }}</dt><dd>{{ asset.importStatus ? formatImportStatus(i18n, asset.importStatus) : t('reactWorkbench.leftPanel.assets.importStatus.notApplicable') }}</dd></div>
      </dl>
      <div class="ek-workbench__asset-refs">
        <h3>{{ t('reactWorkbench.leftPanel.assets.details.references') }}</h3>
        <ul v-if="asset.references.length > 0"><li v-for="(reference, index) in asset.references" :key="`${reference.kind}-${index}`">{{ reference.labelDescriptor ? t(reference.labelDescriptor) : reference.label }}</li></ul>
        <p v-else>{{ t('reactWorkbench.leftPanel.assets.details.noReferences') }}</p>
      </div>
      <template v-if="asset.problems.length > 0">
        <h3>{{ t('reactWorkbench.leftPanel.assets.details.problems') }}</h3>
        <ul class="ek-workbench__asset-diagnostics" :aria-label="t('reactWorkbench.leftPanel.assets.diagnostics.label', { assetLabel: asset.label })">
          <li v-for="problem in asset.problems" :key="problem.id" :data-severity="problem.severity">
            <strong>{{ problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title }}</strong>
            <small v-if="problem.detail || problem.detailDescriptor">{{ problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail }}</small>
          </li>
        </ul>
      </template>
      <p v-if="asset.missing" class="ek-workbench__asset-note" :data-severity="asset.highestProblemSeverity ?? 'warning'">{{ t('reactWorkbench.leftPanel.assets.details.missing') }}</p>
      <label v-if="maintenance" class="ek-workbench__asset-replace">
        <span>{{ maintenance.mode === 'replace' && asset.actionLabelDescriptor ? t(asset.actionLabelDescriptor) : t(maintenance.labelKey) }}</span>
        <small>{{ t(maintenance.hintKey) }}</small>
        <input ref="maintenanceInput" :data-maintenance="maintenance.mode" type="file" :accept="maintenance.mode === 'reimport' ? REIMPORT_ACCEPT : undefined" :aria-label="t(maintenance.ariaKey, { assetLabel: asset.label })" @change="onMaintenanceChange" />
      </label>
    </div>
    <small v-if="status" class="ek-workbench__asset-status" role="status">{{ renderStatusMessage(i18n, status) }}</small>
  </li>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { AssetWorkspaceItem, WorkbenchMissingAssetItem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageValues } from "../i18n/workbench-i18n";
import CommandMenu, { type MenuCommand } from "./ui/CommandMenu.vue";
import WorkbenchIcon from "./WorkbenchIcon.vue";
import { assetMaintenanceAction, formatAssetKind, formatImportStatus, formatPackageStatus, formatPayloadStatus, formatWorkspaceStatus, renderStatusMessage, type AssetRecoveryState, type LocalizedStatusMessage } from "./asset-workspace-status";

const REIMPORT_ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";
const props = defineProps<{
  context: ResolvedWorkbenchContext;
  asset: AssetWorkspaceItem;
  recovery: readonly WorkbenchMissingAssetItem[];
  recoveryState: AssetRecoveryState;
  locate?: boolean;
}>();
const emit = defineEmits<{ picked: [file: File, mode: "replace" | "reimport"]; locateHandled: [] }>();
const expanded = ref(false);
const summary = ref<HTMLButtonElement | null>(null);
const maintenanceInput = ref<HTMLInputElement | null>(null);
const detailId = `asset-${props.asset.id}-details`;
const i18n = computed(() => props.context.i18n);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const maintenance = computed(() => assetMaintenanceAction(props.asset));
const menuLabel = computed(() => t("reactWorkbench.leftPanel.assets.maintenance.menu", { assetLabel: props.asset.label }));
const status = computed<LocalizedStatusMessage | undefined>(() => props.recoveryState[props.asset.id]);
const commands = computed<MenuCommand[]>(() => [
  {
    key: "details",
    label: t(expanded.value ? "reactWorkbench.leftPanel.assets.details.hide" : "reactWorkbench.leftPanel.assets.details.show", { assetLabel: props.asset.label }),
    title: t("reactWorkbench.leftPanel.assets.details.label", { assetLabel: props.asset.label }),
    icon: "data",
    onClick: () => { expanded.value = !expanded.value; }
  },
  maintenance.value ? {
    key: "file",
    label: t(maintenance.value.mode === "reimport" ? "reactWorkbench.leftPanel.assets.maintenance.reimport" : "reactWorkbench.leftPanel.assets.maintenance.replace"),
    title: t(maintenance.value.labelKey),
    icon: "open",
    onClick: async () => { expanded.value = true; await nextTick(); maintenanceInput.value?.focus(); }
  } : {
    key: "none",
    label: t("reactWorkbench.leftPanel.assets.maintenance.empty"),
    title: t("reactWorkbench.leftPanel.assets.maintenance.empty"),
    icon: "data",
    disabled: true,
    onClick: () => undefined
  }
]);

watch(() => props.locate, async (locate) => {
  if (!locate) return;
  emit("locateHandled");
  expanded.value = true;
  await nextTick();
  summary.value?.focus();
  summary.value?.scrollIntoView({ block: "nearest" });
});

function onMaintenanceChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file && maintenance.value) emit("picked", file, maintenance.value.mode);
}

function onRecoveryChange(assetId: string, event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("picked", file, "replace");
}
</script>
