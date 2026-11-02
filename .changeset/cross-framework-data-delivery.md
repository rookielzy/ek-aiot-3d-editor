---
"@ek-aiot/3d-editor-vue": patch
---

Report a restored project's data state in the Vue Workbench the same way React does. Importing a project whose connections still need host credentials now shows the reconnect status ("reconnection required for N credentials") instead of a plain "opened" message, and a project whose durable data references no longer resolve reports repairable damage rather than a failed open. Both statuses reuse the existing bilingual dictionary entries, so `zh-CN` gets the matching copy.

Document the cross-framework delivery contract: the Vue package README and integration guide now describe the shipped Vue data workspace (connections, queries, request tester, bindings dialog, binding form, preview controls, detail card), state that both adapters call the framework-neutral `editor.getDataService()` instead of reimplementing request or mapping logic, and explain how `setHostCapabilities()` repairs an already-open restored project. The vanilla integration guide gains a host-executor section covering the frozen request descriptor, credential injection, explicit `startPreview()`/`refreshPreview()`, and the `executor-unavailable` / `credential-unavailable` runtime problems. The project package, FAQ, release, and docs index pages drop the retired claim that the Vue data workspace kept its old state.

The published consumer check now exports a data-bound project through the packed package root and restores it in a second editor, asserting an unchanged durable `dataSources`, the `reconnect` outcome, and that restore does not start preview traffic. This exercises the durable round-trip through the published tarball; the cross-framework read and execute path is covered by the browser suite instead.
