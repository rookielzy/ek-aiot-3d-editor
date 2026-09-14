# React 对象属性与材质槽

任务：`.scratch/desktop-workbench-refresh/issues/05-react-object-inspector.md`。实现前基线：`363803220791a48281d37bd94dd6f21670b845bd`。前置任务 03 已在 `95483a7` 完成，验证记录见 [REACT-HIERARCHY.md](REACT-HIERARCHY.md)。视觉依据为原型 `a9ebc22` 的 reference 布局。

## 交付范围

- Inspector 提供 Properties / Environment / Scene 三组及完整双语文案，支持左右方向键、Home、End 和稳定焦点。空选择仍可编辑环境与场景。对象组展示当前节点摘要、适用变换与材质，以及所选灯光或相机的既有编辑器；环境和场景内容沿用现有组件。分组状态只在 React 内存中。
- 位置、旋转、缩放按 XYZ 并排。旋转明确标记 °，输入和展示使用度，提交仍写 Core 的弧度。空值或非有限数不提交并展示验证原因；未编辑的数值不提交，Enter 与随后失焦不会形成重复历史。数值输入提交后保留焦点，Core 值变化和目标变化会更新草稿。
- 继续消费 Core 的 object override、material-slot、默认目标和 unresolved 契约。选 imported node 定位其对应槽，回 owner 切回对象覆盖。手动选定槽在页签往返时保留；切换节点、材质目标后不残留旧草稿或旧校验反馈。radio 分组和错误关联使用实例独立 ID。
- 材质全部既有字段与六个纹理槽继续可达；保留 no override、slot override、unresolved、禁止新建覆盖的原因，以及允许编辑的旧覆盖。数值草稿独立记录是否编辑，允许用户明确写入与占位默认值相同的覆盖。
- 白色连续面板、细分隔、蓝色页签、浅灰数值控件和行内材质字段覆盖深层表单。长材质目标列表独立滚动，各行按内容自然增高，不裁切覆盖状态。Vue 仅同步既有字典键一致性要求，未迁移 Vue UI。

没有新增 Core/schema/public API，也没有加入原型模型、模拟问题或隐藏照明。场景管理进一步重组属于任务 06。

## 验证边界

沿用父规格已确认的 Inspector/Workbench DOM、package-root 类型和真实宿主浏览器边界。

TDD 曾依次复现：没有分组页签；旋转显示原始弧度；Enter 提交替换输入节点造成失焦；明确输入默认数值没有创建覆盖。对应修正后通过。

DOM 覆盖键盘分组、空选择场景编辑、角度换算、空输入、焦点、撤销/重做、目标切换与草稿清理、unresolved 禁用和旧覆盖可编辑、六个纹理入口。现有场景测试改为先进入可见分组再操作，未跳过原有断言。

浏览器在真实 EditorWorkbench 宿主中加载 GLTFExporter 生成的双 MeshStandardMaterial GLB 和本地生成 PNG，编辑 XYZ/角度、opacity 与纹理目标，撤销/重做，选 imported primitive 再回 owner，通过默认 Export/Open 控件完成完整项目包往返，检查选择、变换、材质、纹理与 runtime object。复用现有 Three.js 依赖，无外部资产。MeshBasicMaterial 不支持的覆盖会产生正常 unresolved 诊断，因此可编辑槽验证使用受支持的标准材质。

## 视觉证据

使用相同真实浏览器宿主临时截图，截图调用不保留在自动测试中。已逐张人工检查，并与原型 reference 对照右栏比例、页签、XYZ 行、深层字段和滚动。测试 GLB 的共享 imported target 诊断是实际 Core 结果，不是模拟成功或问题状态；本切片不以测试方块替代后续示例展示场景的验收。

- [1440×900](screenshots/react-inspector/selected-1440.png)
- [1920×1080](screenshots/react-inspector/selected-1920.png)
- [1100×800](screenshots/react-inspector/selected-1100.png)
- [1100×800 深层材质与纹理](screenshots/react-inspector/material-depth-1100.png)

三个桌面尺寸验证 XYZ 同行、字段横向边界及页面无横溢出。右栏内部滚动，页签保持可达。

React 状态生命周期参考 [Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)。Context7 无 API key，已使用官方文档作为替代。

## 验证进度

已通过 `pnpm build`、`pnpm typecheck`、两个 proof-loop 示例 build；保留既有 500 kB chunk 提示。Inspector 定向 26 项通过，Workbench、字典及 package-root 定向 65 项通过。真实宿主单文件初轮 9 项通过，数值焦点修正后项目恢复用例复跑通过。

浏览器沿用本机环境变量 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。项目恢复期间有 Three.js TransformControls 临时脱离 scene graph 的日志，恢复后的 runtime object 与编辑状态断言通过；未为此改动 Core。

最终全量检查与双轴审查结果在完成后追加于本文件。
