# 12: 验收跨框架闭环并完成文档和发布准备

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段四

Blocked by: 11

User stories: 25, 26, 27, 28, 29, 30, 31, 32

Decisions: D01, D02, D04, D05, D08, D10, D11, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

使用同一真实 HTTP/GLB 夹具验证 React、Vue、vanilla 的配置往返与运行态边界，并给宿主提供可安装、可集成的正式能力。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 完成公开导出、schema/数据源/执行器/生命周期文档，固定集成夹具与必要污染检查；核对已有 API 和迁移兼容。 |
| React | 完善正式示例的显式数据演示入口、绑定/问题/恢复指引、集成及 package-root 使用文档和可见界面证据。 |
| Vue | 使用同一数据与场景完成等价示例、集成文档和界面证据，不硬编码与 React 不同的设备定义。 |

## Acceptance criteria

- [ ] React 配置并导出 → Vue 恢复并显式连接 → vanilla 读取/执行的数据与身份一致；缺凭证时可修复。
- [ ] 所有 AC01–AC15 有对应证据，不用 SVG 原型截图、内存模拟请求或 2D renderer 冒充正式 WebGL/HTTP 验收。
- [ ] 1440×900、1920×1080、1100×800 下配置窗口/底部按钮/Inspector/问题入口可达，无横向遮挡；保存焦点与双语行为。
- [ ] 100 对象共享一个列表查询、100 台设备×2 属性、连续 3 个轮询周期无重复请求/队列累积，记录环境与事实，不声称生产吞吐。
- [ ] 默认空 editor 和 demo 未显式开启数据时零请求；运行态/样本/秘密不进入 Snapshot/.ek3d/clipboard。
- [ ] 构建、类型、单测、浏览器全套及现有发布校验通过；旧浏览器实例和原 proof loop 不删除、不放宽断言掩盖回退。
- [ ] React/Vue/core 集成、schema、交互、项目包、FAQ 和适用的 changeset 更新；记录命令、结果与剩余限制。
- [ ] 任务只做到发布准备，不发布 npm、不合并或部署；实现来源可追溯到正式规格和原型基线。

## Testing

执行 pnpm build、pnpm typecheck、pnpm test、pnpm test:browser 与现有发布验证；检查三个 package-root consumer；保留截图/短录屏和真实请求及材质状态证据。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不把发布准备理解为授权发布，不将原型代码直接并入正式示例。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-11-02：完成验收与发布准备（未发布 npm、未合并、未部署）。

### 新增证据

| 文件 | 覆盖 |
| --- | --- |
| `packages/core/src/data-sources/cross-framework.test.ts` | 框架无关契约：React 侧配置并导出 → Vue 宿主 `importProject` 恢复（`reconnect`/1 凭证）→ 补 `setHostCapabilities` 原地修复 → vanilla 从 v9 JSON 快照读取执行，三处 `dataSources`、device identity 与映射值一致；并断言宿主收到的请求描述符是同一条（GET + bearer `credentialRef`），而非各适配器自行重写；react/vue/vanilla 三种来源缺凭证均可修复且请求零发生；空宿主各入口零请求；runtime/样本/秘密不进入 snapshot、`.ek3d`、clipboard。 |
| `packages/react/test/cross-framework-data.browser.test.tsx` | 真实同源 HTTP 夹具（`/__fixtures__/http-data-source/devices`）+ **真实 5.4MB `ToyCar.glb`**（断言 `glTF` 魔数、`importGlbAsset` 成功、资产仍注册）与真实 WebGL（`webgl`/`webgl2` context 且 drawing buffer 非零）跑通 React 配置→导出→Vue 恢复并显式连接→vanilla 读取；导出包经解压后断言含公共头 `X-Fixture-Probe`、含 `credentialRef`、**不含 secret**。布局验收在 1440×900/1920×1080/1100×800 下检查数据面板、连接行、查询行、**Inspector**、**问题抽屉入口**与底部操作无横向遮挡；zh-CN 断言改为只存在于中文词典的界面文案（并要求英文 shell label 消失），不再依赖未翻译的 "Plant API"。性能用例记录并断言环境事实（headless Chromium UA、视口、100 绑定对象、每设备 2 属性、1 条查询、1 个共享上下文、共 4 次请求）。 |
| `packages/react/test/workbench-cross-framework.test.tsx`、`packages/vue/test/workbench-cross-framework.test.ts` | 两个适配器互为镜像：打开别处导出的项目、显示 reconnection required、保持可编辑、补能力后原地修复；悬空查询引用报告 damaged configuration 而非 open failed。 |
| `packages/core/src/data-sources/docs-contract.test.ts` | 文档契约：跨框架交付路径、vanilla 宿主执行器、项目包秘密排除、FAQ 说法、Vue README 退役断言必须与实现一致。 |
| `scripts/verify-release.mjs` | 打包后的 consumer 内新增跨框架恢复检查（导出→二次 editor 恢复→`reconnect`→持久域不变→恢复不触发任何预览流量）。 |

### 缺陷修复（本次验收发现）

Vue `WorkbenchToolbar.vue` 的 `openProject` 从不读取 `result.outcome`，因此恢复需要凭证的项目时只显示 "Opened …"，与 React 的 "reconnection required" 不一致；损坏的持久数据引用也只会落成 "Project open failed"。现已按 React 分支补齐 `reconnect` 与 `config-error` 两个分支，复用已有双语字典键。

