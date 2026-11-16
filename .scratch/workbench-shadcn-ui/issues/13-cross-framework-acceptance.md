# 13: 双框架一致性与最终验收

Status: done
Blocked by: 09, 10, 12

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

完成 Vue 外壳收尾和双框架回归，交付可对照的工作台体验及验证证据。

## Acceptance criteria

- [x] Vue 导航、标题、页签、滚动和收放统一，保持调宽、宿主扩展及语言 API。
- [x] 以规格全部用户故事核对 React/Vue 功能与交互等价，保留必要框架 API 差异。
- [x] 两框架在三种桌面尺寸下验证窄侧栏、长名称、空/错误状态、弹层焦点及中英文。
- [x] 完整 proof loop、数据配置/绑定、问题定位/修复和 Inspector 回归有效。
- [x] 完成适用构建、类型、常规/浏览器验证和两个示例构建；测试在包目录调用，记录命令、结果和限制。
- [x] 检查发布产物样式隔离及宿主扩展；提供可运行示例与关键状态截图。
- [x] 更新相关用户文档、许可或变更记录（按实际改动），汇总交付证据；不自动发布、合并或部署。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-15：完成双框架最终验收。Vue 外壳继续使用与 React 对齐的导航、标题、页签、滚动、左右收放、鼠标/键盘调宽、宿主 slots/render props 与双语 API；React 保留其 render props，Vue 保留 scoped slots 和 `update:locale` 事件。修复 Vue 资源摘要行将资产菜单误用场景树绝对定位的问题，窄栏和中文长标签下菜单现在留在资源行网格内。

验证证据：

- `packages/vue`：`pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/vue/test`，24 个文件、72 项通过。
- `packages/vue`：工具菜单、场景树、绑定浏览器回归 18 个文件、66 项通过；proof-loop、cross-framework 和 workbench 关键单测按包目录运行，聚焦重跑的菜单焦点用例通过。
- `packages/vue`：`pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium`，22 项通过，覆盖 React/Vue 真实 GLB、三种桌面尺寸、两种语言、宿主扩展、资源维护、数据配置/绑定、问题定位与 Inspector 恢复。
- `packages/react`：跨框架数据、展示场景和 React shell 浏览器回归共 66 项通过；i18n parity、workbench 和 proof-loop integration 关键单测通过，默认并发下个别长用例曾触发既有超时，使用单 worker 聚焦重跑通过。
- 顺序执行 Core、React、Vue 的 typecheck/build 以及 `examples/react-proof-loop`、`examples/vue-proof-loop` 的 build 均通过。Vite 仍报告示例 JavaScript chunk 大于 500 kB。
- 发布样式由两个包各自的 `dist/index.css` 提供。现有 acceptance 截图保留在 `acceptance/07-react/screens`、`acceptance/08-vue/screens` 和 `acceptance/09-vue/screens`，覆盖 1440×900、1920×1080、1100×800、中文、菜单、问题抽屉、资源和节点状态。

限制：Windows PowerShell 直接运行根 `pnpm typecheck` 或包 `build` 会因仓库脚本使用 Unix `rm` 失败，本次使用 Git Bash 顺序执行；未自动发布、合并或部署。

