<template>
  <li>
    <button
      type="button"
      class="ek-workbench__tree-row"
      :data-selected="row.selected ? 'true' : undefined"
      :data-severity="row.highestProblemSeverity ?? undefined"
      :style="treeRowStyle"
      @click="selectNode(row.id)"
    >
      <span>{{ row.label }}</span>
      <small>{{ row.kind }}{{ row.problemCount ? ` · ${row.problemCount}` : "" }}</small>
    </button>
    <ul v-if="children.length > 0">
      <WorkbenchNodeRow
        v-for="child in children"
        :key="child.id"
        :row="child"
        :rows-by-id="rowsById"
        :select-node="selectNode"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";

defineOptions({
  name: "WorkbenchNodeRow"
});

const props = defineProps<{
  row: WorkbenchHierarchyRow;
  rowsById: ReadonlyMap<string, WorkbenchHierarchyRow>;
  selectNode(nodeId: string): void;
}>();

const children = computed(() =>
  props.row.childIds
    .map((childId) => props.rowsById.get(childId))
    .filter((child): child is WorkbenchHierarchyRow => Boolean(child))
);
const treeRowStyle = computed(() => ({
  "--ek-workbench-tree-depth": props.row.depth
}) as CSSProperties);
</script>
