<template>
  <li v-if="!search || matches.has(row.id)" role="none">
    <div class="ek-workbench__tree-entry" :style="treeRowStyle">
      <button
        v-if="children.length > 0"
        type="button"
        class="ek-workbench__tree-toggle"
        tabindex="-1"
        :aria-label="context.i18n.t(`reactWorkbench.leftPanel.hierarchy.${expanded ? 'collapse' : 'expand'}`, { label: row.label })"
        :aria-expanded="expanded"
        :disabled="Boolean(search)"
        @click="toggle(row.id)"
      ><span aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span></button>
      <span v-else class="ek-workbench__tree-toggle-space" />
      <button
        ref="selectButton"
        type="button"
        data-ek-discard-draft
        class="ek-workbench__tree-row"
        role="treeitem"
        :aria-label="row.label"
        :aria-selected="row.selected"
        :aria-expanded="children.length ? expanded : undefined"
        :aria-level="row.depth + 1"
        aria-haspopup="menu"
        aria-keyshortcuts="ContextMenu Shift+F10"
        :tabindex="tabStop === row.id ? 0 : -1"
        :data-tree-row-id="row.id"
        :data-selected="row.selected ? 'true' : undefined"
        :data-severity="row.highestProblemSeverity ?? undefined"
        :title="row.label"
        @focus="setFocus(row.id)"
        @keydown="onKeyDown"
        @click="selectNode"
        @dblclick="frameNode"
      >
        <span>{{ row.label }}</span>
        <small>{{ row.kind }}{{ row.problemCount ? ` · ${row.problemCount}` : "" }}</small>
      </button>
      <CommandMenu ref="menu" :label="moreLabel" :trigger-label="moreLabel" icon="more" compact
        :commands="() => commands" :return-focus="() => selectButton" :trigger-tab-index="tabStop === row.id ? 0 : -1" />
    </div>
    <p v-for="problem in selectedProblems" :key="problem.id" class="ek-workbench__tree-problem" :data-severity="problem.severity">
      {{ problem.detailDescriptor ? context.i18n.t(problem.detailDescriptor) : problem.detail ?? (problem.titleDescriptor ? context.i18n.t(problem.titleDescriptor) : problem.title) }}
    </p>
    <ul v-if="expanded && children.length > 0" role="group">
      <WorkbenchNodeRow
        v-for="child in children"
        :key="child.id"
        :row="child"
        :context="context"
        :search="search"
        :matches="matches"
        :collapsed="collapsed"
        :toggle="toggle"
        :tab-stop="tabStop"
        :set-focus="setFocus"
        :navigate="navigate"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import CommandMenu from "./ui/CommandMenu.vue";
import { workbenchNodeCommands } from "./workbench-node-commands";

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
  tabStop?: string;
  setFocus(nodeId: string): void;
  navigate(nodeId: string, where: -1 | 1 | "first" | "last" | "parent"): void;
}>();

const expanded = computed(() => Boolean(props.search) || !props.collapsed.has(props.row.id));
const selectButton = ref<HTMLButtonElement | null>(null);
const menu = ref<InstanceType<typeof CommandMenu> | null>(null);
const moreLabel = computed(() => props.context.i18n.t("reactWorkbench.leftPanel.hierarchy.more", { label: props.row.label }));
const commands = computed(() => workbenchNodeCommands(props.context, { nodeId: props.row.id }).map((command) => ({
  ...command,
  label: props.context.i18n.t(command.label),
  title: props.context.i18n.t(command.title),
  reason: command.reason ? props.context.i18n.t(command.reason) : undefined
})));
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

function selectNode(event: MouseEvent | KeyboardEvent): void {
  const mode = event.altKey ? "remove" : event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace";
  props.context.dispatch({
    type: "select-nodes",
    mode,
    primaryNodeId: mode === "replace" || mode === "add" ? props.row.id : undefined,
    nodeIds: [props.row.id]
  });
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    menu.value?.openMenu();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft", "Enter", " "].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  switch (event.key) {
    case "ArrowDown": return props.navigate(props.row.id, 1);
    case "ArrowUp": return props.navigate(props.row.id, -1);
    case "Home": return props.navigate(props.row.id, "first");
    case "End": return props.navigate(props.row.id, "last");
    case "ArrowRight":
      if (children.value.length && !expanded.value) return props.toggle(props.row.id);
      return props.navigate(props.row.id, 1);
    case "ArrowLeft":
      if (!props.search && children.value.length && expanded.value) return props.toggle(props.row.id);
      return props.navigate(props.row.id, "parent");
    case "Enter":
    case " ": return selectNode(event);
  }
}

function frameNode(): void {
  props.context.dispatch({ type: "select-node", nodeId: props.row.id });
  props.context.frameSelected();
}
</script>
