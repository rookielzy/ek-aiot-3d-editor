# @ek-aiot/3d-editor-react

Thin React adapter over `@ek-aiot/3d-editor-core`.

This package is experimental `0.x`. It tracks the current core package contract and does not promise 1.0 API stability, cloud asset libraries, marketplace behavior, data binding, hosted runtime publishing, or Le5le-style low-code features. Release process details live in the repository release guide.

`useEditor()` creates or returns a core editor. `useEditorSnapshot()` uses React external-store subscription semantics. `EditorViewport` mounts and disposes the core runtime through React effects.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected node transform availability, object/material fields, scene lighting/background/skybox source fields, selected light nodes, and runtime problems. Edits dispatch core commands on commit boundaries, so undo/redo remains owned by core history.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a compact viewport-plus-inspector shell. Pass an existing editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench.

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

Render-prop regions receive the core editor, current snapshot, inspector model, runtime problems, active light state, selected node/object/light IDs, advanced operation helpers, selection count, project import/export helpers, asset replacement, and a dispatch helper. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; React shell code does not resolve assets or serialize runtime problems.

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

Use `locale` and `onLocaleChange` when the host owns the language setting. Use `defaultLocale="zh-CN"` for uncontrolled Workbench state that starts in Simplified Chinese. `showLocaleSwitcher={false}` hides the built-in switch, and `localeSwitcherDisabled={isSaving}` keeps it visible but disabled while host UI is busy.

Locale, switch visibility, switch disabled state, dictionaries, translated copy, and host `translate` callbacks are session or host UI state. Do not store them in `SceneSnapshot`, `.ek3d`, command history, asset records, or runtime metadata. Authored file names, asset labels, object names, and project metadata remain authored values; they are interpolated into messages and are not translated by default.

`EditorWorkbench` installs shared shortcut handling on the workbench root and ignores editable controls. Copy, paste, duplicate, delete, group, ungroup, select all, and clear selection route through core `editor.operations`, so React does not duplicate node hierarchy, payload cleanup, or clipboard semantics.

Problem panels expose file replacement for recoverable asset problems and pass the selected `File` to `editor.replaceAsset()` for the same asset ID. The React layer does not store files in snapshots and does not implement its own asset resolver, package validator, or runtime cleanup.

The workbench and inspector do not implement box selection, full asset libraries, texture upload queues, persisted layouts, schema-driven inspector plugins, GLB internal hierarchy editing, per-submesh material discovery, or hosted runtime publishing.
