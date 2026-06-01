# @ek-aiot/3d-editor-core

Core owns the editor contract: scene snapshots, commands, history, asset references, runtime projection, serialization, restore, and disposal.

This package is experimental `0.x`. It is suitable for validating the current snapshot-first contract, but it does not promise 1.0 API stability, Le5le-style low-code features, cloud asset libraries, marketplace behavior, data binding, or hosted runtime publishing. Release process details live in the repository release guide.

Use `createEditor()` to create a framework-neutral editor, dispatch commands, subscribe to snapshots, mount a runtime into a DOM container, and serialize or restore state.

## Snapshot Contract

Snapshots are portable JSON-compatible records. Version 3 stores GLB scene objects, ordered multi-object selection with a primary object, and durable schema namespaces for material overrides, environment/background intent, lights, and authored problem metadata. Version 1/2 snapshots restore through the migration path and are normalized into the current schema.

Runtime values are never saved. Hosts may register GLB, texture, HDR, or image assets with runtime `source` values, but snapshots only keep stable asset references.

When mounted, the core runtime projects GLB objects, scene background/environment intent, and durable light definitions into Three.js. Texture and HDR environment assets are resolved through the same `AssetResolverBridge` boundary as GLB assets. With the default Three.js `WebGLRenderer`, HDR/equirectangular environment lighting is converted to runtime-only PMREM output; custom `RendererLike` test renderers use the raw resolved texture unless they are backed by a real Three.js WebGL renderer. Stale textures, render targets, light objects, and light target objects are disposed through the runtime lifecycle.

## Project Packages

Use `editor.serialize()` when you only need the JSON scene snapshot. Use `editor.exportProject()` when the user needs a portable local project file that includes the snapshot plus available binary asset payloads.

The experimental `.ek3d` project package is a ZIP container with:

- `project.json`: versioned package manifest, completeness flag, and asset records
- `scene.json`: the normal serialized `SceneSnapshot`
- `assets/*`: GLB, texture, HDR, or image payload bytes referenced by asset ID

Import validates archive shape, entry paths, manifest records, scene snapshot, payload references, and size limits before replacing editor state. Export fails by default when a referenced payload is unavailable; callers can opt into `partial: true`, which marks the manifest as partial and reports structured package problems.

`editor.replaceAsset({ assetId, source })` replaces the transient payload for an existing asset ID. Scene objects, materials, environment fields, and authored problem state keep their durable references. Mounted runtimes retry projection through the project-aware resolver; successful recovery removes derived runtime problems without writing resolver output, `File`, `Blob`, object URLs, loaded textures, or PMREM output into the snapshot.

## Commands

All durable edits enter through commands so undo/redo remains framework-neutral:

- `import-glb`, `select-object`, `select-objects`, and `set-transform` preserve the first proof loop and add ordered multi-selection.
- `batch` records composite operations as one undoable history entry.
- `register-asset` records stable GLB, texture, HDR, or image asset references.
- `delete-objects`, `paste-objects`, `duplicate-objects`, `group-objects`, and `ungroup-objects` own advanced static-scene editing semantics.
- `set-material` stores a small `MeshStandardMaterial` override subset with texture-slot references.
- `set-environment` stores background/environment intent without PMREM or loaded textures.
- `add-light`, `update-light`, and `remove-light` store durable light authoring data.

`editor.operations` exposes core-backed helpers for copy, paste, duplicate, delete, group, ungroup, select all, and clear selection. Clipboard payloads are transient JSON editor data; they do not contain browser clipboard state, files, blobs, object URLs, loaded Three.js objects, resolver output, or project payload bytes.

## Inspector Helpers

Core exports a framework-neutral inspector contract through `buildInspectorModel()` and command builders for transform, material, environment, and light fields. The model is pure JSON-compatible data derived from a snapshot plus optional runtime problems. Framework packages render it and dispatch the returned commands; they do not mutate snapshots, Three.js objects, or runtime resources directly.

The inspector helpers cover primary selected-object transforms, primary selected-object `MeshStandardMaterial` overrides, ordered selection metadata, texture-slot asset references, scene environment/background fields, light list/add/update/remove behavior, and runtime/authored problem display metadata.

Framework workbench shells are composition adapters over this core contract. They may arrange the viewport, inspector, runtime problem display, and framework-native extension regions, but durable behavior remains in core commands, snapshots, serialization, restore, and runtime projection.

## Problems

Resolver, runtime, and project package diagnostics use a structured problem contract with severity, source, target, asset references, recoverability, and display metadata. Runtime problems are observable through `EditorRuntime.subscribeProblems()` and can be shown by inspector panels. Snapshot validation and command failures currently return controlled string errors. Derived resolver/runtime problems are not written into snapshots unless a future explicit recovery command does so.

## Deferred Runtime and UX Work

Material texture projection onto imported GLB meshes, per-submesh material slot discovery, shadow controls, light helper gizmos, cloud asset libraries, marketplace metadata, durable upload queues, and advanced decoder configuration remain follow-up work.
