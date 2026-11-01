---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": patch
"@ek-aiot/3d-editor-vue": patch
---

Report how a restored project's data configuration stands against the host. `ProjectImportResult.outcome` distinguishes an unusable package from durable data references that no longer resolve, and from credentials the host still has to provide. Dangling references are reported as `project-data-config-invalid` so they are not mistaken for a corrupt archive. The React project menu shows a reconnect hint when credentials are missing.
