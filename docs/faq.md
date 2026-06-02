# FAQ

## 这个项目和 2D 编辑器是什么关系？

这是独立的 3D 编辑器仓库，不复用 2D 编辑器的 Konva/Pinia/Vue full shell 架构。当前 3D 项目使用 Three.js runtime projection，并把 durable state 放在版本化 Scene Snapshot 中。

## Snapshot 里为什么不能存 File、Blob 或 Three.js 对象？

因为 Snapshot 是持久化、可迁移、跨框架复用的 JSON contract。`File`、`Blob`、object URL、Three.js object、已加载 texture、PMREM 输出都只在某个浏览器 runtime 中有意义，写入后会破坏保存/恢复、测试和跨应用复用。

## GLB 文件本身保存在哪里？

普通 Snapshot 只保存 `AssetReference`。GLB payload 可以由宿主 resolver 提供，也可以通过 `.ek3d` 项目包的 `assets/*` 携带。

## `.ek3d` 是稳定格式吗？

不是。它是实验性 `0.x` 项目包格式。当前结构是 `project.json`、`scene.json` 和 `assets/*`，但长期兼容性还没有 1.0 承诺。

## React/Vue 包会不会各自实现一套编辑器逻辑？

不会。React/Vue 只做生命周期、UI 渲染和扩展区域适配。命令、history、Snapshot、runtime projection、asset/project package 逻辑都在 core。

## 为什么 core 直接依赖 Three.js？

当前 v1 目标是快速建立可运行 proof loop，避免过早拆出 runtime 包。Core 内部仍然把 durable contract 和 runtime projection 分层，后续如果需要可以再拆包。

## 是否支持模型材质编辑？

当前支持保存 `MeshStandardMaterial` override 的小子集和 texture slot 资产引用，并在 runtime 将 object-level assignment 投影到 GLB 对象下的 `MeshStandardMaterial` mesh。完整子网格 material slot discovery、per-submesh assignment、复杂材质编辑、节点材质和 shader 编辑仍是后续工作。

## 是否支持 HDR 环境？

Snapshot 和 runtime 已有 HDR environment/background intent、资产解析和 PMREM runtime 输出路径。解析失败会暴露 runtime problem。不要把 HDR texture 或 PMREM 输出写入 Snapshot。

## 是否支持数据绑定、事件、动画或运行态发布？

当前不支持。这些属于 Le5le-like 低代码平台能力，不是当前 snapshot-first 3D editor contract 的范围。

## 是否支持 Agent 集成？

当前没有 Agent API、MCP server 或 host-injected Agent runtime。后续可以在 command/snapshot contract 稳定后规划，但现在不应作为已实现能力说明。

## 如何处理缺失资产？

缺失资产不会删除对象或清空 asset reference。Runtime 会暴露 recoverable problem，React/Vue problem panel 可以让用户选择文件并调用 `editor.replaceAsset()`。

## 为什么有 `serialize()` 还需要 `exportProject()`？

`serialize()` 只输出 JSON Snapshot，适合资产由宿主系统管理的场景。`exportProject()` 输出 `.ek3d` 包，适合需要连同当前可用二进制 payload 一起携带的本地项目文件。

## 当前发布稳定性如何？

三个 public package 仍是实验性 `0.x`。API 适合验证当前契约和内部复用，不承诺 1.0 稳定性。
