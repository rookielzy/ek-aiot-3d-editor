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

## Data source request fixture

Like the React demo, the dev server exposes a same-origin JSON fixture at
`/__fixtures__/http-data-source/*` that echoes the path, query, and an
`X-Fixture-Probe` header. `src/demo-data-executor.ts` provides the browser fetch
executor, so the demo can exercise the same data workspace as React. To verify a
real manual GET:

1. Open **Data**, create a connection with service URL
   `http://localhost:5173/__fixtures__/http-data-source` (use the actual dev
   origin), and add the public header `X-Fixture-Probe: demo`.
2. Save, choose **Test request**, enter `/pumps/{areaId}`, add a string
   `areaId` parameter with default `A`, and run.
3. The response echoes the received path/query/header. Raw responses, test
   overrides, and diagnostics stay in the browser session and are never written
   into the scene snapshot or exported project.

The demo has no credential store, so a connection using bearer or API-key auth
reports a host capability problem instead of inventing a secret. The fixture is
dev-only, same-origin, and never contacts an external service.

## Local backend fixture

Start `pnpm dev:data-source` from the workspace root to run the manually
testable backend on `127.0.0.1:4310`. The Vite dev server proxies `/local-api`
to it, so use `/local-api/api/devices` as a connection URL. Add
`?scenario=empty`, `?scenario=missing-field`, `?scenario=slow`, or
`?scenario=http-500` to exercise predictable response states.
