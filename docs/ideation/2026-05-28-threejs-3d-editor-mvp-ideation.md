---
date: 2026-05-28
topic: threejs-3d-editor-mvp
focus: "MVP Three.js 3D visual editor with independent core, Vue3 shell, React shell, and npm publishing"
mode: repo-grounded
---

# Ideation: Three.js 3D Editor MVP

## Grounding Context

The current repository is an empty git repository, so there are no existing source conventions to preserve. The product direction comes from the user request: build a Le5le-like 3D visual editor, but keep the MVP small. Required MVP capabilities are scene editing, lights, skybox, HDR environment, GLB import, model material editing, and transform editing. The architecture must produce three npm-publishable packages: an independent core, a Vue3 editor shell, and a React editor shell.

Relevant local learnings were found in a neighboring project, not in this repository:

- Scene snapshot should be the only durable source of truth.
- Three.js runtime should be a projection layer, not the canonical state.
- Interactions should emit command intent; they should not directly mutate the durable scene model.
- `scene.json` should stay JSON-compatible and must not contain Blob, Three.js instances, React state, object URLs, or framework-owned state.
- Assets should be referenced by stable `asset://` URIs.
- Missing assets should produce placeholder/problem state and must not silently delete scene objects.

External grounding:

- Three.js editor uses an `Editor + signals + History + Command` style that is useful as an architectural reference, but its UI should not be copied wholesale.
- `TransformControls` supports translate, rotate, scale, `mouseDown`, `objectChange`, and `mouseUp`; these events fit a transaction-style command recorder.
- `GLTFLoader` covers GLB/glTF and can optionally integrate Draco, KTX2, and Meshopt decoders.
- `RGBELoader` should not be treated as a long-term public API; use `HDRLoader` for new HDR environment support.
- `PMREMGenerator` should be centralized for environment lighting and texture lifecycle control.
- React wrappers must handle `useEffect` cleanup, `useSyncExternalStore`, and StrictMode double setup/cleanup in development.
- Vue wrappers should create runtime state in `onMounted`, dispose in `onUnmounted`, and keep editor instances out of deep reactivity with `shallowRef`/`markRaw`.
- Package `exports`, peer dependencies, pnpm workspaces, and Changesets should be part of the architecture from the start because npm publication is an MVP requirement.

Scope exclusions for MVP:

- No full low-code platform.
- No MQTT/WebSocket data binding.
- No event orchestration, animation timeline, multi-scene linkage, deployment/publishing pipeline, or model marketplace.
- No WebGPU, shader/node material editor, physics, CAD, 3D Tiles, or large-model streaming.

## Topic Axes

- Core data and command model
- Three.js runtime capability
- Editor workbench UX
- Vue/React application integration
- npm engineering and extension boundary

## Ranked Ideas

### 1. Snapshot-First Core With Commands as the Public Editing Contract

**Description:** Define `scene.json` as the canonical, versioned project model, and make every durable edit flow through command intent, validation, reducer-style scene updates, and history. Three.js objects are runtime projections of the snapshot, never the durable source of truth. Core should expose `SceneSnapshot`, `Command`, `History`, `EditorStore`, and serialization APIs as first-class public contracts.

**Axis:** Core data and command model

**Basis:** `direct:` The user goal requires an independent core reused by Vue3 and React shells, while local learnings explicitly state that scene snapshot is the only source of truth and interactions should produce command intent instead of directly modifying the scene.

**Rationale:** This is the highest-leverage decision because it keeps undo/redo, save/load, cross-framework consistency, and npm API stability in one place. It also makes large parts of the core testable without DOM or WebGL.

**Downsides:** Requires schema discipline up front. Some Three.js interactions will need a preview state before they become committed commands, which adds implementation complexity.

**Confidence:** 95%

**Complexity:** Medium

**Status:** Explored

### 2. Runtime Projection Adapter to Isolate Three.js Side Effects

