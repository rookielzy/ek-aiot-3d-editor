# React 桌面壳与可调面板

任务：`.scratch/desktop-workbench-refresh/issues/02-react-shell.md`。实现前基线：`e75d6b7`（任务 01 的完成及验证记录见 [BASELINE.md](BASELINE.md)）。

## 交付范围

- 默认 React `EditorWorkbench` 使用白色连续面板、64px 导航、默认 272px 左栏与 320px 右栏、中央视口及紧凑底部状态。窄导航的 Scene / Assets / Project 消费真实上下文，当前页再次激活可收放左栏。
- 左右侧栏分别收放；分隔线支持鼠标指针捕获、左右方向键（16px 一步）、Home / End。默认最大宽度为 480px，并按宿主宽度约束，给视口预留至少 320px；1100px 宿主时最大值为 352px。布局与 accessible value 共用同一实际像素值；扩大窗口后恢复此前偏好。
- 隐藏侧栏不卸载内容。资源筛选、已有字段、选择、历史和 runtime 保留；宽度与导航状态只在组件内存中。独立展开按钮持续可达；键盘/拖宽后焦点保留在分隔线，收放按钮自身不替换。
- 空场景有资源入口，包不会注入示例模型。React 默认 renderer 的浅灰清屏色只作用于没有场景背景时；宿主 renderer 优先，场景已设置的背景仍由 Core 投影。Three.js 使用仓库已有版本并在包构建中 externalize，不修改 Core contract 或 durable snapshot。
- 保留全部 render regions，`leftPanel` 优先于兼容 `sidePanel`，`showDefaultToolbar=false` 仍显示自定义 toolbar。新增文案有 en / zh-CN 字典。

本任务不提前实现后续场景树增强、工具菜单拆分、Inspector 分组、问题抽屉或示例默认模型。现有工具全部留在中央上方可横向滚动的工具栏，深层表单全部保留且在右栏内部滚动。原型中的头盔、隐藏环境光和演示问题未引入正式包。

## 测试边界与证据

沿用规格确认的 Workbench DOM、package-root 类型及真实宿主浏览器边界。

1. TDD：新增 DOM 用例先在“再次激活 Assets 后应收起左栏”失败；实现后通过。它验证资源搜索保留、两侧收放、选择/snapshot/runtime 不变，以及恢复后的字段修改和撤销。
2. TDD：新增浏览器布局用例先因不存在 separator 失败；实现后验证三个桌面尺寸、Home/End/方向键、原生 Playwright 鼠标拖宽、宽度与 ARIA 一致、canvas 随有效视口 resize、收放恢复及原有完整编辑/项目往返。
3. 发现旧 `packages/core/test/fixtures/simple-box.glb` 是占位文本，旧宿主测试通过注入 loader 与 2D renderer 验证管线。因此额外在同一宿主边界加入真实 GLB/WebGL 用例：在浏览器用 GLTFExporter 生成 BoxGeometry，使用示例默认 ThreeGltfLoaderAdapter 和默认 renderer，导入、树选中、聚焦、两侧收起、清空选择、画布中心点选、恢复右栏、位置修改及撤销。没有把旧测试冒充成真实二进制解析验证。
4. 人工视觉检查使用开发服务器上的真实 WebGL，与原型 `a9ebc22` 的 reference 截图比较主区域、白色连续面板、比例、蓝色激活和可达性。验证用方块由 Three.js BoxGeometry 与 MeshBasicMaterial 生成，无外部美术资产，仅临时导入，未加入示例启动数据。

## 视觉与鼠标核验

运行 `pnpm --filter @ek-aiot/react-proof-loop dev --host 127.0.0.1 --port 5180` 后，使用 Playwright 原生鼠标拖动及键盘操作检查。

| 尺寸 | 实测拖宽后左栏 / 右栏 | 结果 |
| --- | --- | --- |
| 1440×900 | 284px / 324px | ARIA 一致、画布 resize、无页面横溢出、状态栏可见 |
| 1920×1080 | 284px / 324px | 同上 |
| 1100×800 | 284px / 324px | 同上；两个展开按钮可达 |

