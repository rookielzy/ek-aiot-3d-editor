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

## Bilingual Workbench UI

The default Workbench UI ships with built-in `en` and `zh-CN` dictionaries and defaults to English. No Vue I18n, FormatJS, or other third-party i18n runtime is required. Keep imports at the package root and the public CSS subpath:

```vue
<template>
  <EditorWorkbench
    v-model:locale="locale"
    :show-locale-switcher="false"
    :locale-switcher-disabled="isSaving"
    :translate="translate"
    @update:locale="onLocaleChange"
  >
    <template #status="{ i18n }">
      <span>{{ i18n.t(statusMessage) }}</span>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  EditorWorkbench,
  type WorkbenchLocale,
  type WorkbenchTranslate
} from "@ek-aiot/3d-editor-vue";
import "@ek-aiot/3d-editor-vue/styles.css";

const locale = ref<WorkbenchLocale>("zh-CN");
const isSaving = false;
const statusMessage = { key: "host.status.saved", fallback: "Saved" } as const;
const translate: WorkbenchTranslate = (descriptor, activeLocale) =>
  descriptor.key === "host.status.saved" && activeLocale === "zh-CN"
    ? "已保存"
    : undefined;

function onLocaleChange(nextLocale: WorkbenchLocale) {
  locale.value = nextLocale;
}
</script>
```

Use `v-model:locale` or `:locale` plus `@update:locale` when the host owns the language setting. Use `default-locale="zh-CN"` for uncontrolled Workbench state that starts in Simplified Chinese. `:show-locale-switcher="false"` hides the built-in switch, and `:locale-switcher-disabled="isSaving"` keeps it visible but disabled while host UI is busy.

Locale, switch visibility, switch disabled state, dictionaries, translated copy, and host `translate` callbacks are session or host UI state. Do not store them in `SceneSnapshot`, `.ek3d`, command history, asset records, or runtime metadata. Pinia or another host store may keep language preference outside the editor snapshot. Authored file names, asset labels, object names, and project metadata remain authored values; they are interpolated into messages and are not translated by default.

`EditorWorkbench` installs shared shortcut handling on the workbench root and ignores editable controls. Copy, paste, duplicate, delete, group, ungroup, select all, and clear selection route through core `editor.operations`, so Vue does not duplicate node hierarchy, payload cleanup, or clipboard semantics.

Problem panels expose file replacement for recoverable asset problems and pass the selected `File` to `editor.replaceAsset()` for the same asset ID. The Vue layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement box selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, GLB internal hierarchy editing, per-submesh material discovery, or hosted runtime publishing.