**Description:** Build a `SceneProjector` or runtime adapter that consumes scene snapshots or patches and applies them to Three.js: create/update/dispose Object3D instances, lights, materials, textures, environment maps, placeholders, and controls. Vue and React shells should not own Three object lifecycle.

**Axis:** Three.js runtime capability

**Basis:** `reasoned:` If the snapshot is the source of truth and Three runtime is a projection, lifecycle work needs a single adapter. Otherwise Vue and React wrappers will duplicate loader, material, selection, dispose, and environment sync logic.

**Rationale:** This concentrates the hard browser/WebGL side effects in one core-owned layer. It reduces framework drift and makes resource disposal, asset failure handling, and visual consistency much easier to reason about.

**Downsides:** The adapter boundary needs careful design: full rebuild is simpler but less efficient; incremental patching is faster but harder to implement correctly.

**Confidence:** 90%

**Complexity:** High

**Status:** Unexplored

### 3. Asset Registry With `asset://`, Placeholder Rendering, and Problem State

**Description:** Treat GLB, HDR, skybox images, and material textures as registered assets. Store stable `asset://` references in scene JSON, let host apps resolve those references to URL/File/Blob, and surface missing or failed assets through placeholder rendering plus a problem list.

**Axis:** Three.js runtime capability

**Basis:** `direct:` Local learnings require stable `asset://` references, JSON-compatible snapshots, and placeholder/problem behavior instead of deleting objects when assets are missing.

**Rationale:** This avoids destructive project loads and lets downstream applications plug in their own upload, CDN, permission, or local-file strategies. It also keeps MVP import support from becoming a full model marketplace.

**Downsides:** Adds a small asset abstraction before the first visible feature. The project must decide whether problem state is persisted or derived at load time.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 4. Transactional TransformControls Integration

**Description:** Wrap `TransformControls` as a command transaction recorder: `mouseDown` captures the initial transform, `objectChange` drives a live preview, and `mouseUp` commits one `SetTransformCommand`. Dragging should not write dozens of history entries or make Three runtime the final state.

**Axis:** Editor workbench UX

**Basis:** `external:` Three.js `TransformControls` exposes transform modes and interaction events suitable for a transaction lifecycle. Three.js editor's Command/History model also supports this style.

**Rationale:** Transform editing is core to the MVP. This design preserves fluid manipulation while keeping undo/redo clean and framework-independent.

**Downsides:** Preview state and cancellation behavior must be specified. Edge cases include selection changes during drag, snap settings, and switching transform modes mid-interaction.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 5. Minimal Workbench: Hierarchy, Viewport, Inspector, Problems

**Description:** Build the editor shell around a narrow professional workbench: left scene hierarchy/assets, center viewport, right inspector, top toolbar, and a small problem/log area. Keep UI actions limited to import GLB, select object, transform, edit basic material fields, edit lights/environment, and save/load scene.

**Axis:** Editor workbench UX

**Basis:** `direct:` The user wants Le5le-like editing but explicitly says the MVP should not be too complex. External prior art such as PlayCanvas Editor and Babylon.js Inspector also centers on hierarchy, viewport, assets, and inspector rather than a full low-code workflow.

**Rationale:** The layout signals "3D scene editor" rather than "IoT low-code platform." That keeps expectations aligned with MVP scope while still giving users the full static-scene editing loop.

**Downsides:** Users expecting Le5le-style data binding, events, animation, and publishing will not find those capabilities. The product copy and UI must make that boundary clear without over-explaining inside the app.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 6. Schema-Driven Inspector Fields Shared by Vue and React

**Description:** Define field schemas in core for transform, light, environment, and a deliberately small `MeshStandardMaterial` subset: color, metalness, roughness, emissive, opacity, transparency, side, envMapIntensity, and basic texture references. Vue and React shells render their own controls, but validation, default values, and command generation come from core.

**Axis:** Vue/React application integration

