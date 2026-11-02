# FAQ

## 这个项目和 2D 编辑器是什么关系？

这是独立的 3D 编辑器仓库，不复用 2D 编辑器的 Konva/Pinia/Vue full shell 架构。当前 3D 项目使用 Three.js runtime projection，并把 durable state 放在版本化 Scene Snapshot 中。

## SceneNode 是什么？

`SceneNode` 是当前 v4 snapshot 的 shared hierarchy/target contract。GLB object、empty group、light 都通过 `NodeId` 参与层级、选择、inspector targeting、runtime picking 和 command/history。Object payload 与 light payload 仍保留独立 map，material assignment 也仍以 object payload 为目标。

## Snapshot 里为什么不能存 File、Blob 或 Three.js 对象？

因为 Snapshot 是持久化、可迁移、跨框架复用的 JSON contract。`File`、`Blob`、object URL、Three.js object、已加载 texture、PMREM 输出都只在某个浏览器 runtime 中有意义，写入后会破坏保存/恢复、测试和跨应用复用。

## GLB 文件本身保存在哪里？

普通 Snapshot 只保存 `AssetReference`。GLB payload 可以由宿主 resolver 提供，也可以通过 `.ek3d` 项目包的 `assets/*` 携带。

## `.ek3d` 是稳定格式吗？

不是。它是实验性 `0.x` 项目包格式。当前结构是 `project.json`、`scene.json` 和 `assets/*`，但长期兼容性还没有 1.0 承诺。

## React/Vue 包会不会各自实现一套编辑器逻辑？

不会。React/Vue 只做生命周期、UI 渲染和扩展区域适配。命令、history、Snapshot、runtime projection、asset/project package 逻辑，以及数据源的请求构造、映射求值、响应判定和预览调度都在 core。两个包的数据工作区因此行为一致，跨框架传递的 `.ek3d` 不需要任何转换。

## 为什么 core 直接依赖 Three.js？

当前 v1 目标是快速建立可运行 proof loop，避免过早拆出 runtime 包。Core 内部仍然把 durable contract 和 runtime projection 分层，后续如果需要可以再拆包。

## 是否支持模型材质编辑？

当前支持保存 `MeshStandardMaterial` override 的小子集和 texture slot 资产引用，并在 runtime 将 object-level assignment 投影到 GLB 对象下的 `MeshStandardMaterial` mesh。完整子网格 material slot discovery、per-submesh assignment、复杂材质编辑、节点材质和 shader 编辑仍是后续工作。

## React/Vue 本地 demo 能验证哪些交互？

两个 demo 都是可操作 workbench：camera helper、viewport/层级 node selection、TransformControls 或 toolbar transform、undo/redo、material inspector、node hierarchy operation、`.ek3d` export/reopen 和 missing-asset recovery。Proof checklist 是从当前 runtime/editor/session 状态派生的验证视图，不会保存到 Snapshot 或项目包。

## `pnpm test:browser` 验证的是什么？

它使用 Vitest browser mode 和 headless Chromium，覆盖 runtime picking、TransformControls smoke、React/Vue demo checklist parity、问题 badge、层级文本和 canvas 非空渲染 smoke，以及跨框架数据闭环：真实同源 HTTP 夹具与真实 WebGL 渲染下的 React 配置 → 导出 → Vue 恢复并连接 → vanilla 读取，配合 1440×900 / 1920×1080 / 1100×800 布局与中英双语检查。它避免脆弱的 WebGL 像素级比对，也不是完整发布站点或托管 runtime 测试。

## 是否支持 HDR 环境？

Snapshot 和 runtime 已有 HDR environment/background intent、资产解析和 PMREM runtime 输出路径。解析失败会暴露 runtime problem。不要把 HDR texture 或 PMREM 输出写入 Snapshot。

## 是否支持数据绑定、事件、动画或运行态发布？

HTTP 数据源与对象数据绑定已经支持：`snapshot.dataSources` 保存连接、查询和绑定，宿主通过 `createEditor({ executor, credentials })` 提供请求能力，`editor.getDataService()` 提供手动预览、刷新和对象数据状态，`editor.getDataColorService()` 按数据值驱动状态颜色。React 与 Vue Workbench 都提供等价的数据工作区与检查器界面。

事件编排、动画和托管运行态发布仍不支持。这些属于 Le5le-like 低代码平台能力，不是当前 snapshot-first 3D editor contract 的范围。

## 数据源的凭证会写进 `.ek3d` 吗？

不会。连接只保存认证**类型**和 `credentialRef`，秘密由宿主执行器在发送时解析并注入请求头。响应正文、样本、`receivedAt`、预览开关和试运行结果同样只存在于当前会话的 runtime 状态。所以项目包可以在 React、Vue 和无框架宿主之间传递，接收方收到 `outcome.kind === "reconnect"` 后补齐自己的凭证即可，不需要重新配置。

## 是否支持 Agent 集成？

当前没有 Agent API、MCP server 或 host-injected Agent runtime。后续可以在 command/snapshot contract 稳定后规划，但现在不应作为已实现能力说明。

## 如何处理缺失资产？

缺失资产不会删除对象或清空 asset reference。Runtime 会暴露 recoverable problem；React/Vue 底部状态摘要可打开问题抽屉，抽屉显示来源和严重性，并允许用户选择文件调用 `editor.replaceAsset()`。关闭抽屉不会删除问题。

## 为什么有 `serialize()` 还需要 `exportProject()`？

`serialize()` 只输出 JSON Snapshot，适合资产由宿主系统管理的场景。`exportProject()` 输出 `.ek3d` 包，适合需要连同当前可用二进制 payload 一起携带的本地项目文件。

## 当前发布稳定性如何？

三个 public package 仍是实验性 `0.x`。API 适合验证当前契约和内部复用，不承诺 1.0 稳定性。
