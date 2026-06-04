<template>
  <li>
    <button
      type="button"
      class="ek-workbench__tree-row"
      :data-selected="row.selected ? 'true' : undefined"
      :data-severity="row.highestProblemSeverity ?? undefined"
      :style="treeRowStyle"
      @click="context.dispatch({ type: 'select-node', nodeId: row.id })"
    >
      <span>{{ row.label }}</span>
      <small>{{ row.kind }}{{ row.problemCount ? ` · ${row.problemCount}` : "" }}</small>
    </button>
    <ul v-if="children.length > 0">
      <WorkbenchNodeRow
        v-for="child in children"
        :key="child.id"
        :context="context"
        :row="child"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../composables/use-workbench";

defineOptions({
  name: "WorkbenchNodeRow"
});

const props = defineProps<{
  context: WorkbenchContext;
  row: WorkbenchHierarchyRow;
}>();

const children = computed(() =>
  props.row.childIds
    .map((childId) => props.context.model.hierarchy.rows.find((candidate) => candidate.id === childId))
    .filter((child): child is WorkbenchHierarchyRow => Boolean(child))
);
const treeRowStyle = computed(() => ({
  "--ek-workbench-tree-depth": props.row.depth
}) as CSSProperties);
</script>
