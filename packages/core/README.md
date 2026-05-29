# @ek-aiot/3d-editor-core

Core owns the editor contract: scene snapshots, commands, history, asset references, runtime projection, serialization, restore, and disposal.

Use `createEditor()` to create a framework-neutral editor, dispatch commands, subscribe to snapshots, mount a runtime into a DOM container, and serialize or restore state.

## Snapshot Contract

Snapshots are portable JSON-compatible records. Version 2 stores GLB scene objects plus durable schema namespaces for material overrides, environment/background intent, lights, and authored problem metadata. Version 1 proof-loop snapshots restore through the migration path and are normalized into the current schema.

Runtime values are never saved. Hosts may register GLB, texture, HDR, or image assets with runtime `source` values, but snapshots only keep stable asset references.

When mounted, the core runtime projects GLB objects, scene background/environment intent, and durable light definitions into Three.js. Texture and HDR environment assets are resolved through the same `AssetResolverBridge` boundary as GLB assets. With the default Three.js `WebGLRenderer`, HDR/equirectangular environment lighting is converted to runtime-only PMREM output; custom `RendererLike` test renderers use the raw resolved texture unless they are backed by a real Three.js WebGL renderer. Stale textures, render targets, light objects, and light target objects are disposed through the runtime lifecycle.

## Commands

All durable edits enter through commands so undo/redo remains framework-neutral:

- `import-glb`, `select-object`, and `set-transform` preserve the first proof loop.
- `register-asset` records stable GLB, texture, HDR, or image asset references.
- `set-material` stores a small `MeshStandardMaterial` override subset with texture-slot references.
- `set-environment` stores background/environment intent without PMREM or loaded textures.
- `add-light`, `update-light`, and `remove-light` store durable light authoring data.

## Problems

Resolver and runtime diagnostics use a structured problem contract with severity, source, target, asset references, recoverability, and display metadata. Snapshot validation and command failures currently return controlled string errors. Derived resolver/runtime problems are not written into snapshots unless a future explicit recovery command does so.

## Deferred Runtime and UX Work

The schema is intentionally ahead of the visual editor surface. Full material texture projection onto imported GLB meshes, shadow controls, light helpers, material inspectors, environment panels, project archive workflows, and advanced decoder configuration are follow-up work.
