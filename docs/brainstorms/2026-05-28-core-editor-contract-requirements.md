---
date: 2026-05-28
topic: core-editor-contract
origin: docs/ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md
---

# Requirements: Core Editor Contract

## Summary

Define the first usable contract for `@scope/editor-core`: a snapshot-first 3D editor core that owns scene state, command/history behavior, Three.js runtime projection, GLB asset loading, object selection, transform editing, and serialization. The first proof loop is intentionally narrow: import a GLB, select it, transform it, undo/redo the transform, save the snapshot, and restore it into an equivalent rendered scene.

---

## Problem Frame

The editor is intended to become a Le5le-like 3D visual editing tool, but the first version needs to establish reusable architecture before broad UI capability. The main risk is building a visual demo whose real state lives in Three.js objects, framework component state, and ad hoc event handlers. That would make npm reuse, Vue/React parity, save/load, and later feature expansion expensive.

The first core contract should prove that durable editor state lives in a JSON-compatible scene snapshot, that every durable edit flows through commands, and that Three.js is a runtime projection of that snapshot. Vue and React shells should depend on this contract rather than owning separate editing behavior.

---

## Key Decisions

- **Core includes Three.js runtime for v1.** The first release keeps the package set to three npm packages: core, Vue shell, and React shell. A separate runtime package is deferred until the need is proven.
- **Own applications are the first consumer.** The API can ship as `0.x` and remain experimental. It should be clean and typed, but it does not need public-developer-grade stability in the first pass.
- **Core contract comes before full editor workbench.** The first proof loop validates state, commands, runtime projection, and persistence. Inspector breadth, HDR controls, light panels, and polished workbench UI come later.
- **Three.js objects are never durable state.** Runtime objects can be mutated for preview, but committed edits must be represented in the snapshot and history.
- **Assets are references, not embedded runtime objects.** GLB files enter the editor through asset references and host-provided resolution, keeping snapshots portable.

---

## Requirements

**Core State Contract**

- R1. The core must expose a versioned, JSON-compatible scene snapshot as the durable editor state.
- R2. The snapshot must represent the minimum first-loop scene data: scene identity, object identity, object hierarchy, object transform, selected object state, asset references, and enough runtime metadata to restore imported GLB objects.
- R3. The snapshot must not store Three.js instances, framework component state, Blob objects, object URLs, File objects, or other browser-only runtime references.
- R4. The core must provide serialization and restoration APIs that round-trip the first proof loop without requiring Vue or React.

**Commands and History**

- R5. Durable edits must flow through command execution rather than direct snapshot mutation from UI shells.
- R6. The first supported command set must cover GLB import, selection change, transform change, undo, and redo.
- R7. Transform dragging must commit as one undoable transform command per completed drag interaction, not as one history entry per pointer movement.
- R8. Command execution must update the snapshot first, then let runtime projection reflect the resulting state.
- R9. Undo and redo must restore both the snapshot and rendered runtime state for the first proof loop.

**Three.js Runtime Projection**

- R10. The core must own the Three.js runtime projection needed for the first proof loop.
- R11. The runtime must mount into a host-provided DOM container and expose a deterministic dispose path.
- R12. The runtime must project snapshot state into Three.js objects for imported GLB scene nodes, selected object state, and transforms.
- R13. The runtime must support object picking or another core-owned selection mechanism that produces selection commands.
- R14. The runtime must integrate transform editing through a transaction-style interaction: start, preview, commit, and cancel when needed.
- R15. The runtime must clean up renderer, controls, loaded assets, event listeners, and Three.js resources when disposed.

**Asset and GLB Handling**

- R16. The core must use stable asset references for imported GLB resources instead of storing browser runtime objects in the snapshot.
- R17. Host applications must be able to resolve asset references to loadable resources for the runtime.
- R18. GLB import must create a scene object with stable identity, a persisted transform, and enough asset metadata to restore the object after serialization.
- R19. If a referenced GLB cannot be resolved during restore, the core must preserve the scene object and surface a problem state rather than deleting the object.

