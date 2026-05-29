# @ek-aiot/3d-editor-core

Core owns the editor contract: scene snapshots, commands, history, asset references, runtime projection, serialization, restore, and disposal.

Use `createEditor()` to create a framework-neutral editor, dispatch commands, subscribe to snapshots, mount a runtime into a DOM container, and serialize or restore state.

## Snapshot Contract

Snapshots are portable JSON-compatible records. Version 2 stores GLB scene objects plus durable schema namespaces for material overrides, environment/background intent, lights, and authored problem metadata. Version 1 proof-loop snapshots restore through the migration path and are normalized into the current schema.

Runtime values are never saved. Hosts may register GLB, texture, HDR, or image assets with runtime `source` values, but snapshots only keep stable asset references.

## Commands

All durable edits enter through commands so undo/redo remains framework-neutral:

- `import-glb`, `select-object`, and `set-transform` preserve the first proof loop.
- `register-asset` records stable GLB, texture, HDR, or image asset references.
- `set-material` stores a small `MeshStandardMaterial` override subset with texture-slot references.
- `set-environment` stores background/environment intent without PMREM or loaded textures.
- `add-light`, `update-light`, and `remove-light` store durable light authoring data.

## Problems

Validation, resolver, and runtime diagnostics use a structured problem contract with severity, source, target, asset references, recoverability, and display metadata. Resolver/runtime problems are derived by default and are not written into snapshots unless a future explicit recovery command does so.

## Deferred Runtime and UX Work

The schema is intentionally ahead of the visual editor surface. Full HDR/PMREM rendering, skybox polish, texture lifecycle policy, shadow controls, light helpers, material inspectors, environment panels, and project archive workflows are follow-up work.
