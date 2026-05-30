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

## 对象选择

Core runtime 提供 `pickObject(objectId)`，内部 dispatch：

```ts
{ type: "select-object", objectId }
```

Raycaster picking 能从 client point 解析候选对象，但当前公开 viewport 组件还没有提供完整鼠标点击选择 UI。示例中主要通过命令或 runtime API 触发选择。

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

- `start(objectId, mode)`
- `preview(transform)`
- `commit()`
- `cancel()`

`mode` 支持：

- `translate`
- `rotate`
- `scale`

设计目标是一段拖拽最终只产生一个 undoable command，而不是每次 pointer move 都写 history。

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

## 当前未实现的常见编辑器交互

以下能力不要在文档或产品承诺中描述为已完成：

- 鼠标点击选择的完整 viewport UI。
- OrbitControls / pan / zoom toolbar。
- TransformControls 可视 gizmo。
- 多选。
- 框选。
- 层级面板。
- 删除、复制、粘贴、组合。
- 网格吸附和对齐辅助线。
- 快捷键系统。
- 持久化布局。
- 数据绑定和运行态 dashboard。
- Agent 编辑。

这些都可以作为后续规划，但不属于当前 `0.x` contract 的已交付能力。
