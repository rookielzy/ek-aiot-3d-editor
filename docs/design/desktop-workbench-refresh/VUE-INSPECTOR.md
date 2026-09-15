# Vue 对象、材质、环境与场景属性

任务：`.scratch/desktop-workbench-refresh/issues/13-vue-inspector.md`。前置任务 11 已完成；用户确认审查基点为 `c6f0bba`。实现提交 `80cccef`，审查修正提交 `c1d19d8`。视觉依据为原型 `a9ebc22` reference，以及正式 React 任务 05/06 的交付基线。

## 交付

- Properties / Environment / Scene 三组具备 tab/tabpanel 关联、方向键与 Home/End 导航及稳定焦点。空选择仍可编辑环境、灯光与相机；页签状态只留在 Vue 内存中。对象组按选择展示变换/材质或灯光/相机，场景组管理相同 Core 数据。
- 变换按 XYZ 并排，旋转展示度、提交弧度。材质数值复用已有数字草稿控件，Enter/失焦成功提交一次并保留焦点，空值显示非法数值；失败草稿仍可重试。字段、纹理槽、unresolved 诊断和旧覆盖编辑能力保留。
- material-slot 手动选择在分组往返及语言切换时保持；选 imported primitive 自动定位材质槽，返回 owner 恢复对象覆盖；切目标清除旧草稿及错误。radio 名称和错误关联使用实例独立 ID。
- 新增内部 SceneInspectorFields，消费既有 Core descriptor，统一数值、颜色、选择、资源、布尔、文本、disabled 和问题反馈。照明/背景独立折叠，保留来源、预设、cubemap 六面与诊断；资源“无”分别清除对应来源。灯光五种类型、预设、阴影折叠与所有字段保留。
- 相机 capture/apply/update/edit/delete/default 保留，列表选中另一相机时同步真实节点。属性/场景入口读取同一 snapshot；相机失败和材质 dispatch 失败使用可重新翻译的消息，保留原始错误 detail。
- 深层表单采用 React 的连续白色面板、细分隔、蓝色激活页签和浅灰字段；材质、灯光和相机列表独立滚动。Vue workbench 通用按钮规则不再覆盖 Inspector 控件样式。

未增加 Core、schema 或 public API。Vue scoped slots、事件与受控 locale 用法保持；React 仅复用跨框架浏览器用例并同步字典 parity。项目菜单和资源工作区的后续迁移仍归任务 14/15。

## 验证边界与 TDD

采用父规格已确认的 Inspector/Workbench DOM、package-root 类型和真实宿主浏览器边界。

先红后绿依次复现：缺少分组；环境 Enter 提交失焦；灯光 Enter 提交失焦；材质输入失焦；宿主拒绝材质编辑没有错误且草稿被视为成功；相机拒绝编辑后中文界面只有英文 detail。随后补齐目标切换、空值、撤销/重做、cubemap、所有灯型和相机管理行为覆盖。

旧测试改用向量输入的可访问名称，场景操作先进入相应页签。未删除原有结果断言或跳过用例。新增拒绝测试只在宿主传入的 Editor command 边界注入一次失败，随后由真实 Core 接受相同草稿，验证可重试性。

真实浏览器用例在既有 proof-loop-demo 边界参数化 React/Vue 挂载，复用同一组实际 GLB、PNG 和默认 Export/Open 操作。覆盖变换、材质槽、纹理、选择、环境、灯光、阴影和默认相机的完整项目包往返，并检查恢复后的 runtime 对象和相机投影/位置/目标。两框架切至中文编辑并撤销，确认材质目标、snapshot、history、canvas 与 runtime 连续。

