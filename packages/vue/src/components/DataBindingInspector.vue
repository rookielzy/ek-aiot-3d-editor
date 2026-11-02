<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ t("dataBinding.section.label") }}</h2>
    </header>
    <p v-if="content === 'empty'" class="ek-inspector-empty">{{ t("dataBinding.empty.selection") }}</p>
    <p v-else-if="content === 'multi'" class="ek-inspector-empty">{{ t("dataBinding.empty.multi") }}</p>
    <div v-else-if="content === 'imported'" class="ek-workbench__binding-unsupported">
      <p class="ek-inspector-empty">{{ t("dataBinding.unsupported.imported") }}</p>
      <button v-if="ownerObject" type="button" @click="selectOwner">
        {{ t("dataBinding.unsupported.importedOwner", { name: ownerObject.name }) }}
      </button>
      <small v-else>{{ t("dataBinding.unsupported.ownerUnavailable") }}</small>
    </div>
    <p v-else-if="content === 'group'" class="ek-inspector-empty">{{ t("dataBinding.unsupported.group") }}</p>
    <p v-else-if="content === 'light'" class="ek-inspector-empty">{{ t("dataBinding.unsupported.light") }}</p>
    <p v-else-if="content === 'camera'" class="ek-inspector-empty">{{ t("dataBinding.unsupported.camera") }}</p>
    <DataBindingForm
      v-else-if="content === 'form' && context && objectNodeId"
      :key="objectNodeId"
      :context="context"
      :object-node-id="objectNodeId"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { InspectorI18n } from "./inspector-i18n";
import DataBindingForm from "./DataBindingForm.vue";

const props = defineProps<{
  context?: ResolvedWorkbenchContext;
  snapshot: SceneSnapshot;
  selection: { count: number; nodeId: string | null };
  i18n: InspectorI18n;
}>();

const t = (message: Parameters<InspectorI18n["t"]>[0], values?: Parameters<InspectorI18n["t"]>[1]) =>
  props.i18n.t(message, values);

const node = computed(() =>
  props.selection.count === 1 && props.selection.nodeId
    ? props.snapshot.nodes[props.selection.nodeId] ?? null
    : null
);
const ownerObject = computed(() => {
  const current = node.value;
  return current?.kind === "imported"
    ? Object.values(props.snapshot.nodes).find((candidate) =>
        candidate.kind === "object" && candidate.objectId === current.ownerObjectId
      ) ?? null
    : null
});
const objectNodeId = computed(() => node.value?.kind === "object" ? node.value.id : null);
const content = computed(() => {
  if (props.selection.count === 0 || !node.value) {
    return "empty";
  }
  if (props.selection.count > 1) {
    return "multi";
  }
  switch (node.value.kind) {
    case "object":
      return props.context ? "form" : "empty";
    case "imported":
      return "imported";
    case "group":
      return "group";
    case "light":
      return "light";
    default:
      return "camera";
  }
});

function selectOwner(): void {
  const owner = ownerObject.value;
  if (owner) {
    props.context?.dispatch({ type: "select-node", nodeId: owner.id });
  }
}
</script>
