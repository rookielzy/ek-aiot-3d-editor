# 3D 场景节点动效配置调研

调研日期为 2026-11-24。范围包括对象级动效、事件触发和关键帧编辑。首版方向属于设计建议。

## 竞品做法

| 产品 | 官方文档记录的交互 | 适合参考的场景 |
| --- | --- | --- |
| Twinmotion | 对象关联 Translator 或 Rotator，选中 Animator 后在 Properties 面板设置位移或角度、时长、缓动，以及单次、循环或往返播放。Animator 支持预览，也可加入 Sequence。 [Animator Tools](https://dev.epicgames.com/documentation/twinmotion/animator-tools-in-twinmotion) · [参数说明](https://dev.epicgames.com/documentation/twinmotion/twinmotion-animator-tools-reference) | 滑台往返、转门开合等能用少量参数表达的机械动作。 |
| 阿里云 DataV | 模型查看器提供绕轴旋转开关，可选轴、转向和转速。模型内置动画另有片段选择和预览。 [模型查看器](https://www.alibabacloud.com/help/zh/datav/datav-7-0/user-guide/model-viewer) | 模型持续自转、展示内置动画。 |
| Spline | 建立对象状态，给事件配置 Transition，指定目标、状态和时长或缓动。也提供独立的底部时间轴与曲线编辑，可由事件触发播放。 [Transition](https://docs.spline.design/interaction-states-events-and-actions/actions/transition-action) · [时间轴](https://docs.spline.design/designing-in-3-d/animation/timeline-animation) | 点击后从关闭切到打开、多个状态顺序切换。 |
| Blender | Timeline 支持播放、跳帧、编辑关键帧，打开自动关键帧后，变换属性的修改会在当前帧记录。 [Blender 4.5 LTS Timeline](https://docs.blender.org/manual/en/4.5/editors/timeline.html) | 多对象按时序配合、需要逐段精调的演示。 |

这些产品对应三种作者工作流。重复动作提供类型和参数。交互或有明确终点的动作提供状态与触发。多个动作需要对齐时提供关键帧和时间轴。对本项目来说，Twinmotion 的参数设计和 DataV 的轻量面板最接近首版需求。

## 在本仓库的落地方向

首版建议做节点级的参数化动效，先用「持续自转」和「往返移动」验证闭环。这里假设目标是快速给设备模型添加可视化表现，例如让风扇转起来或展示滑台行程。如果第一批需求是用设备数据还原实际姿态，优先设计从字段值到角度或位置的映射。

### 右侧面板

在现有「对象」组内加「动效」子页签，与「变换」「材质」同级。用户从画布或层级树选中单个节点，面板直接显示该节点的动效。空白状态给出「添加动效」，选完类型即出现可编辑的参数和「预览」「停止」按钮。首版建议一个节点配置一项，先覆盖模型节点与可变换且可解析的 GLB 子节点，风扇叶片应能单独动起来。节点没有合适的旋转轴心时，先用导入资产中已有轴心正确的子节点验证用例。 [React 对象 Inspector](../../packages/react/src/components/InspectorView.tsx) · [Vue 对象 Inspector](../../packages/vue/src/components/InspectorView.vue) · [GLB 子节点目标](../schema.md#imported-glb-targets)

| 类型 | 默认可编辑参数 | 示例 |
| --- | --- | --- |
| 持续自转 | 节点局部 X/Y/Z 轴、带方向的转速（度/秒），匀速 | 风扇子节点绕局部 Y 轴以 90°/秒旋转，每 4 秒一圈 |
| 往返移动 | 父级 X/Y/Z 轴、带方向的位移（场景单位）、单程时长、线性或缓入缓出 | 滑台沿父级 X 轴移动 +1 场景单位，单程 2 秒，4 秒完成一次往返 |

旋转围绕节点自身的轴心，移动相对于编辑态位置。预览从基础姿态开始，画布可用轴向或起止提示帮助用户判断方向。停止、切换目标或开始拖拽变换控件时恢复基础姿态。配置保存后仍可撤销、重做，重新打开项目能再次从基础姿态预览。

### 配置与播放

- 用稳定的 `NodeId` 关联配置。由 Core 统一提供适用性检查和编辑命令，React/Vue 渲染同一份 Inspector 语义。配置进入 Snapshot，播放进度、当前帧姿态和临时轴向提示留在运行态。 [选择和节点标识](../schema.md#selection) · [Inspector 架构](../architecture.md#inspector-架构)
- 让 runtime 基于节点的基础变换计算播放姿态。预览每帧推进时使用现有帧调度入口，结束后恢复按需绘制。GLB 子节点没有变换覆盖时，基础姿态来自场景投影解析出的原始局部变换。 [Snapshot 与 runtime 的关系](../architecture.md#snapshot-与-runtime-的关系) · [运行时绘制入口](../../packages/core/src/runtime/editor-runtime.ts)
- 编辑态首版从「预览」显式开始。展示端如果需要自动播放，由宿主进入展示时触发。出现「点击开门」时，可增加一次性定角旋转与点击触发。出现「转速由设备读数决定」时，设备状态可以控制启动与速度；出现「阀门开度 42%」时，则直接把读数映射到确定的角度，并按需做过渡。多个对象需要精确同步时，再引入时间轴。

### 首版验收示例

导入一个叶片可单选的风扇 GLB，选中叶片配置局部轴自转。预览时叶片转动，外壳留在基础位置。停止后叶片恢复，撤销可移除配置，重做并保存后可重新加载和预览。再用往返滑台验证父级坐标、单程时长和停止复位。
