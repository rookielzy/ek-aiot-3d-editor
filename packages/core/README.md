# @ek-aiot/3d-editor-core

Core owns the editor contract: scene snapshots, commands, history, asset references, runtime projection, serialization, restore, and disposal.

This package is experimental `0.x`. It is suitable for validating the current snapshot-first contract, but it does not promise 1.0 API stability, Le5le-style low-code features, cloud asset libraries, marketplace behavior, continuous data scheduling or data-driven appearance, or hosted runtime publishing. Release process details live in the repository release guide.

Use `createEditor()` to create a framework-neutral editor, dispatch commands, subscribe to snapshots, mount a runtime into a DOM container, and serialize or restore state.

## Snapshot Contract

Snapshots are portable JSON-compatible records. The current v9 schema stores a canonical `SceneNode` / `NodeId` graph, authored camera views, source-based environment lighting/background state, and a `dataSources` domain for HTTP connections, saved query definitions, device property mappings, and object bindings (query, device, parameter overrides, enabled state, ordered detail fields). Version 1/2/3/4/5/6/7/8 snapshots restore through the migration path and are normalized into the current schema.

Runtime values are never saved. Hosts may register GLB, texture, HDR, or image assets with runtime `source` values, but snapshots only keep stable asset references.

When mounted, the core runtime projects the node graph, GLB payloads, scene lighting/background/skybox source intent, and durable light definitions into Three.js. Texture, image, HDR, and cubemap face assets are resolved through the same `AssetResolverBridge` boundary as GLB assets. With the default Three.js `WebGLRenderer`, HDR/equirectangular/cubemap environment lighting is converted to runtime-only PMREM output; custom `RendererLike` test renderers use the raw resolved texture unless they are backed by a real Three.js WebGL renderer. Stale textures, cubemaps, render targets, projected groups, light objects, and light target objects are disposed through the runtime lifecycle.

## Project Packages

Use `editor.serialize()` when you only need the JSON scene snapshot. Use `editor.exportProject()` when the user needs a portable local project file that includes the snapshot plus available binary asset payloads.

The experimental `.ek3d` project package is a ZIP container with:

- `project.json`: versioned package manifest, completeness flag, and asset records
- `scene.json`: the normal serialized `SceneSnapshot`
- `assets/*`: GLB, texture, HDR, or image payload bytes referenced by asset ID

Import validates archive shape, entry paths, manifest records, scene snapshot, payload references, and size limits before replacing editor state. Old scene snapshots are migrated to the current schema during import. Export fails by default when a referenced payload is unavailable; callers can opt into `partial: true`, which marks the manifest as partial and reports structured package problems. The package manifest remains version 1 because the package layout is unchanged.

`editor.replaceAsset({ assetId, source })` replaces the transient payload for an existing asset ID. Scene objects, materials, environment sources, cubemap faces, and authored problem state keep their durable references. Mounted runtimes retry projection through the project-aware resolver; successful recovery removes derived runtime problems without writing resolver output, `File`, `Blob`, object URLs, loaded textures, cubemaps, or PMREM output into the snapshot.

## Commands

All durable edits enter through commands so undo/redo remains framework-neutral:

- `import-glb`, `select-node`, `select-nodes`, `create-group`, `delete-nodes`, `group-nodes`, `ungroup-nodes`, `reparent-node`, and `set-node-transform` own node-native hierarchy and target semantics.
- `select-object`, `select-objects`, `set-transform`, `delete-objects`, `duplicate-objects`, `group-objects`, `ungroup-objects`, and `reparent-object` preserve object-only compatibility by resolving object payload IDs to object nodes.
- `batch` records composite operations as one undoable history entry.
- `register-asset` records stable GLB, texture, HDR, or image asset references.
- `paste-objects` accepts legacy v1 object clipboard payloads and current v2 node clipboard payloads.
- `set-material` stores a small `MeshStandardMaterial` override subset with texture-slot references.
- `set-environment` stores source-based lighting/background/skybox intent without PMREM or loaded textures. Legacy v6-style `mode` patches are normalized for compatibility.
- `add-light`, `update-light`, and `remove-light` store durable light authoring data and keep light nodes synchronized with light payloads.
- `create-data-connection`, `update-data-connection`, `duplicate-data-connection`, and `delete-data-connection` store HTTP/HTTPS connection configuration under the v9 `dataSources` domain. Bearer authentication stores only a host credential reference; credentials stay in runtime.
- `create-data-query`, `update-data-query`, `duplicate-data-query`, and `delete-data-query` store named query paths, typed parameters, and device property mappings as one undoable configuration change. Duplicate queries receive new IDs and connection-scoped unique names; queries referenced by bindings cannot be deleted, and referenced properties/parameters cannot be removed or retyped.
- `set-data-object-binding` and `delete-data-object-binding` store one valid binding per object node. Targets are limited to whole object nodes; imported targets require an explicit owner, and group/light/camera targets are rejected. Deleting an object node removes its binding.

