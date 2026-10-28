---
"@ek-aiot/3d-editor-core": patch
"@ek-aiot/3d-editor-react": patch
"@ek-aiot/3d-editor-vue": patch
---

Preserve exact device identities in object bindings and report invalid referenced query mappings as snapshot validation errors. Resolve preview request parameters once at the request boundary.

Repair binding query creation after connections change, release cancelled device candidate requests, reopen detail cards after object selection changes, and protect unsaved binding drafts when closing the query bindings dialog or switching objects. Keep the confirmation messages aligned across adapter locales.
