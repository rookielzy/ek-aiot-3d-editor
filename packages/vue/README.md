# @ek-aiot/3d-editor-vue

Thin Vue adapter over `@ek-aiot/3d-editor-core`.

This package is experimental `0.x`. It tracks the current core package contract and does not promise 1.0 API stability, cloud asset libraries, marketplace behavior, data binding, hosted runtime publishing, or Le5le-style low-code features. Release process details live in the repository release guide.

`useEditor()` exposes the core editor and current snapshot through Vue refs. `EditorViewport` mounts the core runtime and disposes it through Vue lifecycle hooks.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected node transform availability, object/material fields, scene lighting/background/skybox source fields, selected light nodes, and runtime problems. Edits dispatch core commands on commit boundaries, while Vue only owns draft inputs and rendering lifecycle.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a compact viewport-plus-inspector shell. Pass a raw host-owned editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench. The composable keeps editor/runtime instances out of deep reactivity and exposes shallow snapshot/problem state.

```vue
<template>
  <EditorWorkbench :editor="editor" :resolver="resolver">
    <template #toolbar="{ dispatch }">
      <button @click="dispatch({ type: 'set-node-transform', nodeId: 'box', transform: { position: [1, 0, 0] } })">
        Move
      </button>
    </template>
    <template #status="{ runtimeProblems }">
      <span>{{ runtimeProblems.length }} runtime problems</span>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-vue";
import "@ek-aiot/3d-editor-vue/styles.css";

const { editor } = useEditor();
const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null);
</script>
```

Scoped slots receive the core editor, current snapshot, inspector model, runtime problems, active light state, selected node/object/light IDs, advanced operation helpers, selection count, project import/export helpers, asset replacement, and a dispatch helper. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; Vue shell code does not resolve assets or serialize runtime problems.

`EditorWorkbench` installs shared shortcut handling on the workbench root and ignores editable controls. Copy, paste, duplicate, delete, group, ungroup, select all, and clear selection route through core `editor.operations`, so Vue does not duplicate node hierarchy, payload cleanup, or clipboard semantics.

Problem panels expose file replacement for recoverable asset problems and pass the selected `File` to `editor.replaceAsset()` for the same asset ID. The Vue layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement box selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, GLB internal hierarchy editing, per-submesh material discovery, or hosted runtime publishing.
