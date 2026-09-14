<template>
  <label class="ek-workbench__hierarchy-search">
    <span>{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.search") }}</span>
    <input v-model="query" type="search" />
  </label>
  <p v-if="hierarchy.empty" class="ek-workbench__empty">{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.empty") }}</p>
  <p v-else-if="search && matches.size === 0" class="ek-workbench__empty" role="status">{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.noResults") }}</p>
  <ul v-else class="ek-workbench__tree" :style="treeStyle">
    <WorkbenchNodeRow
      v-for="row in hierarchy.roots"
      :key="row.id"
      :row="row"
      :context="context"
      :search="search"
      :matches="matches"
      :collapsed="collapsed"
      :toggle="toggle"
    />
  </ul>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import WorkbenchNodeRow from "./WorkbenchNodeRow.vue";

const props = defineProps<{ context: ResolvedWorkbenchContext }>();
const query = ref("");
const collapsed = ref(new Set<string>());
const hierarchy = computed(() => props.context.model.hierarchy);
const search = computed(() => query.value.trim().toLocaleLowerCase());
const matches = computed(() => {
  const result = new Set<string>();
  const rows = props.context.hierarchyRowsById;
  for (const row of rows.values()) {
    if (!row.label.toLocaleLowerCase().includes(search.value)) continue;
    let ancestor: WorkbenchHierarchyRow | undefined = row;
    while (ancestor && !result.has(ancestor.id)) {
      result.add(ancestor.id);
      ancestor = ancestor.parentId ? rows.get(ancestor.parentId) : undefined;
    }
  }
  return result;
});
const treeStyle = computed(() => ({
  "--ek-workbench-tree-max-depth": hierarchy.value.rows.reduce((depth, row) => Math.max(depth, row.depth), 1)
}) as CSSProperties);

watch(() => JSON.stringify(props.context.model.selection.nodeIds), () => {
  const rows = props.context.hierarchyRowsById;
  const selected = [...rows.values()].filter((row) => row.selected);
  if (selected.some((row) => !matches.value.has(row.id))) query.value = "";
  for (const row of selected) {
    let parent = row.parentId ? rows.get(row.parentId) : undefined;
    while (parent) {
      collapsed.value.delete(parent.id);
      parent = parent.parentId ? rows.get(parent.parentId) : undefined;
    }
  }
});

function toggle(id: string): void {
  if (collapsed.value.has(id)) collapsed.value.delete(id);
  else collapsed.value.add(id);
}
</script>
