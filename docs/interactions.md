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
4. 通过 Material inspector 修改支持的 object-level 或 material-slot-level `MeshStandardMaterial` 字段，并确认 runtime 投影更新。
5. 通过 Node operations 执行 duplicate、copy/paste、delete、group、ungroup 等 hierarchy 操作。
6. 导出并重新导入 `.ek3d` 项目包。
7. 观察 recoverable missing-asset problem，然后用 stable asset ID 替换资产并清除 problem。

`pnpm test:browser` 使用 headless Chromium 跑 browser-level evidence：runtime picking、TransformControls smoke、React/Vue demo checklist parity、hierarchy/status/problem badge 断言，以及 canvas 非空渲染 smoke。测试避免像素级 WebGL 比对，优先验证用户可观察且稳定的状态。

## 节点选择与多选

当前 durable selection 使用 `NodeId`。GLB object、empty group、light 和 imported GLB target 都可以成为选中目标；object-only API 仍保留为兼容路径，并从 node selection 派生 selected object IDs。

Core runtime 提供 node-aware picking；命中普通 GLB object 时会选择所属 object node，命中已展开并成功解析的 GLB internal mesh/primitive 时会选择最具体的 imported target node，命中 light runtime target 时会选择对应 light node。没有 expanded imported target 或 target 无法匹配时，GLB child hit 会回退到 owner object node。兼容 API `pickObject(objectId, mode)` 仍可选择对象 payload 对应的 object node。默认内部 dispatch：

```ts
{ type: "select-node", nodeId }
```

`mode` 也可使用 `toggle`、`add`、`remove`、`clear`、`all`，对应 `select-nodes` 命令。Snapshot 中 `selection.nodeId` 是 primary selection，`selection.nodeIds` 是有序多选集合。`selection.objectId/objectIds` 是当前兼容镜像，只包含选中 object node 的 object payload ID。选中 imported GLB target 时，`objectId/objectIds` 不会被 owner object 自动填充；这避免 object-only host code 把 GLB internal target 误当作整对象操作。Inspector 根据 selected node kind 显示 transform、material 或 light section 的可用状态，同时暴露 selection count 给 workbench。

Raycaster picking 能从 client point 解析候选 node；React/Vue workbench 默认开启 viewport pointer selection，示例中也可以从层级面板按钮触发同一套 selection command。

默认 Workbench 也开启 viewport marquee selection。用户按住主按钮拖出矩形后，runtime 会从 `ThreeObjectMap` 的 pickable target entries 计算可见候选，而不是遍历 raw Three.js scene；因此 imported GLB target specificity、light/group target、helper 排除和 owner fallback 都与 pointer picking 保持一致。完成拖拽时仍派发 `select-nodes`：默认 replace，shift add，ctrl/meta toggle，alt remove。拖拽过程中的矩形 overlay、candidate preview、pointer capture、camera/hover suppression 和 DOM event 都是 runtime/session state，不写入 Snapshot。

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

复制 payload 是 transient JSON editor data，不包含 browser/system clipboard 数据、`File`、`Blob`、object URL、Three.js 对象、resolver 结果或二进制资产 payload。v2 node clipboard 可以复制 group/object/light/imported 子树，粘贴时生成新的 node/object/light IDs，共享 asset reference，并隔离复制对象的 material assignment。旧 v1 object clipboard payload 仍可粘贴到 current editor。

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

设计目标是一段拖拽最终只产生一个 undoable command，而不是每次 pointer move 都写 history。当前 canonical transform command 是 `set-node-transform`；旧 `set-transform` 会映射到对应 object node。Object node、group node、imported GLB target node、directional/point/spot light node 支持 transform；ambient/hemisphere light node 可以被选择但不显示 transform 控件。Imported GLB target transform 是 authored override，只保存在 imported node 上，不会同步到 `objects` payload。React/Vue workbench 默认开启可视 transform control；proof-loop demo 的 toolbar 也提供 mode、snap、camera、undo/redo 和 nudge 按钮，用于验证同一套状态是否在层级、status 和 checklist 中同步。TransformControls、helper、drag preview 和 camera controls 都是 runtime/UI state，不进入 Snapshot。

Imported target TransformControls 只会附着到 runtime map 标记为可独立 transform 的 target。多个 imported nodes alias 同一个 loaded `Object3D`、primitive 只能映射到 mesh object、或 target 缺失时，runtime 会保持选择/问题可见，但不会提交含混的 transform mutation。移除 imported node 的 authored transform 后，runtime 会恢复 loaded GLB 的 base local transform。

多节点 transaction 会把多个 `set-node-transform` 子命令合成一个 `batch` command。`snap` 支持 translation、rotation、scale increment helper；吸附结果进入 durable transform，吸附设置本身仍是 editor/session state。

## Runtime viewport helpers

默认 React/Vue Workbench 现在开启一组 runtime-only viewport helper：

- grid：地面参考网格。
- floor：可选半透明地面面片。
- axes：局部空间方向参考。
- bounds：selected 和 primary selected target 的边界框。
- hover：pointer hover 命中 target 时的 transient 边界反馈。
- guide：TransformControls drag 期间的 snap feedback 参考线/状态。

这些 helper 都由 core runtime/session 管理。Grid、floor、axes、hover 和 guide 会被标记为 `runtimeOnly`，不会进入 `ThreeObjectMap.targetEntries()`，因此不会成为 picking/marquee selection target。Bounds 继续使用 runtime target map；选择 imported GLB target 时，边界框包围 matched imported target object，而不是 owner GLB object。

