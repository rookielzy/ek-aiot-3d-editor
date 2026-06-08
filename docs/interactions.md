# 交互与编辑能力

当前项目还不是完整 3D 低代码编辑器。本文只描述当前 core 和 shell 已覆盖或已建立契约的交互能力。

## 当前 proof loop

已验证的最小闭环：

1. 导入 GLB 资产引用。
2. 选择导入对象。
3. 提交 Transform 变更。
4. 撤销/重做 Transform。
5. 序列化 Snapshot。
6. 恢复 Snapshot。
7. runtime 重新投影等价场景。
8. 可选导出/导入 `.ek3d` 项目包。
9. React/Vue 本地 proof-loop demo 中通过层级面板、资产工作区、问题面板、material inspector 和 proof checklist 验证这些状态。

## 本地 demo 浏览器验证

React 和 Vue proof-loop demo 的可见验证路径保持一致：

1. 使用 camera helper（Reset camera / Frame selected / Frame all）验证 transient camera controls。
2. 通过 viewport picking 或 Scene hierarchy 选择 object、group、light node，并在层级中看到 selected / primary 标记。
3. 通过 TransformControls 或 demo toolbar 提交一次 transform，并验证 undo/redo。
4. 通过 Material inspector 修改支持的 object-level `MeshStandardMaterial` 字段，并确认 runtime 投影更新。
5. 通过 Node operations 执行 duplicate、copy/paste、delete、group、ungroup 等 hierarchy 操作。
6. 导出并重新导入 `.ek3d` 项目包。
7. 观察 recoverable missing-asset problem，然后用 stable asset ID 替换资产并清除 problem。

`pnpm test:browser` 使用 headless Chromium 跑 browser-level evidence：runtime picking、TransformControls smoke、React/Vue demo checklist parity、hierarchy/status/problem badge 断言，以及 canvas 非空渲染 smoke。测试避免像素级 WebGL 比对，优先验证用户可观察且稳定的状态。

## 节点选择与多选

当前 durable selection 使用 `NodeId`。GLB object、empty group、light 都可以成为选中目标；object-only API 仍保留为兼容路径，并从 node selection 派生 selected object IDs。

Core runtime 提供 node-aware picking；命中 GLB mesh 时会选择所属 object node，命中 light runtime target 时会选择对应 light node。兼容 API `pickObject(objectId, mode)` 仍可选择对象 payload 对应的 object node。默认内部 dispatch：

```ts
{ type: "select-node", nodeId }
```

`mode` 也可使用 `toggle`、`add`、`remove`、`clear`、`all`，对应 `select-nodes` 命令。Snapshot 中 `selection.nodeId` 是 primary selection，`selection.nodeIds` 是有序多选集合。`selection.objectId/objectIds` 是当前兼容镜像，只包含选中 object node 的 object payload ID。Inspector 根据 selected node kind 显示 transform、material 或 light section 的可用状态，同时暴露 selection count 给 workbench。

Raycaster picking 能从 client point 解析候选 node；React/Vue workbench 默认开启 viewport pointer selection，示例中也可以从层级面板按钮触发同一套 selection command。框选和 lasso selection 仍未实现。

## 高级节点操作

Core 已提供 framework-neutral operation helper：

- `editor.operations.copy()`
- `editor.operations.paste()`
- `editor.operations.duplicate()`
- `editor.operations.delete()`
- `editor.operations.group()`
- `editor.operations.ungroup()`
- `editor.operations.selectAll()`
- `editor.operations.clearSelection()`

这些操作都通过 core command 和 history 执行。默认无参数调用作用于当前 node selection；显式传入 object IDs 时，`copy`、`duplicate`、`delete`、`group`、`ungroup` 仍走 object-only 兼容语义。

复制 payload 是 transient JSON editor data，不包含 browser/system clipboard 数据、`File`、`Blob`、object URL、Three.js 对象、resolver 结果或二进制资产 payload。v2 node clipboard 可以复制 group/object/light 子树，粘贴时生成新的 node/object/light IDs，共享 asset reference，并隔离复制对象的 material assignment。旧 v1 object clipboard payload 仍可粘贴到 v4 editor。

分组是 node-native hierarchy grouping：`group-nodes` 会创建 empty group node，把 selected top-level nodes 挂到新 group 下；`ungroup-nodes` 把 group children 移回上一层。React/Vue proof-loop demo 现在提供一个紧凑层级面板，直接从 `snapshot.rootNodeIds` 和 `snapshot.nodes` 派生树形结构，并通过 core operations 执行 select/copy/paste/duplicate/delete/group/ungroup。

## Transform 编辑

Transform 持久化字段：

- `position`
- `rotation`
- `scale`

命令示例：

```ts
editor.dispatch({
  type: "set-node-transform",
  nodeId: "box-node",
  transform: {
    position: [1, 0, 0]
  }
});
```

旧 object-only host code 仍可使用兼容命令：

```ts
editor.dispatch({
  type: "set-transform",
  objectId: "box",
  transform: { position: [1, 0, 0] }
});
```

Runtime 内部有 transaction 结构：