**Basis:** `reasoned:` The MVP requires both Vue and React shells plus material editing. If editable field definitions live in shell components, the two packages will drift quickly.

**Rationale:** This lets both framework shells expose equivalent editing capabilities without sharing UI implementation. It also provides a clean expansion path for future fields and plugins.

**Downsides:** Schema-driven UI can become abstract too early. Keep the schema small and concrete for MVP; do not design a universal form engine.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### 7. Thin Framework Adapters With Explicit Mount, Dispose, Subscribe, and Dispatch

**Description:** Make `@scope/editor-react` and `@scope/editor-vue` thin wrappers around a vanilla TypeScript core. Core should expose explicit lifecycle and state APIs such as `mount(container)`, `dispose()`, `subscribe()`, `getSnapshot()`, and `dispatch()`. React should use `useEffect` and `useSyncExternalStore`; Vue should use `onMounted`, `onUnmounted`, `shallowRef`, and `markRaw`.

**Axis:** Vue/React application integration

**Basis:** `external:` React and Vue have different lifecycle and reactivity constraints, and React StrictMode can reveal non-idempotent setup/cleanup bugs. Thin adapters localize those differences.

**Rationale:** This protects the three-package architecture. The shells become lifecycle and presentation integrations, not separate editors.

**Downsides:** A very thin shell may feel less convenient for app teams unless examples and composables/hooks are well designed.

**Confidence:** 92%

**Complexity:** Low to Medium

**Status:** Unexplored

### 8. npm Package Boundaries as a First-Day Architecture Constraint

**Description:** Set up the monorepo as `packages/core`, `packages/vue`, `packages/react`, plus `examples/vue` and `examples/react`. Use ESM-first builds, explicit package `exports`, type declarations, peer dependencies for `three`, `vue`, `react`, and `react-dom`, and Changesets for coordinated publishing.

**Axis:** npm engineering and extension boundary

**Basis:** `direct:` The user explicitly wants the core, Vue shell, and React shell uploaded to npm for later application reuse. `external:` Node package `exports`, pnpm workspaces, and Changesets are standard mechanisms for this shape.

**Rationale:** If package boundaries are postponed, internal imports will become accidental public API. Starting with publishable packages forces a clean contract and reduces later extraction cost.

**Downsides:** Adds repo setup overhead before feature work. Versioning and peer dependency policy need early decisions.

**Confidence:** 90%

**Complexity:** Low to Medium

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Copy the full Le5le low-code product surface | Scope overrun; full data binding, event orchestration, animation, deployment, and model marketplace are explicitly out of MVP. |
| 2 | Let Vue and React shells own their own editor logic | Duplicates core behavior and undermines the independent core requirement. |
| 3 | Store Three.js objects, Blob, object URLs, or framework state inside `scene.json` | Violates JSON-compatible scene contract and breaks persistence across apps. |
| 4 | Treat TransformControls `objectChange` as committed state every frame | Creates noisy history, performance issues, and state-source confusion. |
| 5 | Expose all Three.js material fields or build a node/shader editor | Scope overrun and too expensive relative to MVP value. |
| 6 | Use R3F/Tres as the core renderer abstraction | Makes the core framework-owned, conflicting with the Vue and React shell split. |
| 7 | Ship GLB import plus a model marketplace/library | Model library is explicitly out of scope; asset registration gives enough future extension. |
| 8 | Support WebGPU in MVP | Adds compatibility and material-path complexity without solving the main editor architecture. |
| 9 | Defer npm package boundaries until after the demo works | High risk; the user's npm reuse goal makes package boundaries part of the core architecture. |

## Useful Sources

