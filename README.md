# EK AIoT 3D Editor

Experimental `0.x` workspace for a snapshot-first 3D editor contract.

The first proof loop is intentionally narrow:

- import a GLB through a stable asset reference
- select the imported object
- commit one transform command
- undo and redo that transform
- serialize a portable JSON snapshot
- restore the snapshot into an equivalent core/runtime scene

## Packages

- `@ek-aiot/3d-editor-core`: durable scene snapshot, commands/history, asset references, Three.js runtime projection, lifecycle API
- `@ek-aiot/3d-editor-vue`: Vue lifecycle adapter and viewport component
- `@ek-aiot/3d-editor-react`: React external-store hook and viewport component

Durable editor state lives only in the versioned scene snapshot. Three.js objects, framework component state, `File`, `Blob`, object URLs, and resolver outputs are runtime inputs, not serializable state.

## Current Non-Goals

Material editing, HDR/environment controls, full workbench UI, project archive format, decoder configuration, multi-select, data binding, event orchestration, and release automation are deferred until this core proof loop is stable.
