# 09: Vue 场景树交互对齐

Status: done
Blocked by: 08

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：7–10、23–25、30。
2026-11-14 实现完成，验收证据见 Comments。

## What to build

在 Vue 中提供与已验收 React 等价的场景树浏览、选择和节点操作体验。

## Acceptance criteria

- [x] 方向键浏览/展开/折叠与 Enter 选择有效，焦点和 selection 分离。
- [x] 搜索、多选修饰键、祖先展开、双击聚焦及视口联动保留。
- [x] 更多入口、能力判断、禁用原因及菜单焦点与 React 一致。
- [x] 完整节点类型及 imported target 诊断保留，窄栏和长名称可用。
- [x] 真实工作台测试覆盖键盘、搜索、选中和节点操作，提供截图。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-14：Vue 场景树支持方向键、Home、End、Enter 和 Space。浏览焦点与选择分别显示，选中节点后沿用既有 Inspector 和视口联动。「更多」按钮支持指针、Tab、ContextMenu 和 Shift+F10。行菜单复用 Reka UI 2.11.0 与 Core 节点能力判断，快捷键和菜单焦点仅存在于工作台中。复制 imported target 时以所属对象为根，保留导入子树和材质覆盖。禁用原因直接显示在对应命令下方。[Reka UI Dropdown Menu](https://reka-ui.com/docs/components/dropdown-menu)

### 验证

- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts`，全量浏览器套件 126 个文件、444 项通过。评审修复后，单独运行 `packages/vue/test/workbench-hierarchy.browser.test.ts` 和 `packages/vue/test/workbench-tools-menu.browser.test.ts`，六种 Chromium 配置共 60 项通过。合成键盘事件覆盖输入法组合态。
- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium -t 'Vue|in vue'`，10 项通过。覆盖真实 GLB、长名称、最窄侧栏、祖先展开、双击聚焦、视口选择和导出恢复。
- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --pool forks --maxWorkers 2`，1420 项通过，React 工作台与对象绑定文件中的 6 项触发默认 10 秒超时。随后以 `--pool forks --maxWorkers 1 --testTimeout 30000` 复跑上述两个 React 文件和 Vue 的 `workbench.test.ts`、`vue-proof-loop.integration.test.ts`、`workbench-cross-framework.test.ts`，148 项全部通过。
- 根目录 `pnpm run typecheck` 和 `pnpm run build` 通过。评审修复后，`packages/vue` 的 `pnpm run typecheck` 和 `pnpm run build` 均通过，构建脚本使用 Git Bash。`examples/vue-proof-loop` 的 `pnpm run build` 通过，保留 Vite 的大 chunk 提示。
- 在 1100×800 的生产示例中使用 `packages/vue/dist/index.css` 验证菜单位置、弹层主题继承与宿主按钮样式隔离。
- 可运行示例使用 `pnpm --filter @ek-aiot/vue-proof-loop dev`。截图来自生产构建预览。
  - [1440×900 英文节点菜单与禁用原因](../acceptance/09-vue/screens/1440x900-en.png)
  - [1920×1080 搜索、独立焦点及导入节点诊断](../acceptance/09-vue/screens/1920x1080-en.png)
  - [1100×800 中文节点菜单与最窄侧栏](../acceptance/09-vue/screens/1100x800-zh-CN.png)

### 评审

- 仓库规范评审修复多工作台的焦点串移，并收紧事件处理。Vue 的树和视口共用节点命令列表，两种框架沿用 Core 的能力判断。行命令参数与剪贴板载荷的组装仍各自在适配器中，避免为本任务扩大 Core API。
- 规格评审修复 Tab 访问「更多」和 Escape 先关行菜单、再关问题抽屉的次序。相关浏览器用例通过。
