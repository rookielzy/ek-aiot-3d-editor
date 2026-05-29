---
source: ce-code-review autofix
branch: feat/core-schema-extension
head: ebbbb1057da5589e0e9b529b2218d312579cb888
plan: docs/plans/2026-05-29-001-feat-core-schema-extension-plan.md
created: 2026-05-29
---

## Residual Review Findings

- P2 packages/core/src/commands/types.ts:54 - Command inputs directly reuse durable schema types. No tracker sink was filed; defer to a design follow-up to define command-layer DTOs such as EnvironmentPatchInput, LightCreateInput, LightUpdateInput, and MaterialOverridePatchInput.
- P2 packages/core/src/snapshot/types.ts:27 - GLB objects and lights remain separate durable models. No tracker sink was filed; defer to a design follow-up to decide whether to introduce a shared SceneNode/NodeId boundary before inspector/hierarchy work.
- P3 packages/core/src/environment/types.ts:12 - Top-level environment mode overlaps with background mode. No tracker sink was filed; defer to a design follow-up to evaluate explicit environment.source/background.source objects before runtime HDR/skybox work.
