# EK AIoT 3D Editor

Experimental `0.x` workspace for a snapshot-first 3D editor contract.

Detailed Chinese project documentation starts at [docs/README.md](docs/README.md).

The core contract now stores a versioned scene snapshot. Version 2 keeps the first proof loop intact and adds durable authoring data for:

- object-level `MeshStandardMaterial` overrides and texture-slot asset references
- scene background/environment intent, including image and HDR asset references
- editable light definitions for ambient, directional, hemisphere, point, and spot lights
- richer framework-neutral problem metadata for validation, resolver, and runtime diagnostics

The proof loop remains intentionally narrow, but the local React and Vue demos now expose it as an interactive workbench:

- import a GLB through a stable asset reference
- select the imported object
- orbit/reset/frame the transient camera without serializing camera state
- click/select through the viewport or hierarchy
- commit one transform command, including visual gizmo-backed transactions in the runtime
- undo and redo that transform
- edit supported object-level `MeshStandardMaterial` overrides and project them visibly at runtime
- serialize a portable JSON snapshot
- restore the snapshot into an equivalent core/runtime scene
- export/import an experimental `.ek3d` project package when binary payloads should travel with the snapshot
- surface and recover a missing asset by stable asset ID

## Packages

- `@ek-aiot/3d-editor-core`: durable scene snapshot, commands/history, asset references, Three.js runtime projection, lifecycle API
- `@ek-aiot/3d-editor-vue`: Vue lifecycle adapter, primitive viewport/inspector components, and a scoped-slot workbench shell
- `@ek-aiot/3d-editor-react`: React external-store hook, primitive viewport/inspector components, and a render-prop workbench shell

The packages are prepared for public npm publication as experimental `0.x` packages. Versioning and changelogs use Changesets, and publishable artifacts are verified from packed npm tarballs before publishing. See [docs/release.md](docs/release.md) for the release workflow, trusted publishing setup, token fallback, and first-release checklist.

Durable editor state lives only in the versioned scene snapshot. Three.js objects, framework component state, `File`, `Blob`, object URLs, loaded textures, PMREM outputs, and resolver outputs are runtime inputs, not serializable state.

Portable local projects use a separate `.ek3d` package surface. A package contains `project.json`, `scene.json`, and `assets/*` payload entries. Core validates package manifests and archive paths, registers packaged payloads into a transient project asset store, and lets recoverable problem UI replace a missing payload by stable asset ID. JSON snapshots remain binary-free.

The core Three.js runtime now consumes the environment and light parts of that snapshot. Solid backgrounds, texture/HDR backgrounds, HDR or image-based scene environment lighting, PMREM output when backed by the default WebGL renderer, and ambient/hemisphere/directional/point/spot lights are projected from durable asset references and light definitions. Resolver, loader, and PMREM failures are exposed as runtime problems instead of being written back into the snapshot.

Vue and React packages now include a shared inspector surface over the core contract. The inspector can edit selected-object transforms and material overrides, scene environment/background settings, and ambient/hemisphere/directional/point/spot lights through core commands. It also displays runtime/authored problem metadata without serializing transient runtime failures.

The framework packages also expose `EditorWorkbench` and `useWorkbench()` convenience surfaces. They compose the existing viewport, inspector, snapshot subscription, runtime problem observation, project import/export, asset replacement, and command dispatch into a compact editor shell. React customization uses render props; Vue customization uses scoped slots. These shell extension regions receive the core editor, current snapshot, inspector model, runtime problems, and dispatch helper, but they do not expose private runtime projectors or create a core plugin API.

## Local Demo Verification

- `pnpm dev:demo:react`: run the React proof-loop workbench locally.
- `pnpm dev:demo:vue`: run the Vue proof-loop workbench locally.
- `pnpm test:browser`: run headless Chromium browser tests for picking, transform controls, canvas smoke checks, and React/Vue demo checklist parity.

Run `pnpm exec playwright install chromium` once before `pnpm test:browser` on a fresh machine. Linux CI images may also need Playwright's Chromium system dependencies installed.

In each framework demo, the visible validation path is camera helper use, hierarchy or viewport selection, transform/history, material inspector edit, hierarchy operation, project export/reopen, and missing-asset replacement. The checklist is derived UI state; it is not written into snapshots or `.ek3d` packages.

## Release Commands

- `pnpm changeset`: record package-facing release intent.
- `pnpm release:version`: apply Changesets version and changelog updates for a release PR.
- `pnpm release:verify`: build, typecheck, test, browser-test, pack all publishable packages, and verify consumer root imports from tarballs.
- `pnpm release:publish`: run release verification and publish through Changesets from CI.

## Current Non-Goals

Box/lasso selection, system clipboard formats, full asset libraries, cloud asset storage, model marketplaces, local import queues, dockable or persisted layouts, schema-driven inspector plugins, per-submesh material slot discovery, full GLTF material graph editing, shadows, advanced light helpers, animation timelines, data binding, event orchestration, hosted publishing, stable non-`0.x` API guarantees, and Le5le-style low-code runtime workflows are deferred follow-up work.
