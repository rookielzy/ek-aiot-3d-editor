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
9. React/Vue 本地 proof-loop demo 中通过层级面板、资产/问题面板和 proof checklist 验证这些状态。

## 对象选择与多选

Core runtime 提供 `pickObject(objectId, mode)`，默认内部 dispatch：

```ts
{ type: "select-object", objectId }
```

`mode` 也可使用 `toggle`、`add`、`remove`、`clear`、`all`，对应 `select-objects` 命令。Snapshot 中 `selection.objectId` 是 primary selection，`selection.objectIds` 是有序多选集合。Inspector 继续编辑 primary object，同时暴露 selection count 给 workbench。

Raycaster picking 能从 client point 解析候选对象；React/Vue workbench 默认开启 viewport pointer selection，示例中也可以从层级面板按钮触发同一套 selection command。框选和 lasso selection 仍未实现。

## 高级对象操作

Core 已提供 framework-neutral operation helper：

- `editor.operations.copy()`
- `editor.operations.paste()`
- `editor.operations.duplicate()`
- `editor.operations.delete()`
- `editor.operations.group()`
- `editor.operations.ungroup()`
- `editor.operations.selectAll()`
- `editor.operations.clearSelection()`

这些操作都通过 core command 和 history 执行。复制 payload 是 transient JSON editor data，不包含 browser/system clipboard 数据、`File`、`Blob`、object URL、Three.js 对象、resolver 结果或二进制资产 payload。粘贴/复制会生成新对象 ID，共享 asset reference，并隔离复制对象的 material assignment。

分组是第一版 hierarchy grouping：以 primary selected object 作为 group root，把其他 selected top-level roots 挂到其下；取消分组把 primary object 的 children 移回上一层。React/Vue proof-loop demo 现在提供一个紧凑层级面板，直接从 `snapshot.rootObjectIds` 和 `snapshot.objects` 派生树形结构，并通过 core operations 执行 select/copy/paste/duplicate/delete/group/ungroup。当前没有新增 empty group node 类型。

## Transform 编辑

Transform 持久化字段：

- `position`
- `rotation`
- `scale`

命令示例：

```ts
editor.dispatch({
  type: "set-transform",
  objectId: "box",
  transform: {
    position: [1, 0, 0]
  }
});
```

Runtime 内部有 transaction 结构：

- `start(objectId, mode, { objectIds, snap })`
- `preview(transform)`
- `commit()`
- `cancel()`

`mode` 支持：

- `translate`
- `rotate`
- `scale`

设计目标是一段拖拽最终只产生一个 undoable command，而不是每次 pointer move 都写 history。React/Vue workbench 默认开启可视 transform control；proof-loop demo 的 toolbar 也提供 mode、snap、camera、undo/redo 和 nudge 按钮，用于验证同一套状态是否在层级、status 和 checklist 中同步。

多对象 transaction 会把多个 `set-transform` 子命令合成一个 `batch` command。`snap` 支持 translation、rotation、scale increment helper；吸附结果进入 durable transform，吸附设置本身仍是 editor/session state。

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

当前没有 durable light selection；workbench 内部使用 UI-local `activeLightId` 控制当前编辑的灯光面板。

## 材质

当前材质能力是 authoring state 和 inspector command 层面的基础能力：

- 保存 selected object 的 `MeshStandardMaterial` override 子集。
- 保存 texture slot 的 asset ID。
- 保持 React/Vue inspector 行为一致。

完整子网格发现、复杂材质编辑、节点材质、shader 编辑和完善的材质纹理 runtime 投影不在当前范围内。

## 项目导入/导出

Workbench context 暴露：

- `exportProject(options)`
- `importProject(packageBytes, options)`
- `replaceAsset(input)`

这些 API 处理 `.ek3d` 项目包和缺失资产恢复。二进制 payload 不进入 Snapshot。

## 本地 demo checklist

React 和 Vue proof-loop demo 的侧栏包含：

- Scene hierarchy：显示对象名称、asset ID、selected/primary 标记和 problem badge。
- Object operations：通过 core operations 触发 select all、copy、paste、duplicate、delete、group、ungroup。
- Assets and problems：列出 snapshot asset references，并提供一个 demo 级缺失 GLB 资产替换按钮。
- Proof checklist：从当前 selection、history、transform mode、snap、runtime problems 和本次 demo session 派生验证进度。

Checklist 不是 durable project state。导出 `.ek3d`、导入 `.ek3d` 或序列化 Scene Snapshot 时，不会保存 checklist 进度、camera/control 状态、runtime problems、`File`、`Blob`、object URL 或 resolver 结果。

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
