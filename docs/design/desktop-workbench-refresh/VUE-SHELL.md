# Vue 桌面壳与宿主扩展

任务：`.scratch/desktop-workbench-refresh/issues/10-vue-shell.md`。
审查基点：用户确认的 `8ee1303`。前置任务 09 的交付与视觉依据见 [React 展示场景](REACT-SHOWCASE.md)，原型依据为 `a9ebc22` 的 reference 布局。

## 交付范围

Vue EditorWorkbench 默认壳采用相同的白色面板、浅灰视口、细分隔线和蓝色激活态。64px 导航独立于左面板，初始左右宽度为 272/320px，分别允许收放和鼠标调宽。分隔线支持 Home、End、左右箭头（每次 16px），ARIA 数值和 CSS 列宽使用同一约束结果。ResizeObserver 按宿主实际宽度保留中央视口预算，卸载时释放；宿主降低高度时状态栏和工具组仍可达。

桌面与旧窄屏布局切换会改变被观察根元素自身的行高；Vue 在 ResizeObserver 通知期间直接更新网格会产生通知循环错误。测量更新现合并到下一帧，卸载时取消待执行帧。已有桌面矩阵增加原生 error 事件断言：修复前恢复窄窗口时捕获错误而失败，修复后 React/Vue 对称用例均通过，不屏蔽浏览器错误。

重复激活当前导航会收放左面板，切换到另一导航会展开对应内容。收放使用 hidden，保留面板实例、资源筛选及宿主 slot 内容。原有资源队列、恢复、重导入、属性、环境、灯光和相机内容继续可达。

原 toolbar 中的编辑命令移到视口浮动工具组。撤销/重做、变换、吸附和框选直接可用；辅助显示、相机和节点操作放入可展开工具组，保留既有命令及禁用状态。打开后聚焦首个可用控件，Escape 关闭并恢复触发器焦点；点击外部关闭。项目打开、完整/部分导出、locale 与操作结果仍在顶部，保留旧项目内容，后续任务再迁移其深层流程。

