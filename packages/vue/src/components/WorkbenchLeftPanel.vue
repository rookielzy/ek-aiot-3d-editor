<template>
  <div class="ek-workbench__default-left-panel">
    <section class="ek-workbench__panel-section" :aria-label="t('reactWorkbench.leftPanel.hierarchy.label')" :hidden="activeView !== 'scene'">
      <div class="ek-workbench__section-header">
        <h2>{{ t("reactWorkbench.leftPanel.hierarchy.label") }}</h2>
        <span>{{ t("reactWorkbench.leftPanel.hierarchy.count", { selectedCount: model.hierarchy.selectedCount, totalCount: model.hierarchy.totalCount }) }}</span>
      </div>
      <WorkbenchHierarchy :context="context" />
    </section>

    <section class="ek-workbench__panel-section" :aria-label="t('reactWorkbench.leftPanel.assets.label')" :hidden="activeView !== 'assets'">
      <template v-if="activeView === 'assets'">
        <div class="ek-workbench__section-header">
          <h2>{{ t("reactWorkbench.leftPanel.assets.label") }}</h2>
          <span>{{ visibleAssets.length }}/{{ workspace?.totalCount ?? model.assets.totalCount }}</span>
        </div>
        <div
          class="ek-workbench__asset-import"
          :data-drag-active="dragActive ? 'true' : undefined"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent
          @dragleave="dragActive = false"
          @drop="onDrop"
        >
          <label class="ek-workbench__asset-import-button">
            <span>{{ t("reactWorkbench.leftPanel.assets.import.label") }}</span>
            <small>{{ t("reactWorkbench.leftPanel.assets.import.hint") }}</small>
            <input :aria-label="t('reactWorkbench.leftPanel.assets.import.label')" type="file" multiple @change="onImportChange" />
          </label>
          <label class="ek-workbench__field">
            <span>{{ t("reactWorkbench.leftPanel.assets.rasterIntent.label") }}</span>
            <select v-model="rasterKind" :aria-label="t('reactWorkbench.leftPanel.assets.rasterIntent.label')">
              <option value="texture">{{ t("reactWorkbench.leftPanel.assets.rasterIntent.texture") }}</option>
              <option value="image">{{ t("reactWorkbench.leftPanel.assets.rasterIntent.image") }}</option>
            </select>
          </label>
        </div>
        <div class="ek-workbench__asset-controls" :aria-label="t('reactWorkbench.leftPanel.assets.controls.label')">
          <label class="ek-workbench__field ek-workbench__field--search">
            <span>{{ t("reactWorkbench.leftPanel.assets.search.label") }}</span>
            <input
              type="search"
              v-model="assetQuery"
              :aria-label="t('reactWorkbench.leftPanel.assets.search.label')"
              :placeholder="t('reactWorkbench.leftPanel.assets.search.placeholder')"
            />
          </label>
          <label class="ek-workbench__field">
            <span>{{ t("reactWorkbench.leftPanel.assets.kind.label") }}</span>
            <select v-model="assetKind" :aria-label="t('reactWorkbench.leftPanel.assets.kind.label')">
              <option value="all">{{ t("reactWorkbench.leftPanel.assets.kind.all") }}</option>
              <option value="glb">{{ t("reactWorkbench.leftPanel.assets.kind.glb") }}</option>
              <option value="hdr">{{ t("reactWorkbench.leftPanel.assets.kind.hdr") }}</option>
              <option value="texture">{{ t("reactWorkbench.leftPanel.assets.kind.texture") }}</option>
              <option value="image">{{ t("reactWorkbench.leftPanel.assets.kind.image") }}</option>
            </select>
          </label>
          <label class="ek-workbench__field">
            <span>{{ t("reactWorkbench.leftPanel.assets.status.label") }}</span>
            <select v-model="assetStatus" :aria-label="t('reactWorkbench.leftPanel.assets.status.label')">
              <option value="all">{{ t("reactWorkbench.leftPanel.assets.status.all") }}</option>
              <option value="ready">{{ t("reactWorkbench.leftPanel.assets.status.ready") }}</option>
              <option value="missing-payload">{{ t("reactWorkbench.leftPanel.assets.status.missingPayload") }}</option>
              <option value="missing-reference">{{ t("reactWorkbench.leftPanel.assets.status.missingReference") }}</option>
              <option value="has-problems">{{ t("reactWorkbench.leftPanel.assets.status.hasProblems") }}</option>
              <option value="unreferenced">{{ t("reactWorkbench.leftPanel.assets.status.unreferenced") }}</option>
            </select>
          </label>
          <label class="ek-workbench__field ek-workbench__field--sort">
            <span>{{ t("reactWorkbench.leftPanel.assets.sort.label") }}</span>
            <select v-model="assetSort" :aria-label="t('reactWorkbench.leftPanel.assets.sort.label')">
              <option value="status">{{ t("reactWorkbench.leftPanel.assets.sort.status") }}</option>
              <option value="label">{{ t("reactWorkbench.leftPanel.assets.sort.byLabel") }}</option>
              <option value="kind">{{ t("reactWorkbench.leftPanel.assets.sort.kind") }}</option>
              <option value="referenced">{{ t("reactWorkbench.leftPanel.assets.sort.referenced") }}</option>
              <option value="payload">{{ t("reactWorkbench.leftPanel.assets.sort.payload") }}</option>
              <option value="severity">{{ t("reactWorkbench.leftPanel.assets.sort.severity") }}</option>
            </select>
          </label>
        </div>
        <ul v-if="queue.length > 0" class="ek-workbench__asset-queue" tabindex="0" aria-live="polite" :aria-label="t('reactWorkbench.leftPanel.assets.queue.label')">
          <li v-for="item in queue" :key="item.id" :data-status="item.status">
            <span>{{ item.label }}</span>
            <small>
              {{ queueStatusLabel(item.status) }}{{ item.kind ? ` · ${formatAssetKind(item.kind)}` : "" }}{{ item.detail ? ` · ${renderStatusMessage(item.detail)}` : "" }}
            </small>
            <em v-if="item.diagnostics.length > 0">{{ item.diagnostics.map(formatImportDiagnostic).join("; ") }}</em>
          </li>
        </ul>
        <p v-if="!workspace || workspace.totalCount === 0" class="ek-workbench__empty">{{ t("reactWorkbench.leftPanel.assets.empty") }}</p>
        <p v-else-if="visibleAssets.length === 0" class="ek-workbench__empty" role="status">{{ t("reactWorkbench.leftPanel.assets.noMatches") }}</p>
        <ul v-else class="ek-workbench__asset-list" :aria-label="t('reactWorkbench.leftPanel.assets.rows.label')">
          <li
            v-for="asset in visibleAssets"
            :key="asset.id"
            class="ek-workbench__asset-row"
            :data-missing="asset.missing ? 'true' : undefined"
            :data-severity="asset.highestProblemSeverity ?? undefined"
            :data-status="asset.status"
          >
            <div class="ek-workbench__asset-row-main">
              <span>{{ asset.label }}</span>
              <small>{{ asset.id }}</small>
            </div>
            <div class="ek-workbench__asset-badges" :aria-label="t('reactWorkbench.leftPanel.assets.state.label', { assetLabel: asset.label })">
              <span>{{ formatAssetKind(asset.kind) }}</span>
              <span>{{ formatWorkspaceStatus(asset.status) }}</span>
              <span>{{ formatPayloadStatus(asset.payloadStatus) }}</span>
              <span>{{ formatPackageStatus(asset.packageStatus) }}</span>
              <span v-if="asset.importStatus">{{ formatImportStatus(asset.importStatus) }}</span>
            </div>
            <p class="ek-workbench__asset-meta">
              {{ asset.referenced ? t("reactWorkbench.leftPanel.assets.refs", { count: asset.referenceCount }) : t("reactWorkbench.leftPanel.assets.unreferenced") }}{{ asset.references.length > 0 ? ` · ${asset.references.map((reference) => reference.labelDescriptor ? t(reference.labelDescriptor) : reference.label).join(", ")}` : "" }}{{ asset.problemCount ? ` · ${t("reactWorkbench.leftPanel.assets.problemCount", { count: asset.problemCount })}` : "" }}
            </p>
            <ul v-if="asset.problems.length > 0" class="ek-workbench__asset-diagnostics" :aria-label="t('reactWorkbench.leftPanel.assets.diagnostics.label', { assetLabel: asset.label })">
              <li v-for="problem in asset.problems" :key="problem.id" :data-severity="problem.severity">
                <strong>{{ problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title }}</strong>
                <small v-if="problem.detail">{{ problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail }}</small>
              </li>
            </ul>
            <label v-if="asset.kind === 'glb' && asset.registered" class="ek-workbench__asset-replace">
              <span>{{ t("reactWorkbench.leftPanel.assets.reimport.label") }}</span>
              <small role="status">{{ recoveryStatusLabel(asset.id, "reactWorkbench.leftPanel.assets.reimport.hint") }}</small>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                :aria-label="t('reactWorkbench.leftPanel.assets.reimport.aria', { assetLabel: asset.label })"
                @change="maintainAsset(asset.id, $event, 'reimport')"
              />
            </label>
            <label v-else-if="asset.registered" class="ek-workbench__asset-replace">
              <span>{{ asset.actionLabelDescriptor ? t(asset.actionLabelDescriptor) : asset.actionLabel ?? t("reactWorkbench.leftPanel.assets.replace.label") }}</span>
              <small role="status">{{ recoveryStatusLabel(asset.id, "reactWorkbench.leftPanel.assets.replace.hint") }}</small>
              <input type="file" :aria-label="t('reactWorkbench.leftPanel.assets.replace.aria', { assetLabel: asset.label })" @change="maintainAsset(asset.id, $event, 'replace')" />
            </label>
          </li>
        </ul>
        <div v-if="model.assets.missing.length > 0" class="ek-workbench__recovery-list" :aria-label="t('reactWorkbench.leftPanel.assets.recovery.label')">
          <label
            v-for="item in model.assets.missing"
            :key="item.problemId"
            class="ek-workbench__file-action"
            :data-severity="item.severity"
          >
            <span>{{ item.actionLabelDescriptor ? t(item.actionLabelDescriptor) : item.actionLabel ?? t("reactWorkbench.leftPanel.assets.replace.label") }}</span>
            <strong>{{ item.label }}</strong>
            <small role="status">{{ recoveryState[item.assetId] ? renderStatusMessage(recoveryState[item.assetId]!) : (item.titleDescriptor ? t(item.titleDescriptor) : item.title) }}</small>
            <input type="file" @change="maintainAsset(item.assetId, $event, 'replace')" />
          </label>
        </div>
        <div v-if="Object.keys(recoverySuccessState).length > 0" class="ek-workbench__recovery-list" :aria-label="t('reactWorkbench.leftPanel.assets.recovery.status.label')">
          <div
            v-for="[assetId, status] in Object.entries(recoverySuccessState)"
            :key="assetId"
            class="ek-workbench__file-action"
            data-severity="success"
          >
            <span>{{ t("reactWorkbench.leftPanel.assets.recovery.success.label") }}</span>
            <strong>{{ assetId }}</strong>
            <small>{{ renderStatusMessage(status) }}</small>
          </div>
        </div>
      </template>
    </section>

    <section class="ek-workbench__panel-section" :aria-label="t('dataSources.panel.label')" :hidden="activeView !== 'data'">
      <DataSourcesPanel :context="context" :locate="dataLocate ?? null" @locate-handled="emit('dataLocateHandled')" />
    </section>

    <section class="ek-workbench__panel-section" :aria-label="t('reactWorkbench.leftPanel.project.label')" :hidden="activeView !== 'project'">
      <template v-if="activeView === 'project'">
        <div class="ek-workbench__section-header">
          <h2>{{ t("reactWorkbench.leftPanel.project.label") }}</h2>
          <span>{{ t(model.project.statusLabelDescriptor ?? { key: "workbench.project.status.partial.label", fallback: model.project.statusLabel }) }}</span>
        </div>
        <dl class="ek-workbench__summary-list">
          <div>
            <dt>{{ t("reactWorkbench.leftPanel.project.scene") }}</dt>
            <dd>{{ model.project.sceneName }}</dd>
          </div>
          <div>
            <dt>{{ t("reactWorkbench.leftPanel.project.nodes") }}</dt>
            <dd>{{ model.project.nodeCount }}</dd>
          </div>
          <div>
            <dt>{{ t("reactWorkbench.leftPanel.project.objects") }}</dt>
            <dd>{{ model.project.objectCount }}</dd>
          </div>
          <div>
            <dt>{{ t("reactWorkbench.leftPanel.project.lights") }}</dt>
            <dd>{{ model.project.lightCount }}</dd>
          </div>
          <div>
            <dt>{{ t("reactWorkbench.leftPanel.project.assets") }}</dt>
            <dd>{{ model.project.assetCount }}</dd>
          </div>
        </dl>
        <ul v-if="model.problems.totalCount > 0" class="ek-workbench__problem-list" :aria-label="t('reactWorkbench.leftPanel.project.problems.label')">
          <li
            v-for="problem in model.problems.items.slice(0, 4)"
            :key="problem.id"
            :data-severity="problem.severity"
          >
            <span>{{ problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title }}</span>
            <small>
              {{ problem.severity }}{{ problem.assetId ? ` · ${problem.assetId}` : "" }}{{ problem.actionLabel ? ` · ${problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel}` : "" }}
            </small>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  filterAssetWorkspaceItems,
  createDisplayMessageDescriptor,
  sortAssetWorkspaceItems,
  type AssetKind,
  type AssetWorkspacePackageStatus,
  type AssetWorkspacePayloadStatus,
  type AssetWorkspaceSortKey,
  type AssetWorkspaceStatus,
  type GlbImportDiagnostic,
  type GlbImportStatus,
  type MessageDescriptor,
  type ProjectProblem,
  type WorkbenchAssetImportDiagnostic,
  type WorkbenchRasterImportKind
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchHierarchy from "./WorkbenchHierarchy.vue";
import DataSourcesPanel from "./DataSourcesPanel.vue";