- Three.js TransformControls: https://threejs.org/docs/pages/TransformControls.html
- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Three.js HDRLoader: https://threejs.org/docs/pages/HDRLoader.html
- Three.js PMREMGenerator: https://threejs.org/docs/pages/PMREMGenerator.html
- Three.js editor source: https://github.com/mrdoob/three.js/tree/dev/editor
- React `useEffect`: https://react.dev/reference/react/useEffect
- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- Vue lifecycle hooks: https://vuejs.org/api/composition-api-lifecycle.html
- Vue reactivity advanced APIs: https://vuejs.org/api/reactivity-advanced.html
- Node package `exports`: https://nodejs.org/api/packages.html
- pnpm workspaces: https://pnpm.io/workspaces
- Changesets: https://github.com/changesets/changesets

---

## 2026-06-02 Resume: Local Demo Validation Gaps

### Updated Grounding Context

The original ranked ideas are now mostly implemented as architecture and core package contracts. The repository now has:

- `packages/core` snapshot, command, history, validation, serialization, runtime projection, asset/project package, inspector model, shortcut, and advanced operation surfaces.
- React and Vue workbench packages with viewport, inspector, problems, project import/export/replacement, shortcut routing, and extension regions.
- Local React, Vue, and vanilla proof-loop examples.
- Documentation that explicitly describes the current proof loop and the common editor interactions still not implemented.

The important distinction for this pass is that the current local demos prove the contract more than they prove the feel of a visual 3D editor. React/Vue examples mount a viewport and inspector, seed a simple box, and expose command buttons for move, copy, paste, duplicate, delete, group, export, and reopen. They do not yet let a user fully validate camera orbit/zoom, click selection, visible selection feedback, or a draggable transform gizmo in the viewport.

Relevant direct evidence from the current codebase:

- `docs/interactions.md` lists complete viewport click-selection UI, OrbitControls / pan / zoom toolbar, visual TransformControls gizmo, box selection, hierarchy panel, grid/alignment helpers, visual snap controls, persisted layout, command palette UI, and data binding as not implemented.
- `ThreeEditorRuntime` creates a camera and renderer, renders after projection, and exposes `ObjectPicker`, but does not own OrbitControls, a render loop, DOM pointer handlers, hover/selection visuals, camera fit/reset, or TransformControls.
- `ObjectPicker.pickFromClientPoint()` and selection commands exist, and `SceneProjector` writes derived `userData.selected` / `userData.primarySelected`; the public viewport components do not wire this into mouse selection or visible feedback.
- `TransformTransaction` / `TransformController` implement preview, commit, cancel, snap, and batched transform commits, but no Three.js `TransformControls` bridge is mounted in the demo.
- Material schema, commands, and inspector fields exist, but docs still state material texture projection onto imported GLB meshes is deferred, and `SceneProjector` does not apply material overrides to loaded GLB meshes.

External grounding stayed narrow and only checked interaction primitives relevant to the local demo. Three.js official docs describe `OrbitControls` as covering orbit, dolly/zoom, and pan; `TransformControls` as a DCC-style translate/rotate/scale object manipulator; and `DragControls` as a drag event primitive. This supports treating the missing viewport controls as a demo/productization gap, not a new durable-state requirement.

### Existing Ranked Ideas Confirmation

| Original idea | 2026-06-02 confirmation |
|---|---|
| 1. Snapshot-First Core With Commands as the Public Editing Contract | Implemented. Public API exports snapshot types, commands, history/editor APIs, serialization, validation, migrations, and command-backed editing. |
| 2. Runtime Projection Adapter to Isolate Three.js Side Effects | Mostly implemented. Runtime projection covers objects, hierarchy, transforms, environment/background, lights, placeholders, disposal, and problems. Material override projection is the main remaining visual gap. |
| 3. Asset Registry With `asset://`, Placeholder Rendering, and Problem State | Implemented. Stable asset references, resolver bridge, project package import/export, replacement, placeholders, and runtime problems are present. |
| 4. Transactional TransformControls Integration | Partially implemented. The transaction/commit model exists, including multi-object batch commits and snap helpers, but visual Three.js `TransformControls` integration is still missing. |
| 5. Minimal Workbench: Hierarchy, Viewport, Inspector, Problems | Partially implemented. Workbench, viewport, inspector, problems, project controls, shortcuts, and advanced operation buttons exist; hierarchy/assets panels and a richer toolbar are still missing. |
| 6. Schema-Driven Inspector Fields Shared by Vue and React | Implemented at inspector/command level. Transform, material, environment, lights, and problems are shared through core models and rendered by React/Vue. Runtime material texture projection remains deferred. |
| 7. Thin Framework Adapters With Explicit Mount, Dispose, Subscribe, and Dispatch | Implemented. React/Vue wrappers are thin lifecycle, subscription, inspector, viewport, and workbench adapters over core. |
| 8. npm Package Boundaries as a First-Day Architecture Constraint | Implemented. The pnpm workspace, package exports, peer dependencies, Changesets, build/typecheck/test scripts, and release verification are present. |

