# React 环境、灯光与相机编辑

任务：`.scratch/desktop-workbench-refresh/issues/06-react-scene-inspector.md`；父规格：`.scratch/desktop-workbench-refresh/spec.md`；前置任务 05 已完成，实现前基线为 `087a38d2e2fe4cb8b532bd748febe68cf4b1cbfd`。

## 交付

环境照明与背景独立折叠，保留全部 Core 来源、资源、强度、旋转、模糊、六面 cubemap、预设和诊断。灯光保留五种类型的添加、选择、编辑、删除、预设及辅助入口，阴影字段可折叠。相机保留 capture/apply/update/edit/delete/default。

内部 SceneInspectorFields 统一渲染现有 Core descriptor，数值复用 InspectorNumberInput：Enter/失焦提交、保持焦点、成功后不重复提交、空值按非法数值处理。错误关联使用实例独立 ID；目标变化清理旧错误与数值草稿。XYZ 同行，环境旋转明确标记原有弧度单位。

Inspector 相机列表选择同步到真实节点，解决选中 A 后点击 B 仍编辑 A 的问题。同步限于 Inspector；公开 hook 和工具栏 capture 保留原有选择行为。所选灯光/相机不再重复显示位置表单。场景与属性入口读取同一 snapshot，UI/session 状态不写入快照。

未修改 Core/schema/public API；Vue 仅同步字典 parity 所需文案。

## 验证边界

采用父规格已确认的 Inspector/Workbench DOM 与真实宿主浏览器边界。TDD 依次复现环境/灯光 Enter 未提交，以及相机列表无法切换已选相机。

DOM 覆盖焦点、单次撤销、空输入、跨组一致性、错误清理、五类灯光、cubemap 预设/六面资源、独立 flat-image 背景及 blur 诊断、相机全部管理动作。浏览器通过默认 Export/Open 完成项目包往返，比较环境、灯光、阴影、相机和 presentation，并核验恢复后 runtime 的投影、位置与目标等价。

三个桌面尺寸检查字段边界、XYZ 同行及页面无横溢出；1100×800 检查右栏内部滚动；折叠支持鼠标与键盘。Context7 缺少 API key，使用 [React 官方状态生命周期文档](https://react.dev/learn/preserving-and-resetting-state) 核对草稿重置行为。

## 视觉证据

对照原型 a9ebc22 的 reference 核验白色连续面板、蓝色页签/选择、浅灰字段、向量行、诊断与滚动。截图使用空宿主与测试创建的真实灯光/相机；黑色背景来自测试选择 solid 时的默认颜色。本切片不交付示例模型或隐藏照明，不作为后续示例展示场景的视觉验收。

- [环境 1440×900](screenshots/react-scene/environment-1440.png)
- [环境 1920×1080](screenshots/react-scene/environment-1920.png)
- [环境 1100×800](screenshots/react-scene/environment-1100.png)
- [灯光与阴影 1100×800](screenshots/react-scene/light-1100.png)
- [场景管理 1100×800](screenshots/react-scene/scene-1100.png)
- [相机 1920×1080](screenshots/react-scene/camera-1920.png)

初轮截图受 Vue/demo 全局样式影响，沿用前一切片的样式隔离方式后重新生成。临时截图调用已移除，布局断言保留。

## Standards

独立规范审查未发现硬性违规。提出一项维护性建议：布局按字段 ID 的向量/分组前缀推断，未来扩展会增加调用方与 renderer 的协调成本。本次接受这一有限权衡：字段 ID 来自已有 Core contract，父规格要求不为 UI 改版引入 Core 抽象，因此不新增 descriptor 布局元数据。

## Spec

独立规格审查发现一项真实问题：环境资源下拉的“无”原先静默忽略。已补先失败的 DOM 回归，并将 Lighting asset / Background asset 的空选项分别映射为该来源的 none 命令；两者可独立清除并撤销。cubemap 面资源必须有效，空选项仅作为禁用占位，继续使用来源选择器切换或清除整体来源。

规范轴：0 项硬性问题、1 项接受的维护建议；规格轴：1 项发现，已修正并由主代理验证。审查不代替实际测试和视觉核验。