type LocalizedStatusMessage =
  | {
      kind: "message";
      key: WorkbenchMessageKey;
      fallback: string;
      values?: WorkbenchMessageValues;
    }
  | {
      kind: "descriptor";
      descriptor: MessageDescriptor;
    }
  | {
      kind: "raw";
      value: string;
    };

type AssetRecoveryState = Record<string, LocalizedStatusMessage>;
type AssetQueueStatus = "queued" | "importing" | "succeeded" | "failed";
type AssetStatusFilter = "all" | AssetWorkspaceStatus;
type AssetKindFilter = "all" | AssetKind;

interface AssetQueueItem {
  id: string;
  label: string;
  kind?: AssetKind;
  status: AssetQueueStatus;
  detail?: LocalizedStatusMessage;
  diagnostics: WorkbenchAssetImportDiagnostic[];
}

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  activeView: "scene" | "assets" | "data" | "project";
  dataLocate?: { connectionId: string; queryId: string } | null;
}>();

const emit = defineEmits<{
  dataLocateHandled: [];
}>();

const recoveryState = reactive<AssetRecoveryState>({});
const recoverySuccessState = reactive<AssetRecoveryState>({});
const maintenanceTokens = new Map<string, symbol>();
const pendingMaintenance = new Map<string, Promise<void>>();
const assetQuery = ref("");
const assetKind = ref<AssetKindFilter>("all");
const assetStatus = ref<AssetStatusFilter>("all");
const assetSort = ref<AssetWorkspaceSortKey>("status");
const rasterKind = ref<WorkbenchRasterImportKind>("texture");
let nextQueueId = 0;
const queue = ref<AssetQueueItem[]>([]);
const dragActive = ref(false);