Helper visibility、hover target、snap feedback status、guide geometry、marquee overlay/drag rectangle/candidate IDs、Three.js helper object 和 TransformControls helper 都不属于 durable scene authoring state。它们不会进入 `SceneSnapshot`、history command、`editor.serialize()` 或 `.ek3d` `scene.json`。React/Vue toolbar 和 viewport overlay 只通过 core session API 渲染/切换这些 transient 状态，不拥有 selection、transform 或 snap 语义。

Snap feedback 从同一 transform transaction 和 `snapTransform()` 路径派生。Status bar 可以显示当前 mode/increment 和 snapped 状态；最终持久化的仍只有 commit 后的 transform 值。

## Inspector 编辑

React/Vue inspector 当前覆盖：

- Transform
- Material broad object override 和 imported material-slot target override
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
- Imported GLB target schema 可以保存 manifest-derived material slot key 和 descriptor；slot assignment 使用 `{ kind: "material-slot", objectId, slotId }`，其中 `slotId` 是 imported slot key。
- `set-material` 新建 material-slot assignment 时会校验 owner object 和当前 imported slot metadata；reimport 后已经存在的 stale slot assignment 仍可继续 patch 或清理。
- Runtime slot projection 会先应用 object-level broad assignment，再让 slot-level assignment 覆盖对应 primitive mesh 或 material array index。其他 slot 保持源材质或 broad projection。
- Schema validation 不会因为 reimport 后 slot 暂时无法解析而删除 material-slot assignment；这类情况应作为 recoverable problem 暴露。
- React/Vue 默认 Material inspector 从 core `MaterialInspectorSection.targets` 渲染 broad object target 和 slot target。选择 owner object 时 broad target 在前、随后显示该 object 下的 slots；选择 imported primitive target 时默认激活该 target 的第一个可编辑 slot，同时保留 broad target 作为显式选项。
- 未解析 slot 若已有 durable assignment，会显示 unresolved 状态并保留当前 override 值；没有 assignment 的 unresolved slot 只作为 disabled target 解释问题，不能创建新 assignment。
- Active material target、字段 draft 和 controlled validation warning 是框架本地 UI state，不写入 Snapshot 或 `.ek3d`。
- Texture slot 会通过 resolver/loader 加载为 transient texture；失败暴露为 runtime problem，不写回 Snapshot。
- 保持 React/Vue inspector 行为一致。

复杂材质编辑、节点材质、shader 编辑、glTF material variant authoring、slot thumbnail/source material preview 和手动 remap UI 不在当前范围内。

## 项目导入/导出

Workbench context 暴露：

- `exportProject(options)`
- `importProject(packageBytes, options)`
- `replaceAsset(input)`
- `reimportGlbAsset(options)`

这些 API 处理 `.ek3d` 项目包、缺失资产恢复和 GLB reimport。二进制 payload 不进入 Snapshot。

GLB reimport 使用稳定 asset ID 替换 transient payload，并在提交前分析 replacement GLB。`commit: false` 返回 remap preview，不改变 Snapshot 或 payload；提交成功后 `reimport-glb` 会保留可匹配 imported target 的 node ID、transform 和 material slot assignment，新增 replacement target 会成为新的 imported node，无法唯一匹配的旧 target/slot 会保留 durable authoring state 并暴露可恢复 problem。

## 本地 demo checklist

React 和 Vue proof-loop demo 的侧栏包含：

- Scene hierarchy：显示 object/group/light node 名称、payload 辅助信息、selected/primary 标记和 problem badge。
- Node operations：默认 toolbar 通过 core operations 触发 select all、copy、paste、duplicate、delete、group、ungroup。
- Asset workspace：默认左栏支持多文件本地导入、raster image/texture intent、搜索、kind/status filter、sort、reference summary、payload/package status、GLB import diagnostics、stable-ID missing payload replacement 和 registered GLB reimport。
- Proof checklist：从当前 selection、material assignment、history、transform mode、snap、runtime problems 和本次 demo session 派生验证进度。

Checklist 和 asset import queue 都不是 durable project state。导出 `.ek3d`、导入 `.ek3d` 或序列化 Scene Snapshot 时，不会保存 checklist 进度、camera/control 状态、runtime problems、drag hover、file input value、queue row、`File`、`Blob`、object URL 或 resolver 结果。

## 快捷键

Core 提供 `resolveEditorShortcut()` 和 `executeEditorAction()`。React/Vue workbench 在根元素安装 keydown handler，并忽略 `input`、`textarea`、`select`、`contenteditable` 和 `role="textbox"` 目标。

默认动作包括 undo/redo、copy/paste、duplicate、delete、group/ungroup、select all、clear selection、transform mode intent 和 snap toggle intent。Transform mode/snap toggle 是 action intent，视觉 gizmo 和持久化快捷键配置仍属后续工作。

## 当前未实现的常见编辑器交互

以下能力不要在文档或产品承诺中描述为已完成：

- durable imported target row 之外的 Workbench hierarchy UI polish。
- 系统剪贴板集成和外部 paste 格式。
- lasso、paint selection、crossing/window selection mode、selection filter 和高级选择 gizmo。
- 推断对象边/中心关系的对齐辅助线。
- CAD 式测量、标尺和单位系统。
- 持久化快捷键配置和命令面板 UI。
- 持久化布局。
- 完整资产库、模型市场和外部 paste/import 队列。
- 数据绑定和运行态 dashboard。
- Agent 编辑。

这些都可以作为后续规划，但不属于当前 `0.x` contract 的已交付能力。
