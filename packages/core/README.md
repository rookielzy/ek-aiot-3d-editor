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
- `paste-objects` accepts legacy v1 object and v2 node clipboard payloads, plus current v2 object and v3 node payloads that may carry durable data-source configuration.
- `set-material` stores a small `MeshStandardMaterial` override subset with texture-slot references.
- `set-environment` stores source-based lighting/background/skybox intent without PMREM or loaded textures. Legacy v6-style `mode` patches are normalized for compatibility.
- `add-light`, `update-light`, and `remove-light` store durable light authoring data and keep light nodes synchronized with light payloads.
- `create-data-connection`, `update-data-connection`, `duplicate-data-connection`, and `delete-data-connection` store HTTP/HTTPS connection configuration under the v9 `dataSources` domain. None, bearer, and API-key authentication store only a host credential reference (plus the non-secret API-key header name); credentials stay in runtime. Auth-reserved header names cannot be used by public or query headers.
- `create-data-query`, `update-data-query`, `duplicate-data-query`, and `delete-data-query` store named GET or confirmed read-only POST requests, paths, query headers, typed parameters with path/query/body locations, optional business success conditions, device property mappings, and refresh/max-age policies as one undoable configuration change. Duplicate queries receive new IDs and connection-scoped unique names; queries referenced by bindings cannot be deleted, and referenced properties/parameters cannot be removed or retyped.
- `set-data-object-binding` and `delete-data-object-binding` store one valid binding per object node, including one mapped property with ordered status-color rules. Targets are limited to whole object nodes; imported targets require an explicit owner, and group/light/camera targets are rejected. Deleting an object node removes its binding.

`editor.getDataService()` builds and runs manual GET or read-only POST query drafts without a viewport. Pass `createEditor({ executor })` to give it a host-owned request executor; core sends the method, read-only confirmation, resolved URL, merged non-secret headers, typed JSON body, auth descriptor, credential reference, timeout, host response limit, and `AbortSignal`, then exposes status, raw text, parsed JSON, elapsed time, and diagnostics through a subscription. The service never calls global `fetch`, never writes request drafts or responses into snapshots/history, aborts on cancel, and rejects late responses after invalidation or disposal. HTTP failures, auth failures, optional business-condition failures, empty 204 responses, non-JSON bodies, JSON parse failures, and over-limit responses produce distinct problems. POST is never polled or retried automatically: it runs only for manual tests, the first preview, or an explicit refresh. `buildDataQueryRequest()` is also exported for hosts that want to preview or validate a resolved draft before execution; `buildDataGetRequest()` remains as its GET-compatible alias.

The same service exposes object-data preview with automatic GET polling and manual POST refreshes. `startPreview()` enables preview and refreshes once, `refreshPreview()` retries the current enabled contexts without queueing a parallel request for an in-flight context, and `stopPreview()` aborts in-flight work, clears every object runtime state, and keeps durable bindings. Each enabled binding resolves its own effective parameters and device by exact `entityId`; bindings with equal query, effective parameters, connection/query configuration, query headers, and host auth revision share one request context. At most four contexts request concurrently and the rest are deduplicated in a queue; GET polling is scheduled only after a request completes, while POST contexts run only on first preview or explicit refresh. Runtime states carry mapped fields, received/observed times, quality, independent receive/source-sample freshness, retained history values, and explicit problems. `buildDataObjectDetailModel()` derives ordered detail fields, label overrides, units, precision, failure reasons, and history receive times from the snapshot plus runtime state without writing anything back. Configuration changes, auth revision changes, executor replacement, stop, and dispose cancel old generations and reject late responses; affected contexts restart while unrelated results stay current. Results never add history or change the snapshot.

`editor.getDataColorService()` derives runtime status colors from the same object data. Ordered boolean/string equality rules and numeric comparisons or one inclusive interval stop at the first match; no match, missing/invalid values, stale data, bad/uncertain quality, errors, empty results, disabled bindings, stop, and dispose restore the latest authored material. Unknown quality remains usable. Colors live on projection-owned `MeshStandardMaterial` clones applied after authored material projection, so shared GLB materials/textures and non-target objects stay untouched; unsupported mixed materials are reported per object without failing the binding. Reprojection after selection or a late model load reapplies active colors, while reimport/replace stops preview and releases old projection resources. `startTrial()` applies explicit sample/test values to one object only while global preview is off; `endTrial()`, target removal, configuration edits, preview start, undo/redo, restore, import, and dispose end it without requests, saves, or history. The React form also ends a trial when its target changes. While global preview runs, core rejects transform/material authoring commands with a `data-preview-locked` error and disables runtime transform controls; selection, camera navigation, and data configuration remain available.

`mapDataQueryBody()` turns an in-memory response body plus a saved `DataQueryMapping` into standard device samples with `connectionId`, `queryId`, `entityId`, property values, observed/received timestamps, and source quality. `validateDataQueryMapping()` exposes the same identity, path, transform, range, time, and quality rules for authoring. Array and single-object modes preserve string IDs, require explicit numeric conversion, isolate field failures, and treat duplicate entity IDs or invalid roots as whole-result failures. Samples, example JSON, and test overrides remain runtime-only.

`editor.operations` exposes core-backed helpers for copy, paste, duplicate, delete, group, ungroup, select all, and clear selection. Default calls operate on node selection; calls with explicit object IDs keep object-only compatibility. Clipboard payloads are transient JSON editor data; current v2 object and v3 node payloads carry a durable `dataSources` fragment with bindings and the queries/connections they reference (including `credentialRef`, never credential contents), while legacy v1 object and v2 node payloads still paste without data configuration. Cross-editor paste reuses identical definitions, clones conflicting ids with unique names, rewrites query and connection references, and maps binding keys onto the pasted object node ids. Clipboard data does not contain browser clipboard state, files, blobs, object URLs, loaded Three.js objects, resolver output, project payload bytes, request drafts, samples, responses, test values, executors, or secrets.

## Inspector Helpers

Core exports a framework-neutral inspector contract through `buildInspectorModel()` and command builders for transform, material, environment, and light fields. The model is pure JSON-compatible data derived from a snapshot plus optional runtime problems. Framework packages render it and dispatch the returned commands; they do not mutate snapshots, Three.js objects, or runtime resources directly.

The inspector helpers cover selected node transforms when available, selected object node `MeshStandardMaterial` overrides, ordered node selection metadata, texture-slot asset references, scene lighting/background/skybox source fields, selected light node editing, light list/add/update/remove behavior, and runtime/authored problem display metadata.

Framework workbench shells are composition adapters over this core contract. They may arrange the viewport, inspector, runtime problem display, and framework-native extension regions, but durable behavior remains in core commands, snapshots, serialization, restore, and runtime projection.

## Problems

Resolver, runtime, and project package diagnostics use a structured problem contract with severity, source, target, asset references, recoverability, and display metadata. Runtime problems are observable through `EditorRuntime.subscribeProblems()` and can be shown by inspector panels. Snapshot validation and command failures currently return controlled string errors. Derived resolver/runtime problems are not written into snapshots unless a future explicit recovery command does so.

## Deferred Runtime and UX Work

GLB internal hierarchy editing, per-submesh material slot discovery, shadow controls, advanced light helper gizmos, cloud asset libraries, marketplace metadata, durable upload queues, continuous data preview scheduling and data-driven object appearance, Agent command proposal runtime, hosted publishing, and advanced decoder configuration remain follow-up work.
