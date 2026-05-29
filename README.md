# EK AIoT 3D Editor

Experimental `0.x` workspace for a snapshot-first 3D editor contract.

The core contract now stores a versioned scene snapshot. Version 2 keeps the first proof loop intact and adds durable authoring data for:

- object-level `MeshStandardMaterial` overrides and texture-slot asset references
- scene background/environment intent, including image and HDR asset references
- editable light definitions for ambient, directional, hemisphere, point, and spot lights
- richer framework-neutral problem metadata for validation, resolver, and runtime diagnostics

The proof loop remains intentionally narrow:

- import a GLB through a stable asset reference
- select the imported object
- commit one transform command
- undo and redo that transform
- serialize a portable JSON snapshot
- restore the snapshot into an equivalent core/runtime scene

## Packages

- `@ek-aiot/3d-editor-core`: durable scene snapshot, commands/history, asset references, Three.js runtime projection, lifecycle API
- `@ek-aiot/3d-editor-vue`: Vue lifecycle adapter, primitive viewport/inspector components, and a scoped-slot workbench shell
- `@ek-aiot/3d-editor-react`: React external-store hook, primitive viewport/inspector components, and a render-prop workbench shell

Durable editor state lives only in the versioned scene snapshot. Three.js objects, framework component state, `File`, `Blob`, object URLs, loaded textures, PMREM outputs, and resolver outputs are runtime inputs, not serializable state.

The core Three.js runtime now consumes the environment and light parts of that snapshot. Solid backgrounds, texture/HDR backgrounds, HDR or image-based scene environment lighting, PMREM output when backed by the default WebGL renderer, and ambient/hemisphere/directional/point/spot lights are projected from durable asset references and light definitions. Resolver, loader, and PMREM failures are exposed as runtime problems instead of being written back into the snapshot.

Vue and React packages now include a shared inspector surface over the core contract. The inspector can edit selected-object transforms and material overrides, scene environment/background settings, and ambient/hemisphere/directional/point/spot lights through core commands. It also displays runtime/authored problem metadata without serializing transient runtime failures.

The framework packages also expose `EditorWorkbench` and `useWorkbench()` convenience surfaces. They compose the existing viewport, inspector, snapshot subscription, runtime problem observation, and command dispatch into a compact editor shell. React customization uses render props; Vue customization uses scoped slots. These shell extension regions receive the core editor, current snapshot, inspector model, runtime problems, and dispatch helper, but they do not expose private runtime projectors or create a core plugin API.

## Current Non-Goals

Hierarchy panels, durable light selection, full toolbar systems, dockable or persisted layouts, schema-driven inspector plugins, material texture projection onto GLB meshes, shadows, helper gizmos, asset replacement/project archive flows, decoder configuration, multi-select, data binding, event orchestration, and release automation are deferred follow-up work.
