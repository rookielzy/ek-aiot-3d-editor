# @ek-aiot/3d-editor-react

Thin React adapter over `@ek-aiot/3d-editor-core`.

This package is experimental `0.x`. It tracks the current core package contract and does not promise 1.0 API stability, cloud asset libraries, marketplace behavior, data binding, hosted runtime publishing, or Le5le-style low-code features. Release process details live in the repository release guide.

`useEditor()` creates or returns a core editor. `useEditorSnapshot()` uses React external-store subscription semantics. `EditorViewport` mounts and disposes the core runtime through React effects.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected node transform availability, object/material fields, scene lighting/background/skybox source fields, selected light nodes, and runtime problems. Edits dispatch core commands on commit boundaries, so undo/redo remains owned by core history.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a package-owned professional editor workbench: narrow Scene/Assets/Project navigation and left workspace, central viewport tools, Object/Environment/Scene inspector groups, grouped status bar, and a problem drawer. Project open/export and locale controls live in Project menu; transform, snap, camera, helper, and node commands remain directly reachable over the viewport. Both side panels can be collapsed or resized by pointer or keyboard. Pass an existing editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench.

The Data workspace can create reusable HTTP connections and run a manual GET request draft without saving a query. Pass a host-owned `executor` to `EditorWorkbench`/`useEditor` to enable real requests; without one, the UI reports a locatable problem and remains offline. Request summaries, raw responses, parsed JSON, elapsed time, test overrides, cancellation, and diagnostics stay in the current session and never enter the snapshot or project package. See `docs/integration-react.md` in the repository for the executor contract.

```tsx
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";

const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null);

function Workbench() {
  const editor = useEditor();

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      toolbar={({ dispatch }) => (
        <button onClick={() => dispatch({ type: "set-node-transform", nodeId: "box", transform: { position: [1, 0, 0] } })}>
          Move
        </button>
      )}
      status={({ runtimeProblems }) => <span>{runtimeProblems.length} runtime problems</span>}
    />
  );
}
```

Render-prop regions receive the core editor, current snapshot, inspector model, runtime problems, active light state, selected node/object/light IDs, advanced operation helpers, selection count, project import/export helpers, asset replacement, and a dispatch helper. The regions are `toolbar`, `leftPanel`, compatibility `sidePanel`, `viewportOverlay`, `rightPanel`, and `status`; `leftPanel` wins over `sidePanel`, and `showDefaultToolbar={false}` hides package tools without hiding a supplied host toolbar. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; React shell code does not resolve assets or serialize runtime problems.

## Default Workbench Styling

The default Workbench imports a compact package-owned visual system from `@ek-aiot/3d-editor-react/styles.css`. It uses semantic `--ek-workbench-*` CSS variables for surfaces, text, borders, accents, severity tones, focus rings, compact control heights, spacing, and radius. Hosts can override those variables on `.ek-workbench` or a wrapping container without replacing the default components.

The command bar uses an internal icon layer backed by `@phosphor-icons/react`. Consumers do not install icon packages, import icon components, or receive icon types through public props; icon rendering remains an implementation detail behind the React package surface.

## Bilingual Workbench UI

The default Workbench UI ships with built-in `en` and `zh-CN` dictionaries and defaults to English. No third-party i18n runtime is required. Keep imports at the package root and the public CSS subpath:

```tsx
import { useMemo, useState } from "react";
import {
  EditorWorkbench,
  type WorkbenchLocale,
  type WorkbenchTranslate
} from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";

function BilingualWorkbench() {
  const [locale, setLocale] = useState<WorkbenchLocale>("zh-CN");
  const isSaving = false;
  const translate = useMemo<WorkbenchTranslate>(() => (descriptor, activeLocale) =>
    descriptor.key === "reactWorkbench.status.saved" && activeLocale === "zh-CN"
      ? "已保存"
      : undefined,
  []);

  return (
    <EditorWorkbench
      locale={locale}
      onLocaleChange={setLocale}
      showLocaleSwitcher={false}
      localeSwitcherDisabled={isSaving}
      translate={translate}
      status={({ i18n }) => <span>{i18n.t("reactWorkbench.status.saved")}</span>}
    />
  );
}
```

Use `locale` and `onLocaleChange` when the host owns the language setting. The toolbar language button shows the destination language (简体中文 or English) and switches with one click; the language selector is also available in Project menu. Use `defaultLocale="zh-CN"` for uncontrolled Workbench state that starts in Simplified Chinese. `showLocaleSwitcher={false}` hides both built-in controls, and `localeSwitcherDisabled={isSaving}` keeps them visible but disabled while host UI is busy. Switching locale does not replace the editor/runtime or clear selection, history, or viewport state.

The displayed language is saved to browser `localStorage` under `ek-aiot.workbench.locale`, shared by React and Vue shells on the same origin. On a fresh mount, a valid saved language takes priority over `defaultLocale`; an explicit controlled `locale` takes priority over the cache and is saved when its displayed value changes. Invalid or unavailable storage falls back to the configured default (English if omitted), and storage failures do not block switching.

Locale is a browser or host UI preference. Switch visibility, switch disabled state, dictionaries, translated copy, and host `translate` callbacks are session or host UI state. Do not store them in `SceneSnapshot`, `.ek3d`, command history, asset records, or runtime metadata. Authored file names, asset labels, object names, and project metadata remain authored values; they are interpolated into messages and are not translated by default.

`EditorWorkbench` installs shared shortcut handling on the workbench root and ignores editable controls. Copy, paste, duplicate, delete, group, ungroup, select all, and clear selection route through core `editor.operations`, so React does not duplicate node hierarchy, payload cleanup, or clipboard semantics.

The bottom status bar summarizes problems; Problem details opens the full drawer with severity, source, and file replacement for recoverable assets. Closing and reopening the drawer preserves the diagnostics. Replacement passes the selected `File` to `editor.replaceAsset()` for the same asset ID. The React layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement box selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, GLB internal hierarchy editing, per-submesh material discovery, or hosted runtime publishing.
## Inspector form controls

The Inspector uses internally adapted shadcn/ui controls. Import
`@ek-aiot/3d-editor-react/styles.css` as before; consumers do not need Tailwind
configuration. The package compiles prefixed utilities without a global reset.
Select and color popovers inherit the current editor's theme and render outside
the scrollable panel to avoid clipping.

Number and text fields keep local drafts until Enter or blur. Escape cancels the
draft and clears its validation feedback. Invalid input stays visible without
changing the scene. IME confirmation does not submit text. Switching edit targets
discards unfinished input; history or external changes to that field replace its
draft. Unrelated field updates preserve the draft.

Enum choices and switches commit immediately; asset choices support search and
an explicit None option where Core permits clearing. Colors are edited in a
popover using a picker or six-digit hex value. Apply commits once; Cancel, Escape
or outside dismissal leaves the scene unchanged. Color previews are local to the
control until Apply. Explicit default-valued material edits can still create an
override; repeated unchanged authored values do not add history entries.
