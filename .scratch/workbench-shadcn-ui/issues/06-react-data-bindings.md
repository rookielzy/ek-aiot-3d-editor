# 06: React 对象绑定与草稿保护

Status: done
Blocked by: 05

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：21–24、29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在足够宽的对话框中完成对象绑定编辑、保存及定位，并保护未保存修改。

## Acceptance criteria

- [x] 保留既有绑定字段、保存、删除、对象选择及定位行为；错误与反馈清晰。
- [x] 长表单可滚动且操作入口可达，统一控件与数据配置视觉。
- [x] 切换对象、关闭或定位等离开操作按现有草稿边界确认；继续编辑保留内容，放弃后执行原意图。
- [x] 次级确认与父对话框逐层处理 Escape 和焦点；取消回入口，定位进入目标区域。
- [x] 保存后的预览、项目恢复和 Inspector 关联行为保持现有契约。
- [x] 验证编辑→保存→定位，以及未保存切换/关闭、取消确认、明确放弃的真实路径。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-12：实现完成，Status 设为 done。

### 实现要点

- `DataQueryBindingsDialog.tsx` 改用共享 `ui/Dialog`（原生 `<dialog>` + `showModal`），删除自建 Tab 陷阱与 Escape 处理；对象选择、定位、解绑、关闭统一走 `requestAction` 草稿边界，继续编辑保留草稿，放弃后执行原意图。
- 绑定表单分为查询映射、目标设备、绑定参数、点击详情、状态颜色、绑定状态六个 `form-section`，与数据配置对话框一致；详情/颜色/参数改用 shadcn 风格 `Button`、`Input`、`WorkbenchSelect`。操作栏改为底部吸附，长表单滚动时保存、取消、解绑始终可达；对话框加宽到 60rem 并复用共享滚动区。
- 列表行按钮改用可见文案 + 完整 aria 名称（`Edit`/编辑、`Locate`/定位）；目标区显示当前绑定设备、已保存/未保存标记，切换对象时保留同一查询上下文。
- 焦点：打开时落在对象选择器；关闭回到数据面板的绑定按钮（`{"kind":"query", bindings:true}`），编辑按钮仍由普通查询焦点目标恢复；定位后进入场景并把状态消息写入面板；查询在对话框下方消失时回落到新建入口。放弃草稿后回到对象选择器，取消确认时回到被中断的触发控件（`ui/Dialog` 新增 `fallbackFocus`）。
- 放弃即真正放弃：`DataBindingForm` 新增 `discardOpen`/`discardStatusKey`，确认放弃后表单回到已保存绑定并给出状态提示，而不是只清除脏标记。
- 评审修正：数字精度输入只在数值属性上出现（Core 会对非数值属性的 `detail-precision` 报错）；详情区空态按草稿字段判断；`<h4>` 分区标题与 `data-tone` 标记补上样式；删除死键并在 Vue 词表中同步真实 zh 文案。
- 保存通过既有 `buildSaveDataObjectBindingCommand` 写入版本化场景快照；界面临时状态（草稿、对话框、焦点）不进入快照；Inspector 复用同一 `DataBindingForm`，语义不变。
- 新增 i18n 键（en/zh-CN），并同步 Vue 词表以保持 i18n 奇偶校验。

### 验证

- `packages/react`：`pnpm exec tsc --noEmit -p tsconfig.json` 通过；`packages/vue` 的 `pnpm --filter @ek-aiot/3d-editor-vue run typecheck`（vue-tsc）通过；`packages/core` 通过。
- `packages/react`：`pnpm exec vitest run --root ../.. packages/react/test/workbench-i18n-parity.test.ts packages/react/test/workbench-object-binding.test.tsx packages/react/test/workbench-data-colors.test.tsx` 19 项通过。
- 仓库根目录 `pnpm test`：161 个文件、1427 项全部通过。
- `packages/react`：`pnpm exec vitest run --root ../.. packages/react/test/workbench-object-binding.test.tsx`（13 项）与 `packages/react/test/workbench-data-colors.test.tsx`（3 项）通过。新增用例：保存后在列表中定位绑定对象、Escape 逐层处理草稿确认；选择控件交互统一改用 `test/support/workbench-select.ts`。
- 仓库根目录 `pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/data-bindings-dialog.browser.test.tsx`：6 个 Chromium 视口（含 1100×800、1440×900、1920×1080）共 6 项通过。覆盖真实 GLB、HTTP 夹具执行器下的对话框宽度与滚动、编辑→保存→定位、未保存切换/关闭、取消确认、明确放弃与焦点回位，并截图保存。
- 仓库根目录 `pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/data-dialog.browser.test.tsx packages/react/test/object-data-colors.browser.test.tsx packages/react/test/object-data-details.browser.test.tsx`：18 个文件、42 项全部通过；`... packages/react/test/cross-framework-data.browser.test.tsx packages/react/test/http-data-source.browser.test.tsx packages/react/test/data-bindings-dialog.browser.test.tsx` 同样通过。浏览器用例只操作可见控件（角色 + 无障碍名称），不依赖内部 class 选择器。

### 未完成项

- 无。Vue 数据面板（任务 11）不在本任务范围。
