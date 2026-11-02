# @ek-aiot/3d-editor-vue

Thin Vue adapter over `@ek-aiot/3d-editor-core`.

This package is experimental `0.x`. It tracks the current core package contract and does not promise 1.0 API stability, cloud asset libraries, marketplace behavior, continuous data scheduling beyond the core polling policy, hosted runtime publishing, or Le5le-style low-code features. Release process details live in the repository release guide.

`useEditor()` exposes the core editor and current snapshot through Vue refs. `EditorViewport` mounts the core runtime and disposes it through Vue lifecycle hooks.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected node transform availability, object/material fields, scene lighting/background/skybox source fields, selected light nodes, and runtime problems. Edits dispatch core commands on commit boundaries, while Vue only owns draft inputs and rendering lifecycle.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a professional default editor workbench: narrow Scene/Assets/Project navigation and left workspace, central viewport tools, Object/Environment/Scene inspector groups, grouped status chips, and a problem drawer. Project open/export and locale controls live in Project menu; transform, snap, camera, helper, and node commands remain directly reachable over the viewport. Both side panels can be collapsed or resized by pointer or keyboard. Pass a raw host-owned editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench. The composable keeps editor/runtime instances out of deep reactivity and exposes shallow snapshot/problem state.

`useEditor({ executor })` and the `executor` prop on `EditorWorkbench` pass a host `DataRequestExecutor` into core, paired with `credentials` and `authRevision` when the host resolves secrets. The resulting `editor.getDataService()` is framework-independent and performs no network access unless the host executor sends it; runtime response, timing, cancellation, and diagnostics stay out of the snapshot. The default workbench exposes the same data workspace as the React package: a Data view with connections and queries, connection/query forms, the request tester and the bindings dialog, plus the binding form, preview controls, and device detail card in the inspector. All of it calls the public core service, so the durable configuration and the runtime state behave identically across frameworks; `useWorkbench()` forwards `maxResponseBytes` as well.

Restoring a project that references host credentials returns `outcome.kind === "reconnect"`. The workbench reports it as "reconnection required" and keeps the configuration editable; supplying `executor`/`credentials` through `editor.getDataService().setHostCapabilities()` repairs the same open project without reopening the file.

The default command bar uses a private icon layer backed by `@phosphor-icons/vue`. Consumers do not install icon packages, import icon components, or receive icon types through public props; icon rendering remains an implementation detail behind the Vue package surface.

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

Scoped slots receive the core editor, current snapshot, inspector model, runtime problems, active light state, selected node/object/light IDs, advanced operation helpers, selection count, project import/export helpers, asset replacement, and a dispatch helper. The slots are `toolbar`, `leftPanel`, compatibility `sidePanel`, `viewportOverlay`, `rightPanel`, and `status`; `leftPanel` wins over `sidePanel`, and `show-default-toolbar="false"` hides package tools without hiding a supplied host toolbar. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; Vue shell code does not resolve assets or serialize runtime problems.

The package CSS exposes semantic `--ek-workbench-*` variables for surfaces, text, borders, accent, focus, spacing, radius, control height, and status tones. Hosts may override those variables after importing `@ek-aiot/3d-editor-vue/styles.css`; Vue does not require a host theme provider or third-party design system.

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

Use `v-model:locale` or `:locale` plus `@update:locale` when the host owns the language setting. The toolbar language button shows the destination language (简体中文 or English) and switches with one click; the language selector is also available in Project menu. Use `default-locale="zh-CN"` for uncontrolled Workbench state that starts in Simplified Chinese. `:show-locale-switcher="false"` hides both built-in controls, and `:locale-switcher-disabled="isSaving"` keeps them visible but disabled while host UI is busy. Switching locale does not replace the editor/runtime or clear selection, history, or viewport state.

The displayed language is saved to browser `localStorage` under `ek-aiot.workbench.locale`, shared by React and Vue shells on the same origin. On a fresh mount, a valid saved language takes priority over `default-locale`; an explicit controlled `locale` takes priority over the cache and is saved when its displayed value changes. Invalid or unavailable storage falls back to the configured default (English if omitted), and storage failures do not block switching.

Locale is a browser or host UI preference. Switch visibility, switch disabled state, dictionaries, translated copy, and host `translate` callbacks are session or host UI state. Do not store them in `SceneSnapshot`, `.ek3d`, command history, asset records, or runtime metadata. Pinia or another host store may keep language preference outside the editor snapshot. Authored file names, asset labels, object names, and project metadata remain authored values; they are interpolated into messages and are not translated by default.

`EditorWorkbench` installs shared shortcut handling on the workbench root and ignores editable controls. Copy, paste, duplicate, delete, group, ungroup, select all, and clear selection route through core `editor.operations`, so Vue does not duplicate node hierarchy, payload cleanup, or clipboard semantics.

The bottom status bar summarizes problems; Problem details opens the full drawer with severity, source, and file replacement for recoverable assets. Closing and reopening the drawer preserves the diagnostics. Replacement passes the selected `File` to `editor.replaceAsset()` for the same asset ID. The Vue layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement box selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, GLB internal hierarchy editing, per-submesh material discovery, or hosted runtime publishing.

## Inspector form controls

The Inspector uses internally adapted [shadcn-vue](https://www.shadcn-vue.com/) controls backed by Reka UI, matching the React shell. Import `@ek-aiot/3d-editor-vue/styles.css` as before; consumers do not need Tailwind configuration. The package compiles prefixed utilities without a global reset. Select and color popovers render outside the scrollable panel and inherit the current editor's theme.

Number and text fields commit on Enter or blur; Escape discards drafts and clears validation feedback. IME confirmation does not submit text. Switching targets discards unfinished input. Invalid drafts leave the scene unchanged. Asset choices support search and an explicit None option where Core permits clearing. Switches and enum choices commit immediately. Colors use a picker or six-digit hex value; Apply commits once, while Cancel, Escape and outside dismissal discard previews.
