# @ek-aiot/3d-editor-vue

Thin Vue adapter over `@ek-aiot/3d-editor-core`.

`useEditor()` exposes the core editor and current snapshot through Vue refs. `EditorViewport` mounts the core runtime and disposes it through Vue lifecycle hooks.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected-object transform/material fields, scene environment/background, lights, and runtime problems. Edits dispatch core commands on commit boundaries, while Vue only owns draft inputs and UI-local light focus.

The inspector does not implement hierarchy selection, asset replacement, texture upload, or material texture runtime projection.
