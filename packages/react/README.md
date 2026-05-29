# @ek-aiot/3d-editor-react

Thin React adapter over `@ek-aiot/3d-editor-core`.

`useEditor()` creates or returns a core editor. `useEditorSnapshot()` uses React external-store subscription semantics. `EditorViewport` mounts and disposes the core runtime through React effects.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected-object transform/material fields, scene environment/background, lights, and runtime problems. Edits dispatch core commands on commit boundaries, so undo/redo remains owned by core history.

The inspector does not implement hierarchy selection, asset replacement, texture upload, or material texture runtime projection.
