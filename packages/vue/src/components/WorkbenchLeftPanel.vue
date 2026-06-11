<template>
  <div class="ek-workbench__default-left-panel">
    <section class="ek-workbench__panel-section" aria-label="Hierarchy">
      <div class="ek-workbench__section-header">
        <h2>Hierarchy</h2>
        <span>{{ model.hierarchy.totalCount }}</span>
      </div>
      <p v-if="model.hierarchy.empty" class="ek-workbench__empty">No scene nodes.</p>
      <ul v-else class="ek-workbench__tree">
        <WorkbenchNodeRow
          v-for="row in model.hierarchy.roots"
          :key="row.id"
          :context="context"
          :row="row"
        />
      </ul>
    </section>

    <section class="ek-workbench__panel-section" aria-label="Assets">
      <div class="ek-workbench__section-header">
        <h2>Assets</h2>
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
          <span>Import assets</span>
          <small>GLB, HDR, image, texture</small>
          <input aria-label="Import assets" type="file" multiple @change="onImportChange" />
        </label>
        <label class="ek-workbench__field">
          <span>Raster intent</span>
          <select v-model="rasterKind">
            <option value="texture">Texture</option>
            <option value="image">Image</option>
          </select>
        </label>
      </div>
      <div class="ek-workbench__asset-controls" aria-label="Asset workspace controls">
        <label class="ek-workbench__field ek-workbench__field--search">
          <span>Search assets</span>
          <input
            v-model="assetQuery"
            aria-label="Search assets"
            placeholder="Label, id, status, diagnostic"
          />
        </label>
        <label class="ek-workbench__field">
          <span>Kind</span>
          <select v-model="assetKind" aria-label="Asset kind filter">
            <option value="all">All kinds</option>
            <option value="glb">GLB</option>
            <option value="hdr">HDR</option>
            <option value="texture">Texture</option>
            <option value="image">Image</option>
          </select>
        </label>
        <label class="ek-workbench__field">
          <span>Status</span>
          <select v-model="assetStatus" aria-label="Asset status filter">
            <option value="all">All status</option>
            <option value="ready">Ready</option>
            <option value="missing-payload">Missing payload</option>
            <option value="missing-reference">Missing reference</option>
            <option value="has-problems">Has problems</option>
            <option value="unreferenced">Unreferenced</option>
          </select>
        </label>
        <label class="ek-workbench__field">
          <span>Sort</span>
          <select v-model="assetSort" aria-label="Asset sort">
            <option value="status">Status</option>
            <option value="label">Label</option>
            <option value="kind">Kind</option>
            <option value="referenced">Referenced</option>
            <option value="payload">Payload</option>
            <option value="severity">Severity</option>
          </select>
        </label>
      </div>
      <ul v-if="queue.length > 0" class="ek-workbench__asset-queue" aria-label="Asset import queue">
        <li v-for="item in queue" :key="item.id" :data-status="item.status">
          <span>{{ item.label }}</span>
          <small>
            {{ item.status }}{{ item.kind ? ` · ${item.kind}` : "" }}{{ item.detail ? ` · ${item.detail}` : "" }}
          </small>
          <em v-if="item.diagnostics.length > 0">{{ item.diagnostics.map((diagnostic) => diagnostic.title).join("; ") }}</em>
        </li>
      </ul>
      <p v-if="!workspace || workspace.totalCount === 0" class="ek-workbench__empty">No registered assets.</p>
      <ul v-else class="ek-workbench__asset-list" aria-label="Asset workspace rows">
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
          <div class="ek-workbench__asset-badges" :aria-label="`${asset.label} asset state`">
            <span>{{ asset.kind }}</span>
            <span>{{ formatStatus(asset.status) }}</span>
            <span>{{ formatStatus(asset.payloadStatus) }}</span>
            <span>{{ formatStatus(asset.packageStatus) }}</span>
            <span v-if="asset.importStatus">{{ formatStatus(asset.importStatus) }}</span>
          </div>
          <p class="ek-workbench__asset-meta">
            {{ asset.referenced ? `${asset.referenceCount} refs` : "unreferenced" }}{{ asset.references.length > 0 ? ` · ${asset.references.slice(0, 2).map((reference) => reference.label).join(", ")}` : "" }}{{ asset.problemCount ? ` · ${asset.problemCount} problems` : "" }}
          </p>
          <ul v-if="asset.problems.length > 0" class="ek-workbench__asset-diagnostics" :aria-label="`${asset.label} diagnostics`">
            <li v-for="problem in asset.problems.slice(0, 3)" :key="problem.id" :data-severity="problem.severity">
              <strong>{{ problem.title }}</strong>
              <small v-if="problem.detail">{{ problem.detail }}</small>
            </li>
          </ul>
          <label v-if="asset.kind === 'glb' && asset.registered" class="ek-workbench__asset-replace">
            <span>Reimport GLB</span>
            <small>{{ recoveryState[recoveryId(asset)] ?? "Remap imported targets" }}</small>
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              :aria-label="`Reimport ${asset.label}`"
              @change="reimportWorkspaceGlb(asset, $event)"
            />
          </label>
          <label v-else-if="asset.recoverable && asset.registered" class="ek-workbench__asset-replace">
            <span>{{ asset.actionLabel ?? "Replace asset" }}</span>
            <small>{{ recoveryState[recoveryId(asset)] ?? "Preserves asset ID" }}</small>
            <input type="file" :aria-label="`Replace ${asset.label}`" @change="replaceWorkspaceAsset(asset, $event)" />
          </label>
        </li>
      </ul>
      <div v-if="model.assets.missing.length > 0" class="ek-workbench__recovery-list" aria-label="Missing asset recovery">
        <label
          v-for="item in model.assets.missing"
          :key="item.problemId"
          class="ek-workbench__file-action"
          :data-severity="item.severity"
        >
          <span>{{ item.actionLabel ?? "Replace asset" }}</span>
          <strong>{{ item.label }}</strong>
          <small>{{ recoveryState[item.problemId] ?? item.title }}</small>
          <input type="file" @change="replaceMissingAsset(item, $event)" />
        </label>
      </div>
    </section>

    <section class="ek-workbench__panel-section" aria-label="Project">
      <div class="ek-workbench__section-header">
        <h2>Project</h2>
        <span>{{ model.project.statusLabel }}</span>
      </div>
      <dl class="ek-workbench__summary-list">
        <div>
          <dt>Scene</dt>
          <dd>{{ model.project.sceneName }}</dd>
        </div>
        <div>
          <dt>Nodes</dt>
          <dd>{{ model.project.nodeCount }}</dd>
        </div>
        <div>
          <dt>Objects</dt>
          <dd>{{ model.project.objectCount }}</dd>
        </div>
        <div>
          <dt>Lights</dt>
          <dd>{{ model.project.lightCount }}</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{{ model.project.assetCount }}</dd>
        </div>
      </dl>
      <ul v-if="model.problems.totalCount > 0" class="ek-workbench__problem-list" aria-label="Project problems">
        <li
          v-for="problem in model.problems.items.slice(0, 4)"
          :key="problem.id"
          :data-severity="problem.severity"
        >
          <span>{{ problem.title }}</span>
          <small>
            {{ problem.severity }}{{ problem.assetId ? ` · ${problem.assetId}` : "" }}{{ problem.actionLabel ? ` · ${problem.actionLabel}` : "" }}
          </small>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems,
  type AssetKind,
  type AssetWorkspaceItem,
  type AssetWorkspaceSortKey,
  type AssetWorkspaceStatus,
  type WorkbenchAssetImportDiagnostic,
  type WorkbenchMissingAssetItem,
  type WorkbenchRasterImportKind
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../composables/use-workbench";
import WorkbenchNodeRow from "./WorkbenchNodeRow.vue";

