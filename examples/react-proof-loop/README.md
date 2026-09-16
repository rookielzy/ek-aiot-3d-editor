# React proof loop

Run the authored desktop showcase from the repository root:

```sh
pnpm --filter @ek-aiot/react-proof-loop dev
pnpm --filter @ek-aiot/react-proof-loop build
```

The demo host opens the shared Toy Car studio with a local GLB, editable HDR
environment, two authored lights, and a default camera. Exporting a complete
`.ek3d` project includes both asset payloads; opening it in a fresh React or Vue
host restores the same lighting and framing. This initialization belongs to the
demo only. A package consumer calling `useEditor()` or rendering
`EditorWorkbench` without an editor still starts empty.

Project open/export and the English/简体中文 switch live in **Project menu**.
Scene, Assets, and Project use the left navigation; transform, camera, helper,
and node commands float over the viewport. Object, Environment, and Scene are
the right inspector groups. The bottom status summary opens the problem drawer;
closing the drawer does not clear its diagnostics or recovery actions. Both side
panels can be collapsed or resized by pointer or keyboard.

Host render props remain available for `toolbar`, `leftPanel`, legacy
`sidePanel`, `viewportOverlay`, `rightPanel`, and `status`. These regions replace
only their documented content; `showDefaultToolbar={false}` hides package tools
without hiding a host toolbar.

Asset authorship, source, modifications, and CC0 notices are recorded in
[SHOWCASE-LICENSES.md](public/SHOWCASE-LICENSES.md). Shared source assets live in
`../showcase/assets` and are bundled locally; the demo does not depend on a
third-party asset host at runtime.
