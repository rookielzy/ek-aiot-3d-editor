<template>
  <label class="ek-workbench__hierarchy-search">
    <span>{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.search") }}</span>
    <input v-model="query" type="search" />
  </label>
  <p v-if="hierarchy.empty" class="ek-workbench__empty">{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.empty") }}</p>
  <p v-else-if="search && matches.size === 0" class="ek-workbench__empty" role="status">{{ context.i18n.t("reactWorkbench.leftPanel.hierarchy.noResults") }}</p>
  <ul v-else class="ek-workbench__tree" role="tree" aria-multiselectable="true"
    :aria-label="context.i18n.t('reactWorkbench.leftPanel.hierarchy.label')" :style="treeStyle">
    <WorkbenchNodeRow
      v-for="row in hierarchy.roots"
      :key="row.id"
      :row="row"
      :context="context"
      :search="search"
      :matches="matches"
      :collapsed="collapsed"
      :toggle="toggle"
      :tree-id="treeId"
      :tab-stop="tabStop"
      :set-focus="setFocus"
      :navigate="navigate"
    />
  </ul>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import WorkbenchNodeRow from "./WorkbenchNodeRow.vue";

const props = defineProps<{ context: ResolvedWorkbenchContext }>();
const query = ref("");
const collapsed = ref(new Set<string>());
const treeId = useId();
const focusId = ref<string | null>(null);
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
const visibleIds = computed(() => {
  if (search.value) return hierarchy.value.rows.filter((row) => matches.value.has(row.id)).map((row) => row.id);
  const visible = new Set<string>();
  for (const row of hierarchy.value.rows) {
    if (!row.parentId || (visible.has(row.parentId) && !collapsed.value.has(row.parentId))) visible.add(row.id);
  }
  return [...visible];
});
const tabStop = computed(() => [focusId.value, props.context.selectedNodeId].find((id) => id && visibleIds.value.includes(id)) ?? visibleIds.value[0]);

watch(() => JSON.stringify([props.context.selectedNodeId, props.context.selectedNodeIds]), () => {
  const rows = props.context.hierarchyRowsById;
  const selected = props.context.selectedNodeIds.map((id) => rows.get(id)).filter((row) => row !== undefined);
  if (selected.some((row) => !matches.value.has(row.id))) query.value = "";
  for (const row of selected) {
    let parent = row.parentId ? rows.get(row.parentId) : undefined;
    while (parent) {
      collapsed.value.delete(parent.id);
      parent = parent.parentId ? rows.get(parent.parentId) : undefined;
    }
  }
});

watch(visibleIds, (ids) => {
  const previous = focusId.value;
  if (!previous || ids.includes(previous)) return;
  const hadFocus = document.activeElement === document.getElementById(`${treeId}-${previous}`);
  const fallback = tabStop.value;
  if (hadFocus && fallback) return focusRow(fallback);
  setFocus(fallback ?? null);
});

function toggle(id: string): void {
  if (!collapsed.value.delete(id)) collapsed.value.add(id);
}

function setFocus(id: string | null): void {
  focusId.value = id;
}

function navigate(id: string, where: -1 | 1 | "first" | "last" | "parent"): void {
  const ids = visibleIds.value;
  const target = where === "parent" ? props.context.hierarchyRowsById.get(id)?.parentId
    : where === "first" ? ids[0]
    : where === "last" ? ids.at(-1)
    : ids[(ids.indexOf(id) + where + ids.length) % ids.length];
  if (target) void focusRow(target);
}

async function focusRow(id: string): Promise<void> {
  setFocus(id);
  await nextTick();
  const row = document.getElementById(`${treeId}-${id}`);
  row?.focus({ preventScroll: true });
  row?.scrollIntoView?.({ block: "nearest" });
}
</script>
