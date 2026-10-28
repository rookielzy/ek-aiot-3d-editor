---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": minor
"@ek-aiot/3d-editor-vue": minor
---

Add shared HTTP data preview runtime with durable refresh interval and maximum-age policy. Equal query/parameter/configuration/authentication contexts issue one GET per cycle with bounded concurrency, deduplicated queueing, no overlapping requests, and automatic polling after completion or explicit refresh.

Handle retryable and fatal failures, `Retry-After` backoff, 401/403 authentication pauses, host auth-revision restarts, executor replacement, and late-response isolation. Expire values from receive and source-sample age independently, keep last valid values as separately marked history, clear current fields for missing devices/fields or empty results, and expose stable data problems.

The React Workbench adds shared-context and freshness detail states, authentication retry, update-policy fields, and problem-drawer location for queries, objects, and fields. Vue consumes the same core contract and localized strings without adding data preview UI.
