# 08: Vue 项目菜单与视口工具

Status: done
Blocked by: 07

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–6、23–24、27–30。
用户于 2026-11-14 确认 07 的 React 体验验收通过，Vue 菜单与视口工具已完成。

## What to build

将已获用户验收的 React 工具和菜单体验适配到 Vue，保留 Vue 的宿主接入方式。

## Acceptance criteria

- [x] 开始前核对 07 的用户明确验收记录；缺少该记录时保持阻塞，不以 React 测试通过代替。
- [x] 高频直接入口、低频分组、选中/禁用原因及提示与已验收 React 一致。
- [x] 一次性操作关闭菜单、辅助切换保持菜单、Escape 和焦点返回符合规格。
- [x] 项目打开、完整/部分导出和失败反馈保持有效；现有工具无遗漏。
- [x] 使用 Vue 适用的内部原语，保留 scoped slots 和 locale 事件；发布样式自包含。
- [x] 通过 Vue 真实工作台行为和浏览器焦点验证，提供对齐证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-14：用户采纳代验结果并明确确认 [工单 07](07-react-acceptance.md) 通过。Vue 用已安装的 Reka UI 2.11.0 实现项目、辅助、相机和节点命令菜单。撤销、重做、变换、吸附及框选保留直接入口，语言选择器移至工具栏常驻。项目导入导出沿用原有完整性判断、处理中状态与问题反馈。菜单关闭、焦点与辅助显示属于临时 UI 状态，项目包与 Scene Snapshot 契约保持原样。[Reka UI Dropdown Menu](https://reka-ui.com/docs/components/dropdown-menu)

### 验证

- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --pool forks --maxWorkers 2`，161 个文件、1426 项全部通过。评审修复后，同一命令追加 Vue workbench、proof-loop integration、data-preview 和 cross-framework 四个测试文件，80 项全部通过。
- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/vue/test`，六个 Chromium 配置共 36 项通过，覆盖菜单键盘导航、Tab、分层 Escape、焦点恢复、辅助切换、禁用原因、输入隔离和视口边界。输入法通过合成 composition 键盘事件检查；未操作系统输入法候选窗。
- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium -t 'Vue|host status drawer'`，10 项通过。覆盖两种语言、真实资产、宿主区域、调宽、缩短视口后的菜单可达性、导出和恢复。
- 从 `packages/vue` 运行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/cross-framework-data.browser.test.tsx`，六个 Chromium 配置共 18 项通过。
- Core、React、Vue 的 `build` 和 `typecheck` 均通过。Windows 下构建脚本使用 Git Bash。`pnpm --filter @ek-aiot/vue-proof-loop build` 通过，Vite 报示例 JS chunk 超过 500 kB。
- 在构建后的 Vue 示例中替换样式为 `packages/vue/dist/index.css`，用 Chromium 检查菜单在视口内、继承工作台文本色、正常使用网格布局，宿主按钮的字体、边框、内边距和背景色保持原样。
- `node scripts/verify-release.mjs` 在 Windows 调用 `pnpm` 打包 Core 的步骤失败，故未完成三包消费者安装检查。直接运行 `pnpm --dir packages/vue pack --pack-destination <temp> --json` 通过，确认 tarball 内含 JS、类型声明、自包含的菜单 CSS 和 README。
- 可运行示例使用 `pnpm --filter @ek-aiot/vue-proof-loop dev`。下列截图来自生产构建预览，尺寸为原始像素。
  - [项目菜单的键盘焦点，1440×900](../acceptance/08-vue/screens/01-project-menu-1440x900-en.png)
  - [辅助切换后的菜单，1920×1080](../acceptance/08-vue/screens/02-viewport-helpers-1920x1080-en.png)
  - [中文节点菜单的禁用原因及视口边界，1100×800](../acceptance/08-vue/screens/03-node-operations-1100x800-zh-cn.png)

### 评审

- 仓库标准评审补上 Vue changeset 和 README 的语言入口说明，并使用 Core 批量更新辅助显示。快捷键提示沿用 React 的平台优先显示规则，共享快捷键元数据留待两框架一起整理。
- 规格评审修复菜单 Escape 事件传向宿主、问题抽屉的次序，以及窄视口与缩短视口中的菜单边界。相关浏览器回归和截图已更新。

