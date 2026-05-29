<template>
  <main :class="rootClassName">
    <div v-if="$slots.toolbar" class="ek-workbench__toolbar">
      <slot name="toolbar" v-bind="context" />
    </div>

    <section class="ek-workbench__viewport-shell" aria-label="3D viewport">
      <EditorViewport
        :editor="workbench.editor"
        :resolver="resolver"
        :loader="loader"
        :renderer-factory="rendererFactory"
        :class="viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : 'ek-workbench__viewport'"
      />
      <div v-if="$slots.viewportOverlay" class="ek-workbench__overlay">
        <slot name="viewportOverlay" v-bind="context" />
      </div>
    </section>

    <aside v-if="$slots.sidePanel" class="ek-workbench__side-panel">
      <slot name="sidePanel" v-bind="context" />
    </aside>

    <InspectorView
      :editor="workbench.editor"
      :snapshot="currentSnapshot"
      :inspector="currentInspector"
      :class="inspectorClassName"
      @update:active-light-id="workbench.setActiveLightId"
    />

    <footer v-if="$slots.status" class="ek-workbench__status">
      <slot name="status" v-bind="context" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import type { AssetResolverBridge, Editor, EditorOptions, EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench } from "../composables/use-workbench";
import EditorViewport from "./EditorViewport.vue";
import InspectorView from "./InspectorView.vue";
import "./workbench.css";

const props = defineProps<{
  editor?: Editor;
  snapshot?: EditorOptions["snapshot"];
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  class?: string;
  viewportClassName?: string;
  inspectorClassName?: string;
}>();

const workbench = useWorkbench({
  editor: toRef(props, "editor"),
  snapshot: props.snapshot
});

const context = computed(() => workbench.context.value);
const currentSnapshot = computed(() => workbench.snapshot.value);
const currentInspector = computed(() => workbench.inspector.value);
const rootClassName = computed(() => props.class ? `ek-workbench ${props.class}` : "ek-workbench");
</script>