`editor.getDataService()` builds and runs manual GET query drafts without a viewport. Pass `createEditor({ executor })` to give it a host-owned request executor; core sends a resolved URL, non-secret headers, a credential reference, timeout, and `AbortSignal`, then exposes status, raw text, parsed JSON, elapsed time, and diagnostics through a subscription. The service never calls global `fetch`, never writes request drafts or responses into snapshots/history, aborts on cancel, and rejects late responses after invalidation or disposal. `buildDataGetRequest()` is also exported for hosts that want to preview or validate a resolved draft before execution.

The same service exposes manual object-data preview. `startPreview()` enables preview and refreshes once, `refreshPreview()` runs only while preview is enabled, and `stopPreview()` aborts in-flight work, clears every object runtime state, and keeps durable bindings. Each enabled binding resolves its own effective parameters and device by exact `entityId`; runtime states carry mapped fields, received/observed times, quality, and explicit problems. `buildDataObjectDetailModel()` derives ordered detail fields, label overrides, units, precision, and failure reasons from the snapshot plus runtime state without writing anything back. Configuration changes cancel and clear runtime for the affected objects while unrelated results stay current; affected objects require another explicit refresh. Results never add history or change the snapshot.

`mapDataQueryBody()` turns an in-memory response body plus a saved `DataQueryMapping` into standard device samples with `connectionId`, `queryId`, `entityId`, property values, observed/received timestamps, and source quality. `validateDataQueryMapping()` exposes the same identity, path, transform, range, time, and quality rules for authoring. Array and single-object modes preserve string IDs, require explicit numeric conversion, isolate field failures, and treat duplicate entity IDs or invalid roots as whole-result failures. Samples, example JSON, and test overrides remain runtime-only.

`editor.operations` exposes core-backed helpers for copy, paste, duplicate, delete, group, ungroup, select all, and clear selection. Default calls operate on node selection; calls with explicit object IDs keep object-only compatibility. Clipboard payloads are transient JSON editor data; v2 payloads can carry group/object/light node subtrees while v1 object payloads still paste into v4 editors. Clipboard data does not contain browser clipboard state, files, blobs, object URLs, loaded Three.js objects, resolver output, or project payload bytes.

## Inspector Helpers

Core exports a framework-neutral inspector contract through `buildInspectorModel()` and command builders for transform, material, environment, and light fields. The model is pure JSON-compatible data derived from a snapshot plus optional runtime problems. Framework packages render it and dispatch the returned commands; they do not mutate snapshots, Three.js objects, or runtime resources directly.

The inspector helpers cover selected node transforms when available, selected object node `MeshStandardMaterial` overrides, ordered node selection metadata, texture-slot asset references, scene lighting/background/skybox source fields, selected light node editing, light list/add/update/remove behavior, and runtime/authored problem display metadata.

Framework workbench shells are composition adapters over this core contract. They may arrange the viewport, inspector, runtime problem display, and framework-native extension regions, but durable behavior remains in core commands, snapshots, serialization, restore, and runtime projection.

## Problems

Resolver, runtime, and project package diagnostics use a structured problem contract with severity, source, target, asset references, recoverability, and display metadata. Runtime problems are observable through `EditorRuntime.subscribeProblems()` and can be shown by inspector panels. Snapshot validation and command failures currently return controlled string errors. Derived resolver/runtime problems are not written into snapshots unless a future explicit recovery command does so.

## Deferred Runtime and UX Work

GLB internal hierarchy editing, per-submesh material slot discovery, shadow controls, advanced light helper gizmos, cloud asset libraries, marketplace metadata, durable upload queues, continuous data preview scheduling and data-driven object appearance, Agent command proposal runtime, hosted publishing, and advanced decoder configuration remain follow-up work.
