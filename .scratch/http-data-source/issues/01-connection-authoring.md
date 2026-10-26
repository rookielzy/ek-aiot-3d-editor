# 01: 建立可保存的连接配置与数据工作区

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段一

Blocked by: None

User stories: 1, 2, 26, 29, 32

Decisions: D01, D02, D03, D12

实施前必须完成 Blocked by 中的任务。

2026-10-26：已按本任务实现并完成验证，实际命令与结果见 Comments。

## What to build

在 React 数据工作区创建、编辑、复制与删除尚未使用的连接，保存/撤销后配置与列表一致；旧宿主继续正常工作。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 引入 v9 dataSources 及合法空 queries/bindings 的最终类型边界、旧版本迁移、连接校验/command、引用统计与框架无关连接列表模型；同步公开导出与既有构造选项兼容。 |
| React | 新增数据导航、空态、搜索与连接表单；显示宿主凭证描述及缺失状态，调用 core 保存/撤销，支持 en/zh-CN。 |
| Vue | 本任务不新增数据界面；验证原有 Vue 宿主可加载 v9 空数据域和仅连接配置，避免 core 升级破坏旧适配器。 |

## Acceptance criteria

- [x] 空 editor 不注入连接、查询或模拟设备，不发网络请求；v1–v8 恢复后数据域为空。
- [x] 连接名称去重，拒绝非法服务地址/秘密嵌入与非法超时；无凭证或离线仍可保存合法配置。
- [x] 一次保存是一项 command/history；失败不改变 Snapshot，undo/redo 与序列化恢复保持等价。
- [x] 复制连接生成新 ID/名称，不复制查询；无引用可删除。
- [x] 数据面板与表单提供双语、可访问标签和稳定焦点；不得为了原型入口改写正式 viewport。
- [x] v9 能通过现有 Snapshot/项目 scene 校验入口，旧 React/Vue/vanilla 创建与读取路径保持可用。

## Testing

公开 Editor 的连接命令、迁移/校验及 serialize/restore；React Workbench 连接操作 DOM；三个 package-root 构建/类型兼容。该任务不触及 viewport，不要求为纯表单新增 WebGL 测试。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现网络执行、查询保存或对象绑定；不要先建立通用插件框架。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-26：实现完成，代码审查后补齐公共请求头编辑、未保存草稿确认、毫秒级 timeout 往返，以及 `EditorWorkbench` 的 `credentials` 透传和 project problem 重建时的凭证保留；移除未要求的 metadata/默认输入 helper。实际验证：

- `pnpm --filter @ek-aiot/3d-editor-core build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-react build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-vue build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-core typecheck`：通过。
- `pnpm --filter @ek-aiot/3d-editor-react typecheck`：通过。
- `pnpm --filter @ek-aiot/3d-editor-vue typecheck`：通过。
- `pnpm vitest run packages/core/src/data-sources/data-sources.test.ts packages/core/src/public-api.test.ts`：29 tests passed。
- `pnpm vitest run packages/react/test/workbench-data-sources.test.tsx`：12 tests passed。
- `pnpm test`：119 test files / 1009 tests passed。
- `pnpm test:browser`：18 test files / 108 tests passed（Chromium）。

测试覆盖空 editor 离线、v1–v8 迁移、连接增改复制删除/撤销、字段级校验原子性、凭证缺失与透传、公共请求头、未保存草稿确认、timeout 往返、搜索/双语/焦点保持，以及 Vue package-root 加载 v9 连接配置。未改动正式 viewport。

2026-10-26：修复提交 `91e4864` 的四项 code review 问题：认证对象拒绝额外字段，防止秘密随 Snapshot 恢复和再次保存；复制名称校验不再排除源连接；React 凭证描述采用初始化语义，重渲染不替换 editor；新建与编辑入口统一保护未保存草稿，并在确认后恢复名称输入框焦点。React 集成文档补充凭证初始化约定。

新增 10 项回归用例，覆盖两种认证模式的校验/恢复/command 原子性与错误脱敏、复制名称与执行结果一致、凭证数组重建或变化时场景与 history 保留、语言切换时 canvas 与 undo/redo 保留，以及新建/编辑当前连接/编辑其他连接的草稿继续/放弃流程。修复前相关用例出现预期失败；修复后初次定向验证 47 tests passed。

- 从 `packages/react` 执行 `pnpm exec vitest run --root ../.. packages/core/src/data-sources/data-sources.test.ts packages/react/test/use-editor.test.tsx packages/react/test/workbench-data-sources.test.tsx`：47 tests passed。
- 根目录执行 `pnpm --filter @ek-aiot/3d-editor-core --filter @ek-aiot/3d-editor-react --filter @ek-aiot/3d-editor-vue build`：三个 package-root 构建通过；本次命令将 Git 的 `usr/bin` 临时加入 PATH，以运行既有构建脚本中的 `rm`。
- 根目录执行 `pnpm --filter @ek-aiot/3d-editor-core --filter @ek-aiot/3d-editor-react --filter @ek-aiot/3d-editor-vue --workspace-concurrency=1 typecheck`：三个 package-root 类型检查通过。

环境差异：当前没有 Bun，根 package.json 也没有 `check` 脚本。Windows 下根 `pnpm build` 的单引号路径过滤器未匹配包，因此使用上述明确包名完成实际构建。没有修改构建脚本或测试超时配置。

- 从 `packages/react` 执行 `pnpm exec vitest run --root ../.. --config D:/code/ek-aiot-3d-editor/vitest.browser.config.ts`：18 test files / 108 tests passed，涵盖 Chromium 三个既有 viewport 实例。
- 全量验证定位到既有 `import-runtime-race.test.ts` 依赖根工作目录读取夹具，改为相对测试文件定位；从 `packages/core` 执行 `pnpm exec vitest run --root ../.. packages/core/src/assets/import-runtime-race.test.ts --maxWorkers=1`：1 test passed。
- 浏览器与全量测试并行时，既有 Inspector 用例触发 10 秒超时；从 `packages/react` 执行 `pnpm exec vitest run --root ../.. packages/react/test/inspector.test.tsx -t 'retains failed dispatch drafts' --maxWorkers=1`：1 test passed，实际用例约 1 秒。
- 浏览器验证结束、夹具路径修正后，从 `packages/core` 执行 `pnpm exec vitest run --root ../.. --maxWorkers=2`：119 test files / 1019 tests passed，包含全部 10 项新增回归与确认后的焦点断言；本轮没有调整默认测试超时。
- `git diff --check`：通过。
