# React/Vue 双框架最终交付

任务：`.scratch/desktop-workbench-refresh/issues/16-parity-delivery.md`。
视觉来源：原型 `codex/prototype-desktop-workbench` / `a9ebc22`，正式 React 基线见 [REACT-SHOWCASE.md](REACT-SHOWCASE.md)。

## 展示场景与恢复边界

React/Vue 正式 demo 现在调用 `examples/showcase/showcase.ts` 的同一个
`createShowcaseEditor()`。共享 bootstrap 注册本地 CC0 Toy Car GLB 和原创
CC0 studio HDR，写入同样的模型变换、HDR 环境、纯色背景、directional / hemisphere
灯与 `showcase-view` default camera；初始化后从序列化 snapshot 创建干净 history，
二进制 payload 仍只保留在项目资产 store。包本身从不调用这个 bootstrap，裸
`useEditor()` / `EditorWorkbench` 的空态由 React/Vue 独立测试保留。

完整 `.ek3d` 项目携带 GLB/HDR payload。浏览器回归将同一份包分别导入新 React
和 Vue editor，使用 `resolveDefaultPresentationView()` 应用同一固定镜头，并核验：

- environment、lights、presentation snapshot 完全相等；
- 捕获相机 position/target/projection 完全相等；
- 两套 runtime 均真实投影 `showcase-model` 且没有 error problem；
- adapter chrome 导致原始 canvas 宽高比约有 `0.0336` 差异；统一缩放到
  256×256 后，真实 framebuffer 平均每通道绝对差约 `1.87 / 255`。回归阈值固定为
  宽高比差 `< 0.04`、像素差 `< 2.5`，因此记录必要布局差异而不把“资产引用存在”
  当成画面等价。

## 操作位置与宿主区域

- Project menu：打开、完整/部分导出、English / 简体中文。
- 左导航：Scene、Assets、Project；再次激活当前项可收放左栏。
- 视口工具：undo/redo、transform、snap、marquee，以及 helpers、camera、node operations。
- 右 inspector：Object/Properties、Environment、Scene。
- 底栏：selection/history/runtime/snap/project/assets/save/problem 摘要；Problem details
  打开含 severity、source 与真实恢复动作的抽屉，关闭不清除诊断。
- React render props / Vue scoped slots：`toolbar`、`leftPanel`、兼容 `sidePanel`、
  `viewportOverlay`、`rightPanel`、`status`；`leftPanel` 优先，隐藏默认工具不吞宿主 toolbar。

面板收放、鼠标/键盘调宽、问题抽屉、语言与导航均是 session UI state；既有 durable
sentinel 覆盖 snapshot / `.ek3d`，禁止 locale、panel width、Three.js object、`File`、
`Blob`、object URL、PMREM 与 resolver result 泄漏。

## 固定截图与人工对照

Vue 截图使用正式 demo、同一 authored camera 和同一资源生成：

```sh
pnpm --filter @ek-aiot/vue-proof-loop dev --host 127.0.0.1 --port 5181
LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu \
  node scripts/verify-vue-shell.mjs http://127.0.0.1:5181/
```

| 尺寸 | 默认 | 选中 | 收起侧栏 | 问题抽屉 | 环境 | 深层灯光 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | [默认](screenshots/showcase-vue/1440-default.png) | [选中](screenshots/showcase-vue/1440-selected.png) | [收起](screenshots/showcase-vue/1440-collapsed.png) | [问题](screenshots/showcase-vue/1440-problems.png) | [环境](screenshots/showcase-vue/1440-environment.png) | [灯光](screenshots/showcase-vue/1440-deep-light.png) |
| 1920×1080 | [默认](screenshots/showcase-vue/1920-default.png) | [选中](screenshots/showcase-vue/1920-selected.png) | [收起](screenshots/showcase-vue/1920-collapsed.png) | [问题](screenshots/showcase-vue/1920-problems.png) | [环境](screenshots/showcase-vue/1920-environment.png) | [灯光](screenshots/showcase-vue/1920-deep-light.png) |
| 1100×800 | [默认](screenshots/showcase-vue/1100-default.png) | [选中](screenshots/showcase-vue/1100-selected.png) | [收起](screenshots/showcase-vue/1100-collapsed.png) | [问题](screenshots/showcase-vue/1100-problems.png) | [环境](screenshots/showcase-vue/1100-environment.png) | [灯光](screenshots/showcase-vue/1100-deep-light.png) |

[中文环境页](screenshots/showcase-vue/1440-zh-CN.png) · [机器记录](screenshots/showcase-vue/verification.json)（19 个状态、0 page exception）。

2026-09-16 人工并列查看 React/Vue 1440 默认、Vue 1100 问题抽屉与 Vue 中文环境页：
白色连续面板、浅灰视口、细分隔线、蓝色激活、同一层级/灯光/镜头和整体构图一致；
1100 下工具换行、抽屉与状态栏仍可达，中文 chrome 完整且 authored 名称保持原值。
必要差异是 Vue 底栏 problem chip 的换行与两适配器有效 canvas 宽度略有不同，导致 Vue
默认车体略小；固定相机参数及归一化 framebuffer 仍满足上述阈值。

## User stories 与边界核对

| Story | 证据 |
| --- | --- |
| 1, 5 | 三尺寸 React/Vue 截图；跨框架面板/抽屉/canvas 浏览器矩阵。 |
| 28, 29 | 两 demo 共用展示 bootstrap；两包分别保留空宿主测试。 |
| 30 | 中英闭环保留 editor/runtime/canvas、selection 与 history；中文固定截图。 |
| 32, 33 | React render props、Vue scoped slots、locale event 与区域优先级测试。 |
| 34 | panel/tab/drawer/locale 均为组件本地状态；snapshot/project sentinel。 |
| 35 | 固定原型来源、同场景截图、真实问题与 framebuffer；无模拟问题或密度开关。 |

正式业务源码只从 package root 导入。示例开发配置把公开包名 alias 到 monorepo source，
用于在未发布工作区内运行，不构成 consumer deep import；打包 consumer 的 package-root
类型由 `scripts/verify-release.mjs` 验证。展示资产来源、改动、许可及复现脚本见两个示例
的 `public/SHOWCASE-LICENSES.md` 与 `examples/showcase/assets`。

## 最终验证

2026-09-16 在 Linux headless Chromium 环境完成：

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | 通过，全部 workspace package 构建成功。 |
| `pnpm typecheck` | 通过。 |
| `pnpm test` | 115 个文件、958/958 通过。 |
| `pnpm test:browser` | 12 个文件、102/102 通过；覆盖 1280、1024 边界与 390 mobile 三个 Chromium 项目。 |
| React/Vue proof-loop `build` | 两个正式 demo 均通过；仅保留 Vite 大 chunk 提示。 |
| `node scripts/verify-release.mjs` | 3 个发布包 pack/install、package-root TypeScript、private import 负例及 React/Vue Vite consumer 均通过。 |
| `scripts/verify-vue-shell.mjs` | 19 个固定状态、0 page exception。 |

浏览器运行仍会打印既有的 `TransformControls` 场景图挂载时序警告，但不产生 test failure；
jsdom 全套仍会打印其既有的 canvas `getContext` 未实现提示。两者均未改变断言或退出码。
