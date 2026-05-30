# @ek-aiot/3d-editor-vue

Thin Vue adapter over `@ek-aiot/3d-editor-core`.

This package is experimental `0.x`. It tracks the current core package contract and does not promise 1.0 API stability, cloud asset libraries, marketplace behavior, data binding, hosted runtime publishing, or Le5le-style low-code features. Release process details live in the repository release guide.

`useEditor()` exposes the core editor and current snapshot through Vue refs. `EditorViewport` mounts the core runtime and disposes it through Vue lifecycle hooks.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected-object transform/material fields, scene environment/background, lights, and runtime problems. Edits dispatch core commands on commit boundaries, while Vue only owns draft inputs and UI-local light focus.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a compact viewport-plus-inspector shell. Pass a raw host-owned editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench. The composable keeps editor/runtime instances out of deep reactivity and exposes shallow snapshot/problem state.

```vue
<template>
  <EditorWorkbench :editor="editor" :resolver="resolver">
    <template #toolbar="{ dispatch }">
      <button @click="dispatch({ type: 'set-transform', objectId: 'box', transform: { position: [1, 0, 0] } })">
        Move
      </button>
    </template>
    <template #status="{ runtimeProblems }">
      <span>{{ runtimeProblems.length }} runtime problems</span>
    </template>
  </EditorWorkbench>
</template>
```

Scoped slots receive the core editor, current snapshot, inspector model, runtime problems, active light state, project import/export helpers, asset replacement, and a dispatch helper. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; Vue shell code does not resolve assets or serialize runtime problems.

Problem panels expose file replacement for recoverable asset problems and pass the selected `File` to `editor.replaceAsset()` for the same asset ID. The Vue layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement hierarchy selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, or material texture runtime projection.