Context7 缺少 API key，使用 [Vue conditional rendering](https://vuejs.org/guide/essentials/conditional.html) 核对保留表单实例与条件渲染的边界，使用 [Vue useId](https://vuejs.org/api/composition-api-helpers.html#useid) 核对实例内稳定 ID。布局按用户批准的桌面基线实施，未引入手机功能。

## 视觉证据

已检查截图并与原型 reference 对照右栏主区域、颜色、密度、XYZ 行、长目标换行、深层字段及滚动。1440×900、1920×1080、1100×800 均检查字段边界与页面横向溢出；1100 检查内部滚动，折叠支持鼠标及键盘。

| 场景 | 1100×800 | 1440×900 | 1920×1080 |
| --- | --- | --- | --- |
| 对象/材质 | [截图](screenshots/vue-inspector/object-1100.png) | [截图](screenshots/vue-inspector/object-1440.png) | [截图](screenshots/vue-inspector/object-1920.png) |
| 环境 | [截图](screenshots/vue-inspector/environment-1100.png) | [截图](screenshots/vue-inspector/environment-1440.png) | [截图](screenshots/vue-inspector/environment-1920.png) |
| 场景/相机 | [截图](screenshots/vue-inspector/scene-1100.png) | [截图](screenshots/vue-inspector/scene-1440.png) | [截图](screenshots/vue-inspector/scene-1920.png) |

中文深层表单：[材质与纹理](screenshots/vue-inspector/material-zh-CN.png)、[所选相机](screenshots/vue-inspector/camera-zh-CN.png)。测试对象、资源及相机名称作为 authored values 保留；黑色背景是测试显式设置 solid 后的值。测试模型的共享 imported target 和宽阴影范围会产生真实诊断；这些截图不是示例展示场景的交付验收。

截图复现：设置 `VITE_CAPTURE_INSPECTOR=1`，运行 `proof-loop-demo.browser.test.tsx` 的 `restores Vue` / `saves and restores Vue` 用例。输出在 `packages/react/test/__screenshots__/vue-inspector/`。普通测试不设置该变量。

## Standards

独立规范审查未发现硬性违规。两项判断建议：

1. LightInspector/CameraInspector 在两个 panel 重复声明 props/events，新增参数需同步。当前保留明确的两个入口，以最小改动对齐 React 行为；不引入 Teleport 或新的公共布局抽象。
2. 向量分组依赖 descriptor 的字段 ID 与 XYZ 顺序。当前接受与 React 一致的有限维护权衡；父规格要求复用已有 Core contract，因此不为 UI 分组增加 Core 元数据。

## Spec

独立规格审查提出两项错误反馈问题，均已修正：

1. MaterialInspector 原先丢弃 dispatch 结果。现在失败时显示关联错误并返回 false，数字草稿继续可重试。
2. CameraInspector 原先优先显示纯英文 dispatch.error。现在使用双语消息 descriptor 包装 detail，语言切换重新渲染；新增字典项同时同步 React/Vue。

主代理通过宿主 Workbench 的两项拒绝/翻译/重试回归确认修正。两个审查轴的发现分别保留，独立审查不代替实际测试或视觉检查。

合计：Standards 0 项硬性违规、2 项接受的维护建议；Spec 2 项发现，均已修正。

## 最终检查

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过，审查修正后再次通过 |
| `pnpm typecheck` | Core / React / Vue 通过，审查修正后再次通过 |
| Vue Inspector / groups / Workbench 定向检查 | 审查修正后 85/85 通过 |
| `pnpm run test --maxWorkers=2` | 115 文件、944/944 通过，194.19s |
| `pnpm test:browser` | 12 文件实例、96/96 通过，464.77s |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过 |

浏览器沿用本机运行库 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。最终全量没有跳过用例或提高 timeout；定向执行时由名称过滤排除的其他用例均包含在最终全量中。前一轮浏览器进程退出码为 143，未形成最终结果，因此未计为通过；最终稳定源码上的完整复跑结果如上。

保留已有 JSDOM canvas 提示、示例大于 500 kB chunk 提示，以及项目恢复期 TransformControls 场景图提示。恢复后的实际对象/相机与 snapshot 断言通过。任务 13 四项验收已完成。
