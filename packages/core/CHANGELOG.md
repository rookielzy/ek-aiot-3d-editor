# @ek-aiot/3d-editor-core

## 0.3.0

### Minor Changes

- 27909ab: Add authored camera views as durable presentation state, with core commands/runtime helpers plus React and Vue inspector/workbench controls.
- 91e4864: Add snapshot v9 data source connections with validated, undoable create/update/duplicate/delete commands, host credential descriptors, and a bilingual React data workspace for managing reusable HTTP connections.
- 7565740: Add host-executed manual GET query drafts with strict typed parameter resolution, encoded path/query construction, request summaries, raw response diagnostics, timeout, cancellation, and stale-generation rejection. The React Data workspace gains a bilingual request tester whose responses and temporary overrides stay in session state. Vue accepts the same host executor through `useEditor` and `EditorWorkbench` without adding request UI.
- 6f08fea: Add durable object bindings to the v9 data sources contract: one validated binding per object node with query, device, typed parameter overrides, enabled state, and ordered detail fields with labels and numeric precision. Add `set-data-object-binding`/`delete-data-object-binding` commands, query reference guards, and node-delete cleanup.

  Add manual object data preview to the core data service with per-binding effective parameters, exact device matching, runtime-only loading/ready/partial/missing-device/error states, explicit start/refresh/stop, and a stock detail model. Configuration changes clear runtime only for affected objects and wait for the next refresh; results never write the snapshot or command history.

  The React Workbench gains a shared device binding form in the Object inspector and query Bindings dialog, device candidates from the current binding result, viewport preview controls, and a selected-object detail card with field units, precision, timestamps, quality, and explicit failure reasons. Vue keeps the same public core contract without adding UI.

- 12f028b: Add saved HTTP data queries with typed parameters and device-property mappings. Core now provides query create/update/duplicate/delete commands, strict path and mapping validation, standard array/single-object mapping output, and per-field time/quality/range diagnostics while keeping samples and test values out of snapshots. The React Data workspace gains a bilingual query editor with path selection, transforms, identity mapping, example JSON, previews, and stale-draft markers; query and mapping save as one history entry. Vue keeps its existing data UI and mirrors the new dictionary keys.
- 578d0e5: Add read-only POST queries with explicit read-only confirmation, typed path/query/body parameters, case-insensitive public/query header merging, and API-key credentials that store only a host credential reference plus a non-secret header name. Auth-reserved headers cannot be overridden, including when a connection auth change would reserve a header already used by one of its queries; missing credentials stay saveable and produce recoverable execution problems, and auth-revision changes invalidate old responses.

  Add an optional strictly compared business success condition, host-configured response size limits, and distinct results for HTTP, authentication, business, 204/empty, non-JSON, parse-failure, and over-limit responses; HTTP/auth classification takes precedence over the size limit so a paused or backed-off context is not reported as oversized. Read-only POST runs only for manual tests, the first preview, or an explicit refresh, with no automatic polling or retries; configuration and host-capability changes wait for an explicit refresh. Changing only the response limit neither bumps the auth revision nor clears current values. Since POST does not poll, its maximum age may be shorter than the unused refresh interval; the interval/max-age ordering rule applies to GET polling only. `resolveDataParameterLocations()` is now exported alongside `buildDataQueryRequest()`, and `buildDataGetRequest()` remains as the GET-compatible alias.

  The React Workbench adds method selection, the POST read-only confirmation and manual-policy hint, API-key connection fields, query headers, parameter locations, body preview, and success-condition fields. Vue consumes the same core contract without adding data-source UI.

- f67473d: Protect data-source references across authoring and node operations. Deleting a query with object bindings or a connection with queries is rejected without changing the snapshot or history, and incompatible property/parameter edits are blocked while compatible metadata edits revalidate the bindings.

  Carry bindings plus their referenced query and connection configuration through duplicate and the v2 object / v3 node clipboards, keeping legacy v1 object and v2 node payloads readable. Cross-editor paste reuses identical definitions, clones conflicting ids with unique names, rewrites dependencies, and maps bindings onto the pasted object node ids without overwriting target configuration.

  React shows query, property, and parameter usage with blocking reasons, selects or unbinds referenced objects, and confirms that a duplicate or pasted copy still points at the same device. Vue consumes the updated core contract without new data UI.

- d302217: Add shared HTTP data preview runtime with durable refresh interval and maximum-age policy. Equal query/parameter/configuration/authentication contexts issue one GET per cycle with bounded concurrency, deduplicated queueing, no overlapping requests, and automatic polling after completion or explicit refresh.

  Handle retryable and fatal failures, `Retry-After` backoff, 401/403 authentication pauses, host auth-revision restarts, executor replacement, and late-response isolation. Expire values from receive and source-sample age independently, keep last valid values as separately marked history, clear current fields for missing devices/fields or empty results, and expose stable data problems.

  The React Workbench adds shared-context and freshness detail states, authentication retry, update-policy fields, and problem-drawer location for queries, objects, and fields. Vue consumes the same core contract and localized strings without adding data preview UI.

- ba1a649: Add snapshot v5 imported GLB target nodes, material slot targets, and expansion commands for durable per-asset hierarchy editing.
- 71d1d1f: Prepare the first experimental npm release workflow with public package metadata, Changesets versioning, release verification, and CI publishing documentation.
- a1736c5: Report how a restored project's data configuration stands against the host. `ProjectImportResult.outcome` distinguishes an unusable package from durable data references that no longer resolve, and from credentials the host still has to provide. Dangling references are reported as `project-data-config-invalid` so they are not mistaken for a corrupt archive. The React project menu shows a reconnect hint when credentials are missing.
- 8b14bc6: Project previewed device values into ordered status colors on target objects, including per-material capability diagnostics, authored-material restoration, reprojection-safe projection-owned overrides, draft trials, and preview edit locking. React adds rule ordering, palette, capability hints, and trial controls.
- b90220f: Add the Vue HTTP data source workspace: connection authoring, query configuration with live mapping preview, and a manual request tester that match the React adapter. Move the framework-agnostic query form model and the data problem message-key maps from the React package into core so both adapters share the same fields, defaults, validation problems, and copy instead of duplicating mapping or error logic in their components.

### Patch Changes

- 50f37c4: Invalidate binding device candidates when their connection or query changes, localize candidate mapping failures, and reject numeric precision on non-numeric detail fields.
- cb141a8: Reject impossible ISO calendar dates and out-of-range Unix sample times. Report invalid referenced connections as snapshot validation errors, and require stored queries to contain normalized mapping defaults so restored mappings behave like command-saved queries.
- f8582a6: Isolate data colors from nested object nodes, defer color updates until asynchronous authored material projection completes, and restore authored colors when configured sample timestamps are invalid.
- 04eba64: Preserve exact device identities in object bindings and report invalid referenced query mappings as snapshot validation errors. Resolve preview request parameters once at the request boundary.

  Repair binding query creation after connections change, release cancelled device candidate requests, reopen detail cards after object selection changes, and protect unsaved binding drafts when closing the query bindings dialog or switching objects. Keep the confirmation messages aligned across adapter locales.

## 0.2.0

Initial experimental `0.x` release candidate for the framework-neutral editor contract, including snapshot state, commands/history, project package import/export, asset references, inspector helpers, and Three.js runtime projection.
