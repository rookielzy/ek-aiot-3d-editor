# React 项目往返与问题抽屉

任务：`.scratch/desktop-workbench-refresh/issues/08-react-project-problems.md`。实现前基线及用户确认的审查基点：`51257a7`。
前置任务证据：[视口工具](REACT-TOOLS.md)、[场景属性](REACT-SCENE-INSPECTOR.md)、[资源维护](REACT-ASSETS.md)。

## 交付行为

- 默认全局菜单包含打开、完整导出、显式部分导出及既有语言选项。菜单支持 Escape、外部点击、焦点离开关闭；操作后焦点返回入口。菜单与抽屉在事件捕获阶段消费 Escape，避免触发工作台的清除选择快捷键。
- 异步项目操作显示处理中状态并阻止重复操作。反馈依照实际 packageBytes、manifest.completeness 与 problems 区分不可导出、部分包及完整包警告；打开不完整包不会显示普通成功提示。
- 状态栏保留 selection/history/runtime/snap/project/assets/save/problems 八类可访问摘要。问题按钮展开真实诊断，呈现严重性、来源、目标、本地化说明和文件恢复入口；关闭不清除诊断，恢复完成后重新投影并更新问题。
- Core 返回的项目操作问题及文件读取/下载异常留在 React Workbench 会话中，不改 Core schema，也不改变 useWorkbench 的项目 API 调用语义。导出缺失问题依据当前 Core asset workspace 的 packageBlocking 状态更新；宿主自定义区域及 locale 选项保持。
- 补齐已有项目校验错误的双语标题，以及新增菜单/抽屉文案。同步 Vue 字典键集以维持既有 parity contract，未迁移 Vue UI。

## 行为与视觉证据

DOM 覆盖菜单关闭、焦点、缺失文件恢复、失败打开不替换场景、关闭后保留错误，以及完整导出阻塞→显式部分导出→修复→完整导出的真实闭环。沿用受控/非受控 locale、宿主 translate、开关禁用/隐藏和 render props 回归。

新增浏览器用例在 en 与 zh-CN 分别通过真实 GLB 文件输入导入、树选择、数值变换、撤销/重做、材质、背景、灯光、默认相机、完整导出与打开。直接解包检查 scene.json 等价、project.json 完整性，检查选择和所有 durable 字段恢复；语言切换保持历史、输入节点、editor/runtime/canvas。实际相机位置及目标与保存的默认视图一致。

另有真实缺失 GLB 的抽屉恢复浏览器用例；修复后模型进入 runtime，问题清零且完整导出可用。所有新增布局检查执行 1440×900、1920×1080、1100×800，验证菜单命中、抽屉内部滚动、视口随抽屉收缩及无页面横向溢出。

已对照 `a9ebc22` reference 人工查看截图：白色面板、细边框、蓝色菜单焦点与底部紧凑诊断行延续现有正式工作台。截图使用自生成 GLB 方块与真实缺失资源；它们是本任务的菜单/状态/恢复证据，不替代任务 09 的展示模型验收。截图生成代码已移除，正常测试不会改写图片。

| 尺寸 | 项目菜单 | 问题与恢复入口 | 打开后的无问题状态 |
| --- | --- | --- | --- |
| 1440×900 | [菜单](screenshots/react-project/menu-1440.png) | [缺失资源](screenshots/react-project/problems-1440.png) | [恢复项目](screenshots/react-project/restored-1440.png) |
| 1920×1080 | [菜单](screenshots/react-project/menu-1920.png) | [缺失资源](screenshots/react-project/problems-1920.png) | [恢复项目](screenshots/react-project/restored-1920.png) |
| 1100×800 | [菜单](screenshots/react-project/menu-1100.png) | [缺失资源](screenshots/react-project/problems-1100.png) | [恢复项目](screenshots/react-project/restored-1100.png) |

Context7 未配置密钥；焦点 ref 的使用核对了 [React useRef 官方文档](https://react.dev/reference/react/useRef)。

## Standards

审查基点 `51257a7`，实现提交 `e8b13a7`。规范轴未发现有证据的硬违规；确认瞬时 File 与操作错误未进入 durable snapshot，代码、测试、截图的位置及提交形式符合 AGENTS.md。

提出 1 项判断性建议：EditorWorkbench 为注入项目操作问题，重复了 useWorkbench 的 model/problems 组装，存在潜在 Duplicated Code / Feature Envy 风险；建议将瞬时问题参数交给 hook 统一处理。此次保留这段工作台会话边界：Core 仍是唯一派生模型构建者，useWorkbench 的已有公开调用语义不增加副作用，也不为本次 UI 需求扩展公开选项。当前两处字段一致；后续模型扩展时需同步核对。

## Spec

规格轴未发现任务 08 范围内的偏差或实现错误。确认菜单三类项目结果、八类状态、诊断及恢复、关闭保留、中英项目往返、locale/runtime/input 稳定、UI/session 边界及 public render regions 保持；未发现越界行为。

合计：Standards 0 项硬违规、1 项维护建议（按上述边界保留）；Spec 0 项问题。

## 最终验证

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过 |
| `pnpm exec vitest run packages/react/test/workbench.test.tsx packages/react/test/react-proof-loop.integration.test.tsx packages/react/test/i18n-string-audit.test.ts packages/react/test/workbench-i18n-parity.test.ts` | 4 文件、68/68 |
| 新增原生 Chromium 浏览器用例 | 缺失资源恢复及 en/zh-CN 完整往返，3/3 |
| `pnpm test` | 113 文件、915/915，50.34s |
| `pnpm test:browser` | 9 个文件/配置实例、66/66，59.90s |

浏览器使用本机 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。沿用既有 JSDOM canvas 提示、示例大 chunk 提示；原生浏览器日志仍有 TransformControls 的 attached-object/scene-graph 提示，之前的宿主闭环也出现过。实际对象恢复、相机状态和所有行为断言通过，没有跳过测试或放宽 timeout。