const model = computed(() => props.context.model);
const workspace = computed(() => model.value.assets.workspace);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const workspaceAssetIds = computed(() => new Set(workspace.value?.items.map((asset) => asset.id) ?? []));
const projectAssetKey = computed(() => [
  props.context.snapshot.scene.id,
  ...Object.keys(props.context.snapshot.assets).sort()
].join("\u0000"));
const visibleAssets = computed(() => {
  const filtered = filterAssetWorkspaceItems(workspace.value?.items ?? [], {
    query: assetQuery.value,
    kinds: assetKind.value === "all" ? undefined : [assetKind.value],
    statuses: assetStatus.value === "all" ? undefined : [assetStatus.value]
  });
  return sortAssetWorkspaceItems(filtered, { key: assetSort.value });
});

watch(
  () => ({
    editor: props.context.editor,
    projectAssetKey: projectAssetKey.value,
    workspaceVersion: props.context.assets.workspaceVersion
  }),
  (next, previous) => {
    if (previous && (next.editor !== previous.editor || next.projectAssetKey !== previous.projectAssetKey)) {
      for (const assetId of Object.keys(recoverySuccessState)) {
        delete recoverySuccessState[assetId];
      }
      maintenanceTokens.clear();
      pendingMaintenance.clear();
      for (const assetId of Object.keys(recoveryState)) {
        delete recoveryState[assetId];
      }
      return;
    }
    const assetIds = workspaceAssetIds.value;
    for (const assetId of Object.keys(recoverySuccessState)) {
      if (!assetIds.has(assetId)) {
        delete recoverySuccessState[assetId];
      }
    }
    for (const assetId of Object.keys(recoveryState)) {
      if (!assetIds.has(assetId)) {
        delete recoveryState[assetId];
      }
    }
    for (const assetId of maintenanceTokens.keys()) {
      if (!assetIds.has(assetId)) {
        maintenanceTokens.delete(assetId);
        pendingMaintenance.delete(assetId);
      }
    }
  },
  { flush: "post" }
);

