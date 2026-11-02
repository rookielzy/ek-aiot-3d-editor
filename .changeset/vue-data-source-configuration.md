---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": minor
"@ek-aiot/3d-editor-vue": minor
---

Add the Vue HTTP data source workspace: connection authoring, query configuration with live mapping preview, and a manual request tester that match the React adapter. Move the framework-agnostic query form model and the data problem message-key maps from the React package into core so both adapters share the same fields, defaults, validation problems, and copy instead of duplicating mapping or error logic in their components.
