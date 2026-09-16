# Vue proof loop

Run the authored desktop showcase from the repository root:

```sh
pnpm --filter @ek-aiot/vue-proof-loop dev
pnpm --filter @ek-aiot/vue-proof-loop build
```

The Vue and React demos call the same showcase bootstrap and open the same local
Toy Car GLB, editable HDR environment, two authored lights, and default camera.
A complete `.ek3d` export carries both payloads and can be restored by either
framework with equivalent lighting and framing. This initialization belongs to
the demo only. A package consumer calling `useEditor()` or rendering
`EditorWorkbench` without an editor still starts empty.

Project open/export and the English/简体中文 switch live in **Project menu**.
Scene, Assets, and Project use the left navigation; transform, camera, helper,
and node commands float over the viewport. Object, Environment, and Scene are
the right inspector groups. The bottom status summary opens the problem drawer;
closing the drawer does not clear its diagnostics or recovery actions. Both side
panels can be collapsed or resized by pointer or keyboard.

Scoped slots remain available for `toolbar`, `leftPanel`, legacy `sidePanel`,
`viewportOverlay`, `rightPanel`, and `status`. `leftPanel` wins when it and
`sidePanel` are both supplied; `show-default-toolbar="false"` does not hide the
host toolbar slot.

Asset authorship, source, modifications, and CC0 notices are recorded in
[SHOWCASE-LICENSES.md](public/SHOWCASE-LICENSES.md). Shared source assets live in
`../showcase/assets` and are bundled locally; the demo does not depend on a
third-party asset host at runtime.
