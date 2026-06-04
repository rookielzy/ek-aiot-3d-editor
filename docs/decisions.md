# 设计决策

本文记录当前项目文档需要长期遵守的架构决策。更完整的历史推导见 `./brainstorms/`、`./ideation/` 和 `./plans/`。

## D1. Snapshot-first

Scene Snapshot 是唯一 durable source of truth。所有可保存、可撤销、可恢复的编辑结果都必须进入版本化 Snapshot。

原因：

- 保存/恢复可预测。
- Vue/React 行为一致。
- 命令和 history 可测试。
- Runtime 失败不会破坏项目文件。

## D2. Commands are the editing contract

持久化编辑必须通过 command：

- `import-glb`
- `register-asset`
- `select-object`
- `set-transform`
- `set-material`
- `set-environment`
- `add-light`
- `update-light`
- `remove-light`

原因：

- 统一 undo/redo。
- 避免 UI 直接修改 Snapshot。
- 让 runtime interaction 和 inspector 使用同一语义。

## D3. Three.js is runtime projection

Three.js scene、object、texture、renderer、PMREM 输出都是 Snapshot 的投影或派生资源，不是 durable state。

原因：

- Three.js 对象不可 JSON 序列化。
- 资源生命周期必须明确 dispose。
- 同一 Snapshot 可以在不同 host/runtime 中恢复。

## D4. Core owns runtime projection in v1

当前没有单独的 runtime 包。`@ek-aiot/3d-editor-core` 直接包含 Three.js runtime projection。

原因：

- MVP 需要快速验证 proof loop。
- 避免过早拆分包导致 API 过度设计。
- React/Vue shell 可以保持足够薄。

约束：

- Core 内部仍要分清 durable modules 和 runtime modules。
- React/Vue 不应 import core 私有 runtime 文件。

## D5. Asset references are durable; payloads are runtime/project data

Snapshot 保存 `AssetReference`，不保存 payload。Payload 来自 host resolver 或 `.ek3d` 项目包。

原因：

- JSON Snapshot 保持轻量和可迁移。
- 宿主可接入自己的 CDN、上传、权限和缓存系统。
- 缺失资产可以恢复，不会破坏 scene graph。

## D6. Runtime problems are derived state

Resolver、loader、texture、HDR、PMREM、projection 失败通过 runtime problem 暴露，不写入 Snapshot。

原因：

- 同一 Snapshot 在不同 host 中可能成功或失败。
- 失败结果通常依赖网络、浏览器、文件权限或 runtime 资源。
- 自动写回会污染 durable project state。

## D7. Framework packages are thin adapters

React/Vue 包只负责：

- 生命周期。
- Snapshot 订阅。
- runtime mount/dispose。
- inspector/workbench UI。
- render prop 或 scoped slot 扩展。

不负责：

- command reducer。
- history。
- project package validator。
- asset resolver 核心逻辑。
- runtime resource cleanup。

## D8. Inspector model lives in core

Core 输出框架无关 inspector model 和 command builder。React/Vue 分别渲染 UI。

原因：

- 字段、默认值、校验、命令语义一致。
- UI 可以保留框架原生写法。
- 避免两个 shell 逐渐分叉。

## D9. `.ek3d` is separate from Snapshot

`.ek3d` 是携带 Snapshot 和 payload 的项目包，不替代 Snapshot schema。

原因：

- Snapshot 继续保持 JSON-compatible。
- 本地项目文件可以携带二进制资产。
- 缺失 payload 可以用 `replaceAsset()` 按 asset ID 恢复。

## D10. `0.x` means experimental

当前 public packages 不承诺 1.0 API 稳定性。

原因：

- MVP 还在验证核心 contract。
- 后续还会新增层级、多选、完整 viewport interaction、插件扩展和低代码能力探索。
- 发布流程需要先保证包边界和 tarball 质量，再承诺长期 API。

## D11. Default workbench UI stays package-owned

React 和 Vue 默认 Workbench shell 暂不引入第三方 UI 组件库。Toolbar、left panel、status bar 和相关控件由各框架包内组件与稳定 `ek-` CSS class 实现。

原因：

- 安装即用路径不应要求宿主配置、主题化或类型依赖第三方 UI library。
- 当前 shell 需要的是编辑器专用的紧凑布局、状态按钮、文件输入和问题恢复入口，React/Vue 包内组件足够覆盖并能保持行为等价。
- 后续如果引入菜单、tooltip、dockable layout 或复杂 tree 控件，依赖必须先包在内部组件后面，不能泄漏到 public props/types。