`examples/vue-proof-loop` 此前没有宿主执行器、dev server 也没有数据源夹具，导致 Vue demo 无法演示数据功能；现补 `src/demo-data-executor.ts` 与 `dataSourceHttpFixturePlugin()`，与 React demo 对齐。

### 评审

按 `code-review` 技能对 Standards 与 Spec 两轴并行评审，采纳并修复：

- `WorkbenchToolbar.vue` 里 `config-error` 分支写了两处（`ok` 内与 `ok` 外的 `else if`），可读性上像死代码。核对 `importProject` 后确认两条路径都真实可达（`ok:false` 时由 `lifecycle.ts` 重新分类；`ok:true` 时由 `#dataRestoreOutcome` 分类），因此合并为单一前置分支并补注释说明。
- `.changeset` 原先多写了 `@ek-aiot/3d-editor-core: patch`，但本次没有改 core 公开行为，已删除；同时把 consumer 检查的描述从"跨框架读取执行"改为"经发布产物的持久域往返"，避免夸大。
- 浏览器用例原来的 `expect(exportedText).not.toContain("x-zone-key")` 是空断言（从未配置该头，且 ZIP 被压缩过）。改为解压后断言公共头存在、`credentialRef` 存在、secret 不存在。
- 浏览器用例原来用 4 字节 `glTF` 占位当 GLB。改为加载真实 `ToyCar.glb` 并断言魔数、导入成功与资产注册。
- zh-CN 断言原来只查未翻译的 "Plant API"，两种语言都会通过。改为断言仅存在于中文词典的界面文案，并要求英文 shell label 不存在。
- 布局验收补齐 Inspector 与问题抽屉入口的遮挡检查（`assertNoHorizontalOcclusion`）。
- 100 对象用例补上环境与事实记录。
- 命名：`configureInReactHost` → `authorDataProject`，`okExecutor` → `credentialCheckingExecutor`；`ConnectedHost.requests` 由未使用改为断言请求描述符一致。

未采纳：把三个测试文件里重复的 fixture 构造抽成共享模块。React/Vue 两份镜像用例刻意保持可独立阅读，且适配器测试按仓库约定就近放置；抽取收益低于跨包测试辅助模块的耦合成本。

### 命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --config.script-shell="C:/Program Files/Git/bin/bash.exe" build` | 通过（core/react/vue 全部构建成功） |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过（demo 打包成功；仅既有 500kB chunk 体积警告） |
| 各包 typecheck（core/react 用 `tsc -p … --noEmit`，vue 用 `vue-tsc -p tsconfig.json --noEmit`） | 通过，无错误 |
| `npx vitest run` | **156 files / 1378 tests 通过**（基线 152/1366，新增 4 个文件 12 个用例） |
| `npx vitest run --config vitest.browser.config.ts` | **33 files / 138 tests 通过**（基线 30/129，新增 1 个文件 9 个用例）；三个既有实例 1280×900、1024×900、390×900 全部保留未改动 |
| `node scripts/verify-release.mjs` | **在本机 Windows 无法执行**，见剩余限制 |

注：Windows 上 `pnpm`/`vitest` 通过 PowerShell 管道时即使全部用例通过也可能返回 `exit code: 1`（stderr 被当作错误记录），结果以上面的 `Test Files` / `Tests` 汇总行为准。

### 剩余限制（如实记录）

1. **发布校验脚本在 Windows 上无法运行**：`scripts/verify-release.mjs` 用 `spawnSync("pnpm", …)`（`shell: false`）调用打包，Windows 上只能解析到 `pnpm.CMD`，必然 `ENOENT`。该失败在**未修改的原始脚本**上同样复现，与本次改动无关；脚本设计目标是 Linux CI。因此新增的 consumer 跨框架检查**本次未在本机实际执行过**，需要在 Linux/CI 上跑 `pnpm release:verify` 才算闭环。本机只做了静态核对：脚本用到的 `createEditor`、`importProject`、`exportProject`、`buildSaveDataQueryCommand`、`buildSaveDataObjectBindingCommand` 均由 `packages/core/src/index.ts` 公开导出，`registerAsset` 为 editor 实例方法，与其余测试的用法一致。
2. **性能数据不是生产吞吐**：100 对象/100 设备×2 属性和 3 轮轮询的结论是"共享上下文生效、每轮恰好 1 次请求、无重复与堆积"。用例内已记录环境事实（headless Chromium UA、1440×900 视口），但夹具响应是本地同源内存 JSON，未测真实网络延迟、大响应体或 4 并发上限的排队压力，也不能外推为生产吞吐。
3. **浏览器证据为 headless Chromium（三个固定实例）**，非多浏览器矩阵；未覆盖 Safari/Firefox。三个既有实例（1280×900、1024×900、390×900）均未删改，新增文件因此在三种实例下各跑一遍；桌面布局断言以 `page.viewport()` 显式切换到三个目标尺寸。
4. 既有 `packages/react/test/__screenshots__/**` 与 `.vitest-attachments/**` 为测试运行产物，未纳入提交。
5. 数据源事件编排、动画和托管运行态发布仍不在范围内（见 `docs/faq.md`）。
6. Vue 的浏览器证据复用同一个 `cross-framework-data.browser.test.tsx`（在 Vue 宿主上渲染），未新增独立的 Vue 浏览器测试文件；Vue 侧另由 jsdom 镜像用例覆盖项目状态分支。