默认 renderer 使用与 React 相同的浅灰 clear color，authored scene background 仍优先；自定义 rendererFactory 保持优先。Vue 包声明与工作区一致的 Three.js 依赖并在构建中 externalize，避免重复打包。API 核对 [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)；生命周期清理核对 [Vue 官方文档](https://vuejs.org/api/composition-api-lifecycle.html)。Context7 未配置 API key，因此使用官方文档及当前锁定版本。

## 宿主与状态边界

- 六个 scoped slots 保留：toolbar、leftPanel、兼容 sidePanel、viewportOverlay、rightPanel、status。leftPanel 优先于 sidePanel；showDefaultToolbar 同时控制默认顶部工具和浮动工具，不隐藏宿主 toolbar。
- overlay 保留宿主交互优先级。Vue 示例的纯信息卡移至视口底部且不拦截指针，宿主可点击 overlay 的行为另有浏览器回归。
- locale/defaultLocale/translate/update:locale、隐藏和禁用语言切换器继续使用原有合约。新增壳层文案复用已同步的 en/zh-CN 字典键，无英文 fallback 补漏。
- 导航、宽度、收放、菜单与 locale 是 UI/session 状态。切换后 editor、runtime、canvas、选中对象和 history 保持；不向 snapshot 添加字段，不改 Core schema。
- 包与 Vue demo 仍可从空场景开始，不自动注入展示对象。截图中的 ToyCar、ambient light 和放大尺度都由验证脚本通过真实 UI 创建，不进入默认初始化。

## 验证入口

`packages/vue/test/workbench.test.ts` 覆盖键盘调宽、导航反复收放、资源筛选保留、locale 后 canvas/runtime 身份及快照不变、工具菜单焦点，并补上 leftPanel 与 sidePanel 同时提供时的优先级。已有受控 locale、translate、语言开关及 scoped-slot/public-api 回归保留。

现有跨框架 `proof-loop-demo.browser.test.tsx` 增加 Vue 对称矩阵：1440×900、1920×1080、1100×800 下鼠标/键盘调宽、实际面板宽度与 ARIA 相等、收放后的 canvas resize、焦点、页面不溢出、600px 宿主高度及自定义状态抽屉、可点击 overlay。两个 locale 下用 GLTFExporter 生成真实 GLB，空宿主导入后经真实 loader/runtime 投影、树选择、字段变换、撤销，再调宽、导航、切语言，核验 snapshot/history/runtime/canvas 身份和输入节点保持。

旧 Vue 示例 DOM 测试因按钮移出顶部工具栏而失败，已改用当前区域与可访问名称定位；导入、选择、字段、撤销/重做、材质、相机与项目导出/恢复断言保留。

## 截图与人工对照

启动 Vue 示例后运行：

```sh
pnpm --filter @ek-aiot/vue-proof-loop dev --host 127.0.0.1 --port 5181
node scripts/verify-vue-shell.mjs http://127.0.0.1:5181/
```

本机 Chromium 命令需要 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。

| 尺寸 | 空宿主 | 导入并选中 | 收起侧栏 | 资源 | 中文 |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | [空态](screenshots/vue-shell/1440-empty.png) | [选中](screenshots/vue-shell/1440-selected.png) | [收起](screenshots/vue-shell/1440-collapsed.png) | [资源](screenshots/vue-shell/1440-assets.png) | [中文](screenshots/vue-shell/1440-zh-CN.png) |
| 1920×1080 | [空态](screenshots/vue-shell/1920-empty.png) | [选中](screenshots/vue-shell/1920-selected.png) | [收起](screenshots/vue-shell/1920-collapsed.png) | [资源](screenshots/vue-shell/1920-assets.png) | [中文](screenshots/vue-shell/1920-zh-CN.png) |
| 1100×800 | [空态](screenshots/vue-shell/1100-empty.png) | [选中](screenshots/vue-shell/1100-selected.png) | [收起](screenshots/vue-shell/1100-collapsed.png) | [资源](screenshots/vue-shell/1100-assets.png) | [中文](screenshots/vue-shell/1100-zh-CN.png) |

[机器记录](screenshots/vue-shell/verification.json)：15 个状态，0 page exception。脚本还验证实际位置编辑及撤销。

已查看原型 reference-1440 与 Vue 1440/1920 选中、1100 空态/中文/收起画面：主要区域、左右栏比例、白色面板、浅灰视口和蓝色激活保持；1100 下工具换行和恢复入口可达，页面无横向溢出。树行与深层表单仍是旧内容，项目工具暂留顶部，符合本切片保留旧能力的边界；不宣称已完成后续 Vue 全能力视觉迁移。

截图使用已有 CC0 ToyCar，来源见 React [资产许可](../../../examples/react-proof-loop/public/SHOWCASE-LICENSES.md)。其 mesh 自带 0.0001 缩放，而通用 framing 保留最小距离，因此脚本通过 Scale XYZ 输入设置 70（与 React 展示宿主一致）再聚焦。本次未改变通用导入或相机算法。截图只添加普通 ambient light，未预置 React 展示场景的 HDR/镜头，因此材质照明并非任务 09 的最终展示效果；Vue 默认展示场景由后续任务交付。

## 命令记录

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过；Three.js 保持外置 |
| `pnpm typecheck` | 三个包通过 |
| React / Vue proof-loop build | 两个示例通过；沿用 Vite 大 chunk 提示 |
| Vue Workbench / proof-loop / public-api / i18n 定向单测 | 4 文件，51/51 |
| `pnpm test` | 114 文件，918/918 |
| 三个 Chromium 配置的 Vue 定向浏览器用例 | 18/18，修复后无 ResizeObserver 报错 |
| 原生截图脚本 | 15 个状态、15 张截图、0 page exception |