type AssetRecoveryState = Record<string, string>;
type AssetQueueStatus = "queued" | "importing" | "succeeded" | "failed";
type AssetStatusFilter = "all" | AssetWorkspaceStatus;
type AssetKindFilter = "all" | AssetKind;

interface AssetQueueItem {
  id: string;
  label: string;
  kind?: AssetKind;
  status: AssetQueueStatus;
  detail?: string;
  diagnostics: WorkbenchAssetImportDiagnostic[];
}

const props = defineProps<{
  context: WorkbenchContext;
}>();

const recoveryState = reactive<AssetRecoveryState>({});
const assetQuery = ref("");
const assetKind = ref<AssetKindFilter>("all");
const assetStatus = ref<AssetStatusFilter>("all");
const assetSort = ref<AssetWorkspaceSortKey>("status");
const rasterKind = ref<WorkbenchRasterImportKind>("texture");
const queue = ref<AssetQueueItem[]>([]);
const dragActive = ref(false);
const model = computed(() => props.context.model);
const workspace = computed(() => model.value.assets.workspace);
const visibleAssets = computed(() => {
  const filtered = filterAssetWorkspaceItems(workspace.value?.items ?? [], {
    query: assetQuery.value,
    kinds: assetKind.value === "all" ? undefined : [assetKind.value],
    statuses: assetStatus.value === "all" ? undefined : [assetStatus.value]
  });
  return sortAssetWorkspaceItems(filtered, { key: assetSort.value });
});

