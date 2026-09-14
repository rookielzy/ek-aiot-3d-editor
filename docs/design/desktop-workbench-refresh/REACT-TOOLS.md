# React 视口工具与节点操作

任务：`.scratch/desktop-workbench-refresh/issues/04-react-tools.md`。实现前基线：`95483a7`。前置任务 03 的完成证据见 [REACT-HIERARCHY.md](REACT-HIERARCHY.md)。

## Core 差异记录

Workbench DOM 测试复现：普通对象经现有 `operations.group()` 组合后建立对象父子关系，`operations.ungroup()` 可以解除该关系，但 `toolbar.canUngroup` 仅检查选择中的 group 节点，因此按钮不可用。此次修正 capability，使其遵循实际解组命令使用的主选择：group 节点，或拥有对象子项的 object 节点。保留所有命令及历史语义，不引入新分组模型或 snapshot 字段。

`canPaste` 继续使用现有 Core toolbar capability（允许粘贴入口，即使内部剪贴板为空），不在 UI 另建剪贴板状态。

## 交付行为

- 变换、各自吸附、撤销/重做和框选在中央视口浮动组直接可用；吸附按钮使用对应变换图标和磁铁角标。节点操作、九种辅助显示、五种相机操作归入三个可访问的展开面板。
- 复用原有 `runAction`、camera、viewportHelpers 与 Core capability。项目操作、语言及项目反馈保留在全局工具栏，未提前实施任务 08 的项目工作流。
- 同时只打开一个工具面板；打开时聚焦首个可用操作。Escape 关闭并恢复入口焦点，不清除选择；点击外部、焦点离开工具区也会关闭。节点和相机操作执行后收起，辅助开关允许连续调整。
- 工具组随有效视口换行；菜单限制在当前视口高度内并独立滚动。两侧收放按钮仍在独立位置。`showDefaultToolbar` 控制全部默认工具，宿主 toolbar 与 viewportOverlay 保留原有入口和尺寸职责。
- 使用现有 en / zh-CN 文案，新增组件纳入字符串审计；未引入 UI snapshot 字段、新公开导出或依赖。

## 测试与视觉证据

- TDD 首先在缺少视口内节点入口失败，迁移后继续复现上述解组 capability 缺口，修正后通过。
- DOM 操作覆盖复制、粘贴、副本、删除、组合/解组、全选/清除及撤销/重做，断言 Core 编辑结果。其余覆盖包括三种独立吸附、全部辅助开关、相机入口、菜单焦点和输入控件快捷键保护。
- 原有真实 GLB/WebGL 宿主测试继续验证点选、框选和坐标轴拖动；补充拖动仅增加一条历史、Undo/Redo 恢复相同位置。取消、吸附量化与 camera controls 恢复继续复用已有 Core `transform-controls-adapter.test.ts` 证据，不新增选择或拖动模型。
- 浏览器在 1440×900、1920×1080、1100×800 下检查全部浮动入口的真实命中位置，侧栏最大宽度及 600px 高宿主下检查菜单末项可见、可滚动且 Escape 恢复焦点。独立宿主用 status render region 展开详情，验证视口收缩时工具仍可达、canvas 和选择保持；这不是提前实现默认问题抽屉。
- 截图来自真实 GLB 宿主，逐张对照 `a9ebc22` reference 检查白色紧凑工具组、蓝色激活、灰色视口与菜单遮挡。菜单暂时覆盖部分模型，可随时关闭；测试方块不是任务 09 的正式示例模型。生成截图的临时语句已经移除，正常测试不会重写截图。

[1440×900](screenshots/react-tools/selected-1440.png) · [1920×1080](screenshots/react-tools/selected-1920.png) · [1100×800](screenshots/react-tools/selected-1100.png) · [1100 辅助菜单](screenshots/react-tools/helpers-1100.png)

Context7 未配置 API key；事件订阅与清理参考 [React useEffect 官方文档](https://react.dev/reference/react/useEffect)。

## Standards

规范轴未发现硬性违规，提出 1 项维护建议：工具组 key 原为任意 string，但菜单分类依赖固定值，属于可能的 Primitive Obsession。已改为 `CommandGroupKey` 字面量联合，同时约束展开状态。审查确认 Core 解组可用性与 `operations.ungroup()` 的主选择分派一致，UI 状态没有进入 durable snapshot。

## Spec

规格轴提出 2 项，均已补齐：

1. 宿主 `viewportOverlay` 在重叠时被默认浮动工具遮挡。新增浏览器命中测试复现失败，再提升 overlay 层级；宿主按钮保持可点击，未触发底层 Rotate。示例的只读状态卡移至底部并允许指针穿透，避免盖住工具菜单；没有对通用宿主内容强制偏移。
2. Core capability 变更缺少 Core model 回归。补充普通 group、有对象子项的 object、无子项的 object、多选时不同主选择，以及解组前后可用性的用例。

合计 Standards 1 项建议（已修正），Spec 2 项反馈（已修正）；没有待处理的本任务规格缺口。

## 全量回归修正

首轮全量单测 889/891：旧 React 示例集成用例仍在全局工具栏中查找 Move/副本/吸附；新增节点闭环在并行负载下超过 5 秒。更新集成用例按可见视口和展开菜单操作；节点专项宿主通过已有 rightPanel render prop 省略不相关的深层 Inspector，查询限定在节点操作区域，保留所有编辑结果断言、完整默认宿主浏览器用例和默认 timeout。修正后两个定向文件 54/54 通过。

## 最终验证

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过 |
| `pnpm test` | 113 文件，891/891 通过，53.02s |
| `pnpm test:browser` | 9 个文件实例，48/48 通过，31.49s |

浏览器沿用本机 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`，未修改仓库系统依赖。保留既有 JSDOM canvas 提示和示例大 chunk 提示；无跳过用例、放宽 timeout 或新增依赖。任务 04 的四项验收要求均已完成。