async function importAssetFiles(files: readonly File[]): Promise<void> {
  if (files.length === 0) {
    return;
  }
  const queueItems = files.map((file) => ({
    id: String(nextQueueId++),
    label: file.name,
    status: "queued" as const,
    diagnostics: []
  }));
  queue.value = [...queueItems, ...queue.value];
  queue.value = queue.value.map((item) =>
    queueItems.some((queued) => queued.id === item.id) ? { ...item, status: "importing" } : item
  );

  let results;
  try {
    results = await props.context.assets.importFiles({
      rasterKind: rasterKind.value,
      files: files.map((file) => ({
        name: file.name,
        mimeType: file.type,
        source: file
      }))
    });
  } catch (error) {
    queue.value = queue.value.map((item) =>
      queueItems.some((queued) => queued.id === item.id)
        ? {
            ...item,
            status: "failed",
            detail: rawStatusMessage(error instanceof Error ? error.message : String(error)),
            diagnostics: []
          }
        : item
    );
    return;
  }
  const resultsByQueueId = new Map(queueItems.map((item, index) => [item.id, results[index]]));
  queue.value = queue.value.map((item) => {
    const result = resultsByQueueId.get(item.id);
    if (!result) {
      return item;
    }
    return {
      ...item,
      kind: result.kind,
      status: result.status,
      detail: result.status === "succeeded"
        ? result.assetId
          ? localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.importedAsset", "Imported {assetId}", { assetId: result.assetId })
          : localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.imported", "Imported")
        : diagnosticStatusMessage(result.diagnostics[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.failedDetail", "Import failed"),
      diagnostics: result.diagnostics
    };
  });
}

function onImportChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  void importAssetFiles(files);
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragActive.value = false;
  void importAssetFiles(Array.from(event.dataTransfer?.files ?? []));
}

async function maintainAsset(assetId: string, event: Event, mode: "replace" | "reimport"): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  const recoveringMissing = model.value.assets.missing.some((item) => item.assetId === assetId);
  const token = Symbol(assetId);
  maintenanceTokens.set(assetId, token);
  delete recoverySuccessState[assetId];
  recoveryState[assetId] = mode === "reimport"
    ? localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.progress", "Analyzing GLB...")
    : localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...");

  const previous = pendingMaintenance.get(assetId);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  pendingMaintenance.set(assetId, pending);
  try {
    if (previous) {
      await previous;
    }
    if (maintenanceTokens.get(assetId) !== token) {
      return;
    }

    let message: LocalizedStatusMessage;
    let replaced = false;
    try {
      if (mode === "reimport") {
        const result = await props.context.assets.reimportGlbAsset({ assetId, source: file });
        message = result.ok
          ? reimportSummaryStatusMessage(file.name, result.remap?.summary)
          : glbDiagnosticStatusMessage(result.diagnostics[0]) ??
            (result.commandResult?.error ? rawStatusMessage(result.commandResult.error) : localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.failed", "Reimport failed"));
      } else {
        const result = await props.context.assets.replaceAsset({
          assetId,
          source: file,
          label: file.name,
          mimeType: file.type
        });
        if (result.ok) {
          await props.context.runtime?.project();
          replaced = true;
        }
        message = result.ok
          ? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.success", "Replaced with {fileName}", { fileName: file.name })
          : projectProblemStatusMessage(result.problems[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.failed", "Replacement failed");
      }
      props.context.refreshProblems();
    } catch (error) {
      message = rawStatusMessage(error instanceof Error ? error.message : String(error));
    }
    if (maintenanceTokens.get(assetId) !== token) {
      return;
    }
    maintenanceTokens.delete(assetId);
    recoveryState[assetId] = message;
    if (replaced && recoveringMissing) {
      recoverySuccessState[assetId] = message;
    }
  } finally {
    finish();
    if (pendingMaintenance.get(assetId) === pending) {
      pendingMaintenance.delete(assetId);
    }
  }
}

function recoveryStatusLabel(assetId: string, fallbackKey: WorkbenchMessageKey): string {
  const message = recoveryState[assetId];
  return message ? renderStatusMessage(message) : t(fallbackKey);
}

function localizedStatusMessage(
  key: WorkbenchMessageKey,
  fallback: string,
  values?: WorkbenchMessageValues
): LocalizedStatusMessage {
  return {
    kind: "message",
    key,
    fallback,
    ...(values ? { values } : {})
  };
}

function descriptorStatusMessage(descriptor: MessageDescriptor): LocalizedStatusMessage {
  return {
    kind: "descriptor",
    descriptor
  };
}

function rawStatusMessage(value: string): LocalizedStatusMessage {
  return {
    kind: "raw",
    value
  };
}

function renderStatusMessage(message: LocalizedStatusMessage): string {
  if (message.kind === "raw") {
    return message.value;
  }
  if (message.kind === "descriptor") {
    return props.context.i18n.t(message.descriptor);
  }
  return props.context.i18n.t({
    key: message.key,
    fallback: message.fallback,
    ...(message.values ? { values: message.values } : {})
  });
}

function diagnosticStatusMessage(diagnostic: WorkbenchAssetImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  if (!diagnostic) {
    return undefined;
  }
  return diagnostic.titleDescriptor
    ? descriptorStatusMessage(diagnostic.titleDescriptor)
    : rawStatusMessage(diagnostic.title);
}

function glbDiagnosticStatusMessage(diagnostic: GlbImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  if (!diagnostic) {
    return undefined;
  }
  return descriptorStatusMessage({
    ...createDisplayMessageDescriptor({
      namespace: "workbenchImport",
      path: `diagnostic.${diagnostic.code}`,
      field: "title",
      fallback: diagnostic.display.title,
      values: {
        diagnosticId: diagnostic.id,
        code: diagnostic.code,
        ...(diagnostic.metadata ?? {})
      }
    }),
    fallback: diagnostic.display.title,
  });
}

function projectProblemStatusMessage(problem: ProjectProblem | undefined): LocalizedStatusMessage | undefined {
  if (!problem) {
    return undefined;
  }
  return problem.display?.titleDescriptor
    ? descriptorStatusMessage(problem.display.titleDescriptor)
    : rawStatusMessage(problem.display?.title ?? problem.message);
}

function formatImportDiagnostic(diagnostic: WorkbenchAssetImportDiagnostic): string {
  return diagnostic.titleDescriptor ? props.context.i18n.t(diagnostic.titleDescriptor) : diagnostic.title;
}

function reimportSummaryStatusMessage(
  fileName: string,
  summary: { exactTargetCount: number; remappedTargetCount: number; newTargetCount: number; unresolvedTargetCount: number } | undefined
): LocalizedStatusMessage {
  if (!summary) {
    return localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.success", "Reimported {fileName}", { fileName });
  }
  return localizedStatusMessage(
    "reactWorkbench.leftPanel.assets.reimport.summary",
    "{exactTargetCount} exact · {remappedTargetCount} remapped · {newTargetCount} new · {unresolvedTargetCount} unresolved",
    summary
  );
}

function queueStatusLabel(status: AssetQueueStatus): string {
  return t(queueStatusMessageKeys[status]);
}

function formatAssetKind(kind: AssetKind): string {
  return t(assetKindMessageKeys[kind]);
}

function formatWorkspaceStatus(value: AssetWorkspaceStatus): string {
  return t(workspaceStatusMessageKeys[value]);
}

function formatPayloadStatus(value: AssetWorkspacePayloadStatus): string {
  return t(payloadStatusMessageKeys[value]);
}

function formatPackageStatus(value: AssetWorkspacePackageStatus): string {
  return t(packageStatusMessageKeys[value]);
}

function formatImportStatus(value: GlbImportStatus): string {
  return t(importStatusMessageKeys[value]);
}

const queueStatusMessageKeys = {
  queued: "reactWorkbench.leftPanel.assets.queue.queued",
  importing: "reactWorkbench.leftPanel.assets.queue.importing",
  succeeded: "reactWorkbench.leftPanel.assets.queue.succeeded",
  failed: "reactWorkbench.leftPanel.assets.queue.failed"
} satisfies Record<AssetQueueStatus, WorkbenchMessageKey>;

const workspaceStatusMessageKeys = {
  ready: "reactWorkbench.leftPanel.assets.status.ready",
  "missing-payload": "reactWorkbench.leftPanel.assets.status.missingPayload",
  "missing-reference": "reactWorkbench.leftPanel.assets.status.missingReference",
  "has-problems": "reactWorkbench.leftPanel.assets.status.hasProblems",
  unreferenced: "reactWorkbench.leftPanel.assets.status.unreferenced"
} satisfies Record<AssetWorkspaceStatus, WorkbenchMessageKey>;

const payloadStatusMessageKeys = {
  available: "reactWorkbench.leftPanel.assets.payloadStatus.available",
  missing: "reactWorkbench.leftPanel.assets.payloadStatus.missing",
  "not-required": "reactWorkbench.leftPanel.assets.payloadStatus.notRequired",
  "kind-mismatch": "reactWorkbench.leftPanel.assets.payloadStatus.kindMismatch"
} satisfies Record<AssetWorkspacePayloadStatus, WorkbenchMessageKey>;

const packageStatusMessageKeys = {
  complete: "reactWorkbench.leftPanel.assets.packageStatus.complete",
  partial: "reactWorkbench.leftPanel.assets.packageStatus.partial",
  blocked: "reactWorkbench.leftPanel.assets.packageStatus.blocked",
  "not-referenced": "reactWorkbench.leftPanel.assets.packageStatus.notReferenced"
} satisfies Record<AssetWorkspacePackageStatus, WorkbenchMessageKey>;

const importStatusMessageKeys = {
  "not-applicable": "reactWorkbench.leftPanel.assets.importStatus.notApplicable",
  "not-analyzed": "reactWorkbench.leftPanel.assets.importStatus.notAnalyzed",
  analyzed: "reactWorkbench.leftPanel.assets.importStatus.analyzed",
  "has-diagnostics": "reactWorkbench.leftPanel.assets.importStatus.hasDiagnostics",
  failed: "reactWorkbench.leftPanel.assets.importStatus.failed"
} satisfies Record<GlbImportStatus, WorkbenchMessageKey>;

const assetKindMessageKeys = {
  texture: "reactWorkbench.leftPanel.assets.kind.texture",
  image: "reactWorkbench.leftPanel.assets.kind.image",
  glb: "reactWorkbench.leftPanel.assets.kind.glb",
  hdr: "reactWorkbench.leftPanel.assets.kind.hdr"
} satisfies Record<AssetKind, WorkbenchMessageKey>;

</script>