**Framework Shell Contract**

- R20. The core must expose a minimal framework-neutral lifecycle API: create or initialize editor, mount runtime, subscribe to state changes, dispatch commands, serialize/restore snapshot, and dispose.
- R21. The core must make state subscription suitable for both React and Vue shells without requiring framework-specific behavior in core.
- R22. Vue and React shells must be able to implement the first proof loop without duplicating command logic, asset logic, history behavior, or Three.js runtime lifecycle.

**Package Contract**

- R23. The repository should treat `@scope/editor-core`, `@scope/editor-vue`, and `@scope/editor-react` as the first npm package boundary.
- R24. `@scope/editor-core` is allowed to depend on Three.js directly in v1.
- R25. Vue and React should remain peer dependencies of their shell packages, not dependencies of core.
- R26. Public exports should expose only the contracts needed by the first proof loop and shell integration. Internal runtime details should not become accidental public API.

---

## Key Flows

- F1. GLB import into a blank editor
  - **Trigger:** A host application provides a GLB asset to the core.
  - **Actors:** Host application, editor core, Three.js runtime.
  - **Steps:** The host resolves or registers the asset; core creates an asset reference and scene object; runtime loads and displays the GLB; core updates the snapshot and history as needed.
  - **Outcome:** The imported object appears in the runtime and is represented in the serialized snapshot.
  - **Covers:** R1, R2, R5, R16, R18.

- F2. Select and transform an imported object
  - **Trigger:** A user selects an imported object and drags the transform control.
  - **Actors:** User, editor core, Three.js runtime, shell package.
  - **Steps:** Runtime identifies the selected object; core dispatches a selection command; transform interaction begins; runtime previews movement; commit creates one transform command; snapshot and runtime settle on the committed transform.
  - **Outcome:** The object moves visually, the snapshot stores the new transform, and history records one undoable edit.
  - **Covers:** R6, R7, R12, R13, R14.

- F3. Save and restore the proof scene
  - **Trigger:** A host application asks core to serialize the current editor state, then later restores it.
  - **Actors:** Host application, editor core, Three.js runtime.
  - **Steps:** Core serializes the snapshot; a new editor instance restores it; host resolves referenced assets; runtime projects the restored scene.
  - **Outcome:** The restored scene contains the imported object with the committed transform and selection behavior intact.
  - **Covers:** R3, R4, R8, R9, R17, R20.

- F4. Restore with a missing GLB asset
  - **Trigger:** A restored snapshot references a GLB asset the host cannot resolve.
  - **Actors:** Host application, editor core, Three.js runtime.
  - **Steps:** Core preserves the scene object; runtime renders placeholder or degraded problem state; shell can surface the problem to the user.
  - **Outcome:** The scene structure and original asset reference remain intact.
  - **Covers:** R16, R17, R19.

---

## Acceptance Examples

- AE1. **Covers R4, R18.** Given a blank editor, when a GLB is imported and the snapshot is serialized, then the snapshot includes a stable asset reference, a stable object identity, and that object's transform.
- AE2. **Covers R7, R9, R14.** Given an imported object, when the user drags it for several seconds and releases, then history contains one transform edit; undo returns the object to its pre-drag transform; redo reapplies the committed transform.
- AE3. **Covers R3, R20, R22.** Given the same restored snapshot, when it is loaded through the core from either a Vue or React shell, then neither shell needs custom command or runtime lifecycle logic to render and edit the object.
- AE4. **Covers R11, R15.** Given an editor instance has mounted and loaded a GLB, when the host disposes the core, then renderer resources, controls, event listeners, and loaded Three.js resources are released through the core-owned dispose path.
- AE5. **Covers R19.** Given a saved snapshot references a GLB the host cannot resolve, when the snapshot is restored, then the object remains in the scene model and a problem state is available to the shell.

---

## Success Criteria

