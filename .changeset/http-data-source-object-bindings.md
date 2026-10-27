---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": minor
"@ek-aiot/3d-editor-vue": minor
---

Add durable object bindings to the v9 data sources contract: one validated binding per object node with query, device, typed parameter overrides, enabled state, and ordered detail fields with labels and numeric precision. Add `set-data-object-binding`/`delete-data-object-binding` commands, query reference guards, and node-delete cleanup.

Add manual object data preview to the core data service with per-binding effective parameters, exact device matching, runtime-only loading/ready/partial/missing-device/error states, explicit start/refresh/stop, and a stock detail model. Configuration changes clear runtime only for affected objects and wait for the next refresh; results never write the snapshot or command history.

The React Workbench gains a shared device binding form in the Object inspector and query Bindings dialog, device candidates from the current binding result, viewport preview controls, and a selected-object detail card with field units, precision, timestamps, quality, and explicit failure reasons. Vue keeps the same public core contract without adding UI.
