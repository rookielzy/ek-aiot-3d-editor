---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": minor
"@ek-aiot/3d-editor-vue": minor
---

Add read-only POST queries with explicit read-only confirmation, typed path/query/body parameters, case-insensitive public/query header merging, and API-key credentials that store only a host credential reference plus a non-secret header name. Auth-reserved headers cannot be overridden, including when a connection auth change would reserve a header already used by one of its queries; missing credentials stay saveable and produce recoverable execution problems, and auth-revision changes invalidate old responses.

Add an optional strictly compared business success condition, host-configured response size limits, and distinct results for HTTP, authentication, business, 204/empty, non-JSON, parse-failure, and over-limit responses; HTTP/auth classification takes precedence over the size limit so a paused or backed-off context is not reported as oversized. Read-only POST runs only for manual tests, the first preview, or an explicit refresh, with no automatic polling or retries; configuration and host-capability changes wait for an explicit refresh. Changing only the response limit neither bumps the auth revision nor clears current values. Since POST does not poll, its maximum age may be shorter than the unused refresh interval; the interval/max-age ordering rule applies to GET polling only. `resolveDataParameterLocations()` is now exported alongside `buildDataQueryRequest()`, and `buildDataGetRequest()` remains as the GET-compatible alias.

The React Workbench adds method selection, the POST read-only confirmation and manual-policy hint, API-key connection fields, query headers, parameter locations, body preview, and success-condition fields. Vue consumes the same core contract without adding data-source UI.