- The first proof loop can run without Vue or React: import GLB, select, transform, undo/redo, serialize, restore, and project into Three.js.
- A Vue shell and a React shell can both mount the same core and reuse the same commands, history, snapshot, asset, and runtime behavior.
- The serialized snapshot is portable JSON and does not contain browser or framework runtime objects.
- Transform history is readable and user-oriented: one completed drag equals one undoable command.
- Missing assets are non-destructive: restore preserves scene identity and surfaces problems.

---

## Scope Boundaries

### In Scope for First Core Contract

- Snapshot state contract for the first proof loop.
- Command execution and undo/redo for import, selection, and transform.
- Core-owned Three.js runtime projection.
- GLB import and restore through asset references.
- Runtime lifecycle required by Vue and React shells.
- Experimental npm package boundaries for core, Vue shell, and React shell.

### Deferred for Later Planning

- Material editing for `MeshStandardMaterial` fields.
- HDR environment, skybox, PMREM controls, and lighting inspector.
- Full editor workbench: hierarchy panel, inspector panel, problems panel, toolbar, shortcuts, and layout polish.
- Schema-driven inspector definitions shared by Vue and React.
- Project package format such as `.ek3d` zip bundles with assets and manifest.
- Draco, KTX2, and Meshopt decoder configuration beyond the minimal GLB path.
- Multi-select, grouping, copy/paste, duplicate, delete, snapping UI, and transform gizmo polish.
- Public developer documentation beyond the examples needed for internal reuse.
- Changesets release workflow, CI publish gates, and package provenance hardening.

### Outside This Product Identity for MVP

- Full Le5le-style low-code platform behavior.
- MQTT/WebSocket data binding.
- Event orchestration, animation timeline, multi-scene linkage, and runtime dashboard publishing.
- Model marketplace or bundled model library.
- WebGPU-first renderer.
- Shader editor, node material editor, physics editor, CAD tooling, 3D Tiles, or large-model streaming.

---

## Follow-Up Planning Backlog

| Track | Candidate Work | Dependency |
|---|---|---|
| Core schema | Expand snapshot to cover material, environment, lights, and problem metadata in more detail. | First proof loop schema. |
| Runtime capability | Add HDR environment, skybox, lights, PMREM lifecycle, and texture disposal policies. | Runtime projection adapter. |
| Inspector UX | Add transform, material, light, environment, and asset problem panels. | Core field contracts and shell mounting. |
| Framework shells | Build Vue and React workbench components, hooks/composables, slot/render-prop extension points, and examples. | Core lifecycle and subscription API. |
| Asset system | Define project package format, asset manifest, replacement flow, and missing-resource recovery UX. | Asset references and problem state. |
| npm release | Add workspace builds, package exports, peer dependency policy, Changesets, and release documentation. | Initial package boundaries. |
| Advanced editor | Add multi-select, copy/paste, delete, grouping, snapping, shortcuts, and command batching. | Command/history model. |
| Le5le-like features | Consider data binding, events, animation, multi-scene, and publishing after static scene editing is reliable. | MVP editor foundation. |

---

## Dependencies and Assumptions

- The first consumer is the author's own future applications, so `0.x` experimental APIs are acceptable.
- The first core package can directly depend on Three.js.
- The first validation target is GLB import and transform, not material or environment editing.
- Host applications can provide asset resolution for local files or URLs.
- Public API stability beyond the first proof loop is deferred.

---

## Outstanding Questions

### Deferred to Planning

- What exact package scope and package names should be used for npm?
- Should package builds use Vite library mode, tsup, or another bundler?
- How much of the core should be pure state logic versus browser-bound runtime classes?
- What minimal sample GLB should be used for tests and examples?
- How should React StrictMode and Vue unmount/remount behavior be verified?

---

## Sources

- Ideation artifact: `docs/ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md`
- Three.js TransformControls: https://threejs.org/docs/pages/TransformControls.html
- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Three.js editor source: https://github.com/mrdoob/three.js/tree/dev/editor
- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- Vue lifecycle hooks: https://vuejs.org/api/composition-api-lifecycle.html
- Node package `exports`: https://nodejs.org/api/packages.html
- pnpm workspaces: https://pnpm.io/workspaces