- `start(nodeId, mode, { nodeIds, snap })`
- `preview(transform)`
- `commit()`
- `cancel()`

`mode` 支持：

- `translate`
- `rotate`
- `scale`

设计目标是一段拖拽最终只产生一个 undoable command，而不是每次 pointer move 都写 history。当前 canonical transform command 是 `set-node-transform`；旧 `set-transform` 会映射到对应 object node。Object node、group node、directional/point/spot light node 支持 transform；ambient/hemisphere light node 可以被选择但不显示 transform 控件。React/Vue workbench 默认开启可视 transform control；proof-loop demo 的 toolbar 也提供 mode、snap、camera、undo/redo 和 nudge 按钮，用于验证同一套状态是否在层级、status 和 checklist 中同步。TransformControls、helper、drag preview 和 camera controls 都是 runtime/UI state，不进入 Snapshot。

多节点 transaction 会把多个 `set-node-transform` 子命令合成一个 `batch` command。`snap` 支持 translation、rotation、scale increment helper；吸附结果进入 durable transform，吸附设置本身仍是 editor/session state。

## Inspector 编辑

React/Vue inspector 当前覆盖：

- Transform
- Material override
- Environment/background
- Light list/add/update/remove
- Problems

Inspector 的字段模型和 command builder 来自 core，因此两个框架 shell 的编辑语义一致。

## 环境与背景

可编辑 authoring intent 包括：

- environment mode：`none` / `solid` / `texture` / `hdr`
- background mode：`none` / `solid` / `texture` / `hdr`
- background color
- asset ID
- intensity
- blur
- rotation

Runtime 会尝试解析 texture/HDR 资产。解析失败只产生 runtime problem，不删除 Snapshot 字段。

## 灯光

支持灯光类型：

- ambient
- directional
- hemisphere
- point
- spot

灯光通过 core command 管理：

```ts
editor.dispatch({
  type: "add-light",
  light: { id: "fill", kind: "ambient", intensity: 0.6 }
});
```

每个 light payload 都有对应 light node。选择 light list 中的灯光会选择对应 light node，而不是把当前灯光目标保存在框架本地状态里。`activeLightId` 仍作为 React/Vue context 的兼容字段暴露，但它从 inspector/node selection 派生。

## 材质

当前材质能力是 authoring state 和 inspector command 层面的基础能力：

- 保存 selected object 的 `MeshStandardMaterial` override 子集。
- 保存 texture slot 的 asset ID。
- Runtime 会把 object-level assignment 投影到 GLB 对象下的 `MeshStandardMaterial` mesh，并隔离 shared source material。
- Texture slot 会通过 resolver/loader 加载为 transient texture；失败暴露为 runtime problem，不写回 Snapshot。
- 保持 React/Vue inspector 行为一致。

完整子网格发现、per-submesh 材质 assignment、复杂材质编辑、节点材质和 shader 编辑不在当前范围内。

## 项目导入/导出

Workbench context 暴露：

- `exportProject(options)`
- `importProject(packageBytes, options)`
- `replaceAsset(input)`

这些 API 处理 `.ek3d` 项目包和缺失资产恢复。二进制 payload 不进入 Snapshot。

## 本地 demo checklist

React 和 Vue proof-loop demo 的侧栏包含：

- Scene hierarchy：显示 object/group/light node 名称、payload 辅助信息、selected/primary 标记和 problem badge。
- Node operations：默认 toolbar 通过 core operations 触发 select all、copy、paste、duplicate、delete、group、ungroup。
- Asset workspace：默认左栏支持多文件本地导入、raster image/texture intent、搜索、kind/status filter、sort、reference summary、payload/package status、GLB import diagnostics 和 stable-ID missing payload replacement。
- Proof checklist：从当前 selection、material assignment、history、transform mode、snap、runtime problems 和本次 demo session 派生验证进度。

Checklist 和 asset import queue 都不是 durable project state。导出 `.ek3d`、导入 `.ek3d` 或序列化 Scene Snapshot 时，不会保存 checklist 进度、camera/control 状态、runtime problems、drag hover、file input value、queue row、`File`、`Blob`、object URL 或 resolver 结果。

## 快捷键

Core 提供 `resolveEditorShortcut()` 和 `executeEditorAction()`。React/Vue workbench 在根元素安装 keydown handler，并忽略 `input`、`textarea`、`select`、`contenteditable` 和 `role="textbox"` 目标。

默认动作包括 undo/redo、copy/paste、duplicate、delete、group/ungroup、select all、clear selection、transform mode intent 和 snap toggle intent。Transform mode/snap toggle 是 action intent，视觉 gizmo 和持久化快捷键配置仍属后续工作。

## 当前未实现的常见编辑器交互

以下能力不要在文档或产品承诺中描述为已完成：

- 框选。
- 系统剪贴板集成和外部 paste 格式。
- 网格渲染、对齐辅助线和可视 snap 控件。
- 持久化快捷键配置和命令面板 UI。
- 持久化布局。
- 完整资产库、模型市场和外部 paste/import 队列。
- 数据绑定和运行态 dashboard。
- Agent 编辑。

这些都可以作为后续规划，但不属于当前 `0.x` contract 的已交付能力。