async function importAssetFiles(files: readonly File[]): Promise<void> {
  if (files.length === 0) {
    return;
  }
  const queueItems = files.map((file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    label: file.name,
    status: "queued" as const,
    diagnostics: []
  }));
  queue.value = [...queueItems, ...queue.value].slice(0, 8);
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
            detail: error instanceof Error ? error.message : String(error),
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
        ? result.assetId ? `Imported ${result.assetId}` : "Imported"
        : result.diagnostics[0]?.title ?? "Import failed",
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

async function replaceWorkspaceAsset(asset: AssetWorkspaceItem, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  const id = recoveryId(asset);
  recoveryState[id] = "Replacing...";
  const result = await props.context.assets.replaceAsset({
    assetId: asset.id,
    source: file,
    label: file.name,
    mimeType: file.type
  });
  if (result.ok) {
    await props.context.runtime?.project();
    props.context.refreshProblems();
    recoveryState[id] = `Replaced with ${file.name}`;
    return;
  }
  recoveryState[id] = result.problems[0]?.message ?? "Replacement failed";
}

async function reimportWorkspaceGlb(asset: AssetWorkspaceItem, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  const id = recoveryId(asset);
  recoveryState[id] = "Analyzing GLB...";
  const result = await props.context.assets.reimportGlbAsset({
    assetId: asset.id,
    source: file
  });
  if (result.ok) {
    props.context.refreshProblems();
    recoveryState[id] = formatReimportSummary(file.name, result.remap?.summary);
    return;
  }
  recoveryState[id] = result.diagnostics[0]?.display.title ?? result.commandResult?.error ?? "Reimport failed";
}

async function replaceMissingAsset(item: WorkbenchMissingAssetItem, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  recoveryState[item.problemId] = "Replacing...";
  const result = await props.context.replaceAsset({
    assetId: item.assetId,
    source: file,
    label: file.name,
    mimeType: file.type
  });
  if (result.ok) {
    await props.context.runtime?.project();
    props.context.refreshProblems();
    recoveryState[item.problemId] = `Replaced with ${file.name}`;
    return;
  }

  recoveryState[item.problemId] = result.problems[0]?.message ?? "Replacement failed";
}

function recoveryId(asset: AssetWorkspaceItem): string {
  return asset.problems.find((problem) => problem.actionLabel || problem.recoverability === "user-action")?.id ?? asset.id;
}

function formatStatus(value: string): string {
  return value.replace(/-/g, " ");
}

function formatReimportSummary(
  fileName: string,
  summary: { exactTargetCount: number; remappedTargetCount: number; newTargetCount: number; unresolvedTargetCount: number } | undefined
): string {
  if (!summary) {
    return `Reimported ${fileName}`;
  }
  return [
    `${summary.exactTargetCount} exact`,
    `${summary.remappedTargetCount} remapped`,
    `${summary.newTargetCount} new`,
    `${summary.unresolvedTargetCount} unresolved`
  ].join(" · ");
}
</script>