### Updated Topic Axes

- Viewport navigation and feedback
- Direct manipulation
- Scene organization and import surface
- Visual fidelity and authored effect proof
- Demo verification and parity

### Additional Ranked Ideas

### 1. Interactive Viewport Controls Pack

**Description:** Add an opt-in local-demo viewport control layer with OrbitControls, continuous rendering while controls are active, resize handling, camera reset, frame selected, and frame all. Camera/control state should remain transient by default and stay out of `SceneSnapshot`.

**Axis:** Viewport navigation and feedback

**Basis:** `direct:` `docs/interactions.md` lists OrbitControls / pan / zoom toolbar as not implemented, and `ThreeEditorRuntime` currently has a fixed camera plus render-on-projection behavior. `external:` Three.js `OrbitControls` covers orbiting, dollying/zooming, and panning.

**Rationale:** Camera rotation and zoom are among the first interactions a user tries in a 3D editor. Without them, a local demo cannot validate spatial navigation or viewport ergonomics.

**Downsides:** Requires a clear transient lifecycle for controls, render-loop policy, resize behavior, and dispose cleanup.

**Confidence:** 94%

**Complexity:** Medium

**Status:** Unexplored

### 2. Click Selection With Visible Primary/Multiselect Feedback

**Description:** Wire pointer events in React/Vue viewport demos to core picking with replace/toggle/add modes, then render visible selected and primary-selected states through bounding boxes, outline color, helper overlays, or a similarly lightweight transient runtime visualization. The demo should show selection count and primary object so users can verify picking and multiselect without reading JSON.

**Axis:** Viewport navigation and feedback

**Basis:** `direct:` Core has `ObjectPicker.pickFromClientPoint()` and `SceneProjector` already marks projected objects with `userData.selected` and `userData.primarySelected`, while docs say public viewport components do not provide complete mouse click or box-selection UI.

**Rationale:** Selection currently works through commands and state counts, but a visual editor demo should let users click objects and immediately see which object is selected.

**Downsides:** Selection visuals can become a design rabbit hole if nested GLB hit targets, outlines, hover, and occlusion are all solved at once. Keep the first version small.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 3. TransformControls Bridge Over Existing Transactions

**Description:** Attach a Three.js `TransformControls` gizmo to the primary selected object, route drag lifecycle into the existing `TransformTransaction`, map translate/rotate/scale modes and snap settings, and disable camera orbit while dragging. Commit should still dispatch one durable command or batch command, not mutate snapshot state from the control.

**Axis:** Direct manipulation

**Basis:** `direct:` `TransformTransaction` and `TransformController` already provide preview/commit/cancel and batched transform commits, while docs list visual TransformControls gizmo as missing. `external:` Three.js `TransformControls` is designed for DCC-style translate/rotate/scale object manipulation.

**Rationale:** This is the biggest gap between "the transform contract works" and "the editor feels real." It makes transform editing directly testable through drag, snap, undo, redo, and serialization.

**Downsides:** Needs careful arbitration with camera controls, snap changes, selection changes during drag, cancellation, and object hierarchy transforms.

