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
        <span>{{ model.assets.totalCount }}</span>
      </div>
      <p v-if="model.assets.empty" class="ek-workbench__empty">No registered assets.</p>
      <ul v-else class="ek-workbench__asset-list">
        <li
          v-for="asset in model.assets.items"
          :key="asset.id"
          :data-missing="asset.missing ? 'true' : undefined"
          :data-severity="asset.highestProblemSeverity ?? undefined"
        >
          <span>{{ asset.label }}</span>
          <small>
            {{ asset.kind }}{{ asset.referenced ? " · referenced" : " · unused" }}{{ asset.problemCount ? ` · ${asset.problemCount} problems` : "" }}
          </small>
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
import { computed, reactive } from "vue";
import type { WorkbenchMissingAssetItem } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../composables/use-workbench";
import WorkbenchNodeRow from "./WorkbenchNodeRow.vue";

type AssetRecoveryState = Record<string, string>;

const props = defineProps<{
  context: WorkbenchContext;
}>();

const recoveryState = reactive<AssetRecoveryState>({});
const model = computed(() => props.context.model);

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
</script>
