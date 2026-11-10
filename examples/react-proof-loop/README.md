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

## Data source request fixture

The dev server exposes a same-origin JSON fixture at
`/__fixtures__/http-data-source/*`; it echoes the path, query, and an
`X-Fixture-Probe` header from the request. The demo host already provides a
browser fetch executor. To verify a real manual GET:

1. Open **Data**, create a connection with service URL
   `http://localhost:5173/__fixtures__/http-data-source` (use the actual dev
   origin), and add the public header `X-Fixture-Probe: demo`.
2. Save, choose **Test request**, enter `/pumps/{areaId}`, add a string
   `areaId` parameter with default `A`, and run.
3. The response echoes the received path/query/header. Raw responses, test
   overrides, and diagnostics stay in the browser session and are never written
   into the scene snapshot or exported project.

The fixture is dev-only, same-origin, and never contacts an external service.

## Local backend fixture

Start `pnpm dev:data-source` from the workspace root to run the manually
testable backend on `127.0.0.1:4310`. The Vite dev server proxies `/local-api`
to it, so use `/local-api/api/devices` as a connection URL. Add
`?scenario=empty`, `?scenario=missing-field`, `?scenario=slow`, or
`?scenario=http-500` to exercise predictable response states.

Step-by-step click-through instructions (connection → test request → query
mapping → object binding → data preview, plus the failure-state experiments)
are in [`docs/local-data-source-demo-walkthrough.md`](../../docs/local-data-source-demo-walkthrough.md).