**Confidence:** 90%

**Complexity:** High

**Status:** Unexplored

### 4. Demo Scene Hierarchy and Asset Tray

**Description:** Add a compact scene hierarchy and local asset tray to the proof-loop examples. It should list objects, parent/child nesting, selection state, asset references, and problem badges; support selecting objects from the tree; expose local GLB/HDR/image registration; and invoke existing core operations for copy, paste, duplicate, delete, group, and ungroup.

**Axis:** Scene organization and import surface

**Basis:** `direct:` README and docs list hierarchy panels and full asset libraries as deferred, and examples only show object counts plus hardcoded toolbar buttons. Advanced operations now exist, but grouping, delete, duplicate, and selection are hard to inspect without a scene tree.

**Rationale:** The demo now has enough command surface that users need a visible object model. A small hierarchy turns advanced operations from hidden contract behavior into observable scene editing.

**Downsides:** Easy to overbuild into a dockable editor shell or full asset library. Keep it demo-scoped and core-operation backed.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 5. Runtime Material Override Projection

**Description:** Implement the smallest runtime projection path for object-level `MeshStandardMaterial` overrides: color, metalness, roughness, emissive, emissive intensity, opacity/transparent, side, envMapIntensity, and a limited texture-slot path. Loaded textures and derived failures must remain transient runtime state with centralized disposal and runtime problems.

**Axis:** Visual fidelity and authored effect proof

**Basis:** `direct:` Material schema, commands, and inspector exist, but docs state material texture projection onto GLB meshes is deferred, and `SceneProjector` does not apply material overrides to runtime GLB meshes.

**Rationale:** For a visual 3D editor demo, material editing should visibly affect the model. Without runtime projection, the inspector proves durable authoring data but not visual editing.

**Downsides:** GLB material graphs and per-submesh material slots can grow quickly. The first version should stay object-level and MeshStandard-only.

**Confidence:** 86%

**Complexity:** High

**Status:** Unexplored

### 6. Proof Loop Checklist and Browser Evidence Harness

**Description:** Add a demo-only checklist that turns expected editor behaviors into observable steps: camera orbit/zoom, click select, transform drag, undo/redo, material edit, light/environment edit, export/reopen, missing asset replacement, and React/Vue parity. Back it with browser tests or screenshots that verify stable visible states and command outcomes.

**Axis:** Demo verification and parity

**Basis:** `direct:` Existing tests cover package and core behavior, but local demos do not present a user-facing checklist for the visible editor interactions the demo is meant to validate.

**Rationale:** Once the demo becomes interactive, a checklist plus browser evidence prevents regressions in the behaviors users are actually trying locally.

**Downsides:** Browser verification for WebGL and controls can be brittle unless checks focus on stable state transitions and a small number of screenshot assertions.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### Additional Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Light, environment, grid, and helper demo scene | Useful, but partly a variant of viewport/material proof; fold grid/helpers into viewport controls or material demo. |
| 2 | Real local file import flow for GLB/HDR/Image | Valuable, but lower priority than camera, selection, transform, and hierarchy because current resolver/package surfaces can already be exercised indirectly. |
| 3 | Shortcut, toolbar, and mode UI polish | Keep as part of TransformControls/viewport work; standalone toolbar polish is not the core missing validation. |
| 4 | Missing asset recovery drill | Already supported through problems/replacement; include in the checklist rather than treat as a separate top-ranked feature. |
| 5 | Viewport runtime API for host customization | Potentially useful API work, but too abstract for the immediate question about what the local demo lacks. |
| 6 | Multi-object direct manipulation story | Strong follow-up after single-object TransformControls; not first because it depends on selection feedback and gizmo bridge. |

### Additional Useful Sources

- Three.js OrbitControls: https://threejs.org/docs/pages/OrbitControls.html
- Three.js DragControls: https://threejs.org/docs/pages/DragControls.html
