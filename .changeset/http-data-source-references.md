---
"@ek-aiot/3d-editor-core": minor
"@ek-aiot/3d-editor-react": minor
"@ek-aiot/3d-editor-vue": patch
---

Protect data-source references across authoring and node operations. Deleting a query with object bindings or a connection with queries is rejected without changing the snapshot or history, and incompatible property/parameter edits are blocked while compatible metadata edits revalidate the bindings.

Carry bindings plus their referenced query and connection configuration through duplicate and the v2 object / v3 node clipboards, keeping legacy v1 object and v2 node payloads readable. Cross-editor paste reuses identical definitions, clones conflicting ids with unique names, rewrites dependencies, and maps bindings onto the pasted object node ids without overwriting target configuration.

React shows query, property, and parameter usage with blocking reasons, selects or unbinds referenced objects, and confirms that a duplicate or pasted copy still points at the same device. Vue consumes the updated core contract without new data UI.
