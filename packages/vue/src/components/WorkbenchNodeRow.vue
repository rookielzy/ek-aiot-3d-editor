<template>
  <li v-if="!search || matches.has(row.id)">
    <div class="ek-workbench__tree-entry" :style="treeRowStyle">
      <button
        v-if="children.length > 0"
        type="button"
        class="ek-workbench__tree-toggle"
        :aria-label="context.i18n.t(`reactWorkbench.leftPanel.hierarchy.${expanded ? 'collapse' : 'expand'}`, { label: row.label })"
        :aria-expanded="expanded"
        :disabled="Boolean(search)"
        @click="toggle(row.id)"
      ><span aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span></button>
      <span v-else class="ek-workbench__tree-toggle-space" />
      <button
        type="button"
        class="ek-workbench__tree-row"
        :aria-pressed="row.selected"
        :data-selected="row.selected ? 'true' : undefined"
        :data-severity="row.highestProblemSeverity ?? undefined"
        :title="row.label"
        @click="selectNode"
        @dblclick="frameNode"
      >
        <span>{{ row.label }}</span>
        <small>{{ row.kind }}{{ row.problemCount ? ` · ${row.problemCount}` : "" }}</small>
      </button>
    </div>
    <p v-for="problem in selectedProblems" :key="problem.id" class="ek-workbench__tree-problem" :data-severity="problem.severity">
      {{ problem.detailDescriptor ? context.i18n.t(problem.detailDescriptor) : problem.detail ?? (problem.titleDescriptor ? context.i18n.t(problem.titleDescriptor) : problem.title) }}
    </p>
    <ul v-if="expanded && children.length > 0">
      <WorkbenchNodeRow
        v-for="child in children"
        :key="child.id"
        :row="child"
        :context="context"
        :search="search"
        :matches="matches"
        :collapsed="collapsed"
        :toggle="toggle"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";

defineOptions({
  name: "WorkbenchNodeRow"
});

const props = defineProps<{
  row: WorkbenchHierarchyRow;
  context: ResolvedWorkbenchContext;
  search: string;
  matches: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
  toggle(nodeId: string): void;
}>();

const expanded = computed(() => Boolean(props.search) || !props.collapsed.has(props.row.id));
const selectedProblems = computed(() => props.row.selected && props.row.kind === "imported"
  ? props.context.model.problems.items.filter((problem) => props.row.problemIds.includes(problem.id))
  : []);
const children = computed(() =>
  props.row.childIds
    .map((childId) => props.context.hierarchyRowsById.get(childId))
    .filter((child): child is WorkbenchHierarchyRow => Boolean(child))
);
const treeRowStyle = computed(() => ({
  "--ek-workbench-tree-depth": props.row.depth
}) as CSSProperties);

function selectNode(event: MouseEvent): void {
  props.context.dispatch({
    type: "select-nodes",
    mode: event.altKey ? "remove" : event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace",
    nodeIds: [props.row.id]
  });
}

function frameNode(): void {
  props.context.dispatch({ type: "select-node", nodeId: props.row.id });
  props.context.frameSelected();
}
</script>
