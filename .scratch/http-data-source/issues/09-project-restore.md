# 09: 让项目导出恢复保持配置并停止旧运行态

Status: ready-for-human

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段三

Blocked by: 06, 07, 08

User stories: 25, 26, 28, 31, 32

Decisions: D02, D04, D11, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

将有多个数据源和对象绑定的真实场景导出/恢复到新 host，配置完整、旧预览清理、缺凭证仍能编辑并重新连接。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 贯通全部 v9 数据域的 Snapshot/项目包校验与迁移、JSON/.ek3d 往返、恢复前停止/取消/清理、运行态问题重新派生和缺执行能力恢复。 |
| React | 项目菜单/恢复反馈区分配置损坏与缺凭证/网络；恢复后预览关闭、样本未加载，可进入数据面板修复。 |
| Vue | 现有 Vue import/restore 路径必须能承载新 scene；本任务不增加数据 UI，跨框架完整流程验收在 12。 |

## Acceptance criteria

- [x] v1–v8 迁移保持旧场景，v9 多连接/查询/绑定在 JSON 和 .ek3d 往返后等价。
- [x] 项目 container/manifest 布局保持兼容；只有 scene schema 升级，不把字段新增当作容器破坏性更改。
- [x] 没有 executor、缺凭证、断网或资源未加载时仍可恢复合法配置；非法查询/NodeId 引用按配置错误报告。
- [x] 恢复/打开项目先结束试用/预览、撤掉颜色、取消旧请求；晚到旧响应不会写入新场景。
- [x] 恢复后预览关闭，不自动验证或联网；重新提供宿主执行器/凭证后显式启动能获得当前值。
- [x] 导出不含样本、测试参数、健康标记、密钥或运行态资源；导出不因服务暂不可达而失败。
- [x] 原有资产 payload、材质、camera view 和导入选择/变换/undo/restore proof loop 不回退。

## Testing

公开 serialize/restore 与 project package 往返、迁移、污染排除和旧响应隔离；React 项目 UI 与 vanilla 无 DOM 新 host；已有资产/相机/材质 round-trip 回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不保存数据历史、离线样本缓存或自动带出凭证，不实现新的项目包后端。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-11-01：已实现并提交。

- core 新增 `data-sources/config-problems.ts`：`buildDataConfigProblems` 按 NodeId/查询/连接引用派生配置错误，`classifyDataConfigProblems` 区分配置损坏与缺凭证；`ProjectImportResult.outcome` 暴露 `package-error` / `config-error` / `reconnect` / `none`。工作台模型把配置问题并入数据问题列表。
- 项目包校验把无法解析的数据引用报为 `project-data-config-invalid`，与 `project-scene-invalid` 区分；container/manifest 布局未变。
- React 项目菜单按结果区分配置损坏（error）与需重新连接（warning），并新增 en/zh-CN 文案；Vue 字典同步同键以维持 parity（本任务不加数据 UI）。
- 顺带修正一个与本任务无关的既有失败断言：ticket 08 已改文案，`workbench-data-sources.test.tsx` 仍断言旧文案。

验证命令与结果：
- `npx tsc -p packages/core/tsconfig.json --noEmit`、React `tsc --noEmit`、Vue `vue-tsc --noEmit`：通过。仓库 `pnpm typecheck` 在 Windows 因脚本使用 `rm -rf` 无法运行，改为等价的直接调用。
- `pnpm test`：147 文件 / 1334 用例全部通过（改动前基线为 1300 通过、1 失败，即上面那条旧文案断言）。
- `pnpm test:browser`：30 文件 / 129 用例全部通过。

2026-11-01（review 跟进）：按 code-review 两个 sub-agent 的结论修了实质问题，另起一个 commit。

- **改为结构化分类**：不再用英文报错前缀正则判断"是不是配置损坏"。`validateDataSources` 在检测到绑定的查询不存在、查询的连接不存在、绑定目标不是对象节点时，额外产出一条结构化 `DataReferenceIssue`；`validateSceneSnapshot` 把它随 `danglingDataReferences` 返回。因此 `Data connection X must use a matching non-empty id.` 这类结构性损坏仍报 `project-scene-invalid`（`package-error`），只有纯引用悬空才报 `project-data-config-invalid`（`config-error`）。
- **修 code 冲突**：配置问题 code 改为 `config-query-missing` / `config-connection-missing` / `config-target-not-object`，不再和运行时已有的 `query-missing` 同名；并导出 `DATA_CONFIG_PROBLEM_CODES`、`isDataConfigProblemCode`。
- **去掉级联噪音**：查询已悬空时跳过绑定字段校验，避免同一处问题被 `query-not-found`、`detail-unknown` 重复报一遍。
- **修正文案**：`openConfigInvalid` 原文案写"已打开的场景…"但此时 `ok === false`（场景并未打开），改为"项目数据配置已损坏（N 处引用失效）"。
- **补测试有效性**：对 `restore-runtime` 的两条"晚到响应"用例做了变异验证（临时去掉 `#isCurrentRun` 与 `#completeContext` 的保护），确认它们靠的是 abort 竞态把响应置为 `null`，而不是断言写错；同时把 payload 改成可区分的值并断言不会出现在状态里。新增"恢复后数据面板仍可打开修复"的 React 用例。
- **补公共契约**：新增 `.changeset/project-restore-data-config.md`，更新 `packages/core/README.md` 与 `docs/project-package.md`，`public-api.test.ts` 覆盖新增导出。

复跑：`pnpm test` 147 文件 / 1334 用例通过；`pnpm test:browser` 30 文件 / 129 用例通过；三个包 typecheck 通过。

遗留（不在本任务范围）：Vue 的工具栏本任务不加数据 UI（按 spec 由 ticket 12 统一验收），因此只同步了 i18n 键以维持 React/Vue 字典 parity。
