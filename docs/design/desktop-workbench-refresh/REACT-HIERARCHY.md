# React 场景层级与选择

任务：`.scratch/desktop-workbench-refresh/issues/03-react-hierarchy.md`。实现前基线：`25dfe2e04535bd7144585e2d2e94f477294b399d`。前置任务 02 的完成证据见 [REACT-SHELL.md](REACT-SHELL.md)。

## 交付行为

- 场景树继续消费 Core Workbench hierarchy 的全部行，包括对象、分组、灯光、相机及 imported target。搜索忽略大小写及首尾空白，显示匹配行和祖先；搜索期间展开匹配路径，清空后恢复折叠偏好。空场景及无匹配结果分别显示双语提示。
- 单击替换选择；Ctrl/⌘ 点击 toggle，Shift 点击 add，Alt 点击 remove，与现有 Core 指针选择语义一致。选中态、状态摘要和 Inspector 直接来自同一 Core selection。外部选择变化时展开祖先；若筛选隐藏了新选择，则清除搜索使其可见。
- 双击先选中行，再调用现有 `frameSelected()`。普通对象及可解析 imported target 均可聚焦；共享 runtime target 的现有不可独立变换原因在选中行下显示，原有 Inspector/problems 入口继续可达。没有改变 Core 数值变换或 runtime capability contract。
- 展开按钮使用原生键盘交互、`aria-expanded` 和本地化标签；选择按钮使用 `aria-pressed`。长名称截断显示，完整名称保留在按钮内容、title 和选中摘要中。深层缩进根据整棵树深度压缩到面板宽度的 30% 内，每一层仍有独立缩进；面板不横向溢出。
- 搜索和折叠只在 React 组件内存中；没有 schema、快照、公共导出或历史模型变更。沿用既有跨框架字典键一致性要求同步 Vue 文案，但没有迁移 Vue UI。

## 验证边界与证据

沿用规格确认的 Workbench DOM 和真实宿主浏览器边界。

- TDD：搜索/折叠用例先因没有展开按钮失败，实施后通过，并验证场景快照不变；双击用例先因没有选择/聚焦行为失败，实施后通过。
- DOM 覆盖 modifier 多选/移除、清除、外部选中 imported descendant 后展开、状态与适用 Inspector 字段同步、灯光/相机行，以及切换中文后保留搜索草稿、选择与 runtime。
- 浏览器使用 GLTFExporter 生成真实二进制 GLB，由独立宿主明确提供 `ThreeGltfLoaderAdapter` 和资源 resolver；没有将占位 loader 结果当作真实加载证据。挂载默认 EditorWorkbench，在 1440×900、1920×1080、1100×800 下验证十层分组、长名称、搜索/空结果/折叠、Enter 展开与焦点、双击导致实际相机变化、imported target 原因、画布点选、原生鼠标框选及 Ctrl 多选。
- 同一浏览器用例在 1440 下双击普通 owner，原生鼠标拖动可见 X 轴，确认对象位置与 Inspector 更新，然后 Undo 恢复。继续复用既有 Core runtime 的 imported target 变换、框选优先级与事务测试，没有新建选择算法。
- 截图检查发现嵌套 grid 的默认最小宽度导致左栏横向溢出；新增断言复现 469px 内容挤入 272px 面板，修正列表项 `min-width` 后通过。进一步验证第九、十层的实际横坐标仍有差别。
- 浏览器文件同时导入 React/Vue 示例。此新增独立宿主用例临时禁用继承的 Vite 样式，再注入 React 工作台与 Inspector 样式，结束后恢复，以防 Vue 通用按钮规则污染 React 布局证据。

截图在定向浏览器运行中生成并逐张检查，与原型 `a9ebc22` reference 的白色连续面板、灰色视口和蓝色选择态比对。测试用方块不是示例默认场景；本任务不声明已完成后续工具组和 Inspector 改版。普通测试运行不重写这些截图。

- [1440×900](screenshots/react-hierarchy/selected-1440.png)
- [1920×1080](screenshots/react-hierarchy/selected-1920.png)
- [1100×800](screenshots/react-hierarchy/selected-1100.png)

React 状态设计参考 [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)。Context7 未配置 API key，本次以 React 官方文档作为替代；未增加或升级依赖。

## Standards

规范轴：没有硬性违规。提出 1 项共享字典重复的维护建议；保留现有独立字典与 parity 测试，本切片不为八条新增文案引入共享包或 Core 抽象。

## Spec

规格轴：提出 2 项。深层缩进截断已改为按最大深度均匀压缩，并新增实际坐标断言；Vue 文案属于现有字典键一致性契约的必要同步，没有提前迁移 Vue UI，因此不作为越界问题接受。

审查共 Standards 1 项建议、Spec 2 项反馈；可执行的深层层级问题已修复，没有待处理的硬性违规或本切片规格缺口。

## 命令记录

定向 Workbench、字典和既有 Core runtime 检查：4 个文件、103/103 通过。新增真实 GLB 浏览器用例在审查修正后定向通过。

浏览器命令使用本机已有环境变量 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`；没有修改仓库系统依赖配置。

最终验证（审查修正后）：

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过 |
| `pnpm test:browser` | 9 个文件实例，45/45 通过，36.55s |
| `pnpm test` | 113 个文件，888/888 通过，62.22s |

保留原有 JSDOM canvas 提示及示例大 chunk 提示；没有跳过测试、扩大 timeout 或添加依赖来规避问题。任务 03 的四项验收要求已完成。