原生浏览器执行未出现 page exception。空态和选中态均已逐张查看；右侧材质字段、环境、灯光与相机入口继续保留，尚不宣称后续表单视觉切片已完成。

- [空态 1440](screenshots/react-shell/empty-1440.png)
- [选中态 1440](screenshots/react-shell/selected-1440.png)
- [选中态 1920](screenshots/react-shell/selected-1920.png)
- [选中态 1100](screenshots/react-shell/selected-1100.png)
- [两侧收起 1100](screenshots/react-shell/collapsed-1100.png)

## 命令记录

- `pnpm build`：Core / React / Vue 通过。
- `pnpm typecheck`：Core / React / Vue 通过。
- `pnpm --filter @ek-aiot/react-proof-loop build` 与 `pnpm --filter @ek-aiot/vue-proof-loop build`：通过，保留既有大于 500 kB chunk 提示。
- `pnpm exec vitest run packages/react/test/workbench.test.tsx packages/react/test/workbench-i18n.test.ts packages/react/src/public-api.test.ts`：56/56 通过。
- 新增原生鼠标调宽用例、真实 GLB/WebGL 用例定向运行均通过。

本机浏览器需要沿用基线环境变量：`LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。未更改仓库浏览器系统依赖配置。

状态保留参考 [React 文档](https://react.dev/learn/preserving-and-resetting-state)；默认清屏色参考 [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)。Context7 无 API key，使用官方文档作为替代来源。

首次全量 `pnpm test` 为 882/884：跨框架字典键集合缺少 9 个新增文案；新增 DOM 用例在全量负载下超时。已同步 Vue 共享字典（不迁移 Vue UI），并将 DOM 查询限定到导航/label，保留所有断言和默认 timeout。修正后独立 Workbench 与跨框架字典回归 49/49 通过。

`pnpm test:browser` 全量为 9 个文件实例、42/42 通过，覆盖原有三个浏览器项目；新增布局用例在每个项目内实际切换 1440×900、1920×1080、1100×800，再恢复原尺寸。真实 GLB/WebGL 用例在原有三个尺寸均通过。

## Standards

规范轴提出 2 项建议，无明确硬性规范违规：

1. 壳层与 Core 默认 renderer 的 canvas 降级实现重复。确认 Core package-root **未导出** `createDefaultRenderer`，因此不采用私有深层导入，也不为清屏色扩展 Core API。本切片保留小段相同降级语义和注释；这是接受的维护权衡。
2. 桌面布局高度可能超出较矮宿主。新增 600px 高宿主用例先复现实际高度 800px；将默认全屏高度限制在宿主可用高度内后通过，状态栏仍在宿主边界内。

## Spec

规格轴提出 2 项，其中确定的布局问题与焦点证据缺口均已处理：

1. 通用 `viewportOverlay` 被新增顶内边距下移。已恢复该 render region 原有 padding；示例自己的 `StarterOverlay` 使用 margin 给默认按钮避让，包不强制宿主内容偏移。
2. 补齐鼠标调宽、End 调宽、收起与恢复后的 `document.activeElement` 断言，均通过。审查对原生鼠标证据的质疑不成立：本仓库 `@vitest/browser-playwright` provider 将 `userEvent.dragAndDrop` 交由 Playwright，此外上文独立截图脚本也使用 `page.mouse.down/move/up`。

合计 Standards 2 项建议（1 项修正、1 项有明确范围依据的权衡）；Spec 2 项（布局与焦点证据均已补齐），没有待修复的规范违规或本任务规格缺口。

## 最终验证

审查修正后按顺序执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 类型检查与构建通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 构建通过 |
| `node scripts/verify-release.mjs` | 3 个安装包通过，包含 package-root consumer 类型、运行时导入、私有路径拒绝及 React/Vue consumer build；未发布 |
| `pnpm test:browser`（上述本机环境变量） | 9 个文件实例、42/42 通过，22.49s |
| `pnpm test` | 113 文件、884/884 通过，62.54s |

最终单测没有扩大 timeout 或跳过用例。保留既有 JSDOM canvas 提示和示例 chunk 提示；真实 WebGL 行为另由浏览器用例及截图核验。任务 02 的六项验收要求均已完成。
