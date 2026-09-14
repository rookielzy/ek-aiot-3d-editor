# React 可恢复展示场景与视觉基线

任务：`.scratch/desktop-workbench-refresh/issues/09-react-showcase.md`。用户确认的审查基点：`b0988f8`。
视觉来源：`codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 布局；前置交付见 [React 项目与问题](REACT-PROJECT-PROBLEMS.md)。

## 场景与资产边界

React demo 冷启动载入本地 Toy Car、工作室 HDR、directional 主光、hemisphere 补光和 Studio view 默认镜头。示例使用包根公开 API，包的空 editor / 传入 snapshot 不注入展示内容。旧 starter 空宿主导入流程保留在测试辅助宿主 `EmptyHost`，另以真实 App 验证展示场景。

初始化有双语加载态，并在显示工作台前完成，因此后台 seed 不会覆盖用户刚打开的项目。StrictMode 取消旧加载；离开宿主中止 fetch 并释放宿主 editor。默认资源下载失败保留真正缺失的资产引用，进入现有问题抽屉和文件修复流程；异常初始化可重试。启动历史为空，首个撤销只撤销用户编辑。

- 模型是 Guido Odendahl / Eric Chadwick 的 CC0 Toy Car。剔除 active scene 的展示布及示例相机根节点，车体/玻璃几何、材质、内嵌贴图不改；不采用原型头盔的混合许可。原始 README、来源、修改说明和可重跑脚本随仓库保存。
- HDR 是仓库脚本生成的原创 512×256 RGBE 环境，CC0，无外部照片。它是可编辑、可导出的普通 HDR 资产，不是 renderer 内部 RoomEnvironment。GLB 和 HDR 均使用 Vite 资产 URL，支持非根 base 路径和离线静态分发。
- 来源/许可也进入 durable asset metadata；完整项目携带两份载荷。分发说明见 [SHOWCASE-LICENSES.md](../../../examples/react-proof-loop/public/SHOWCASE-LICENSES.md)，Vite build 会复制到站点根目录。
- 灯光、背景、HDR 引用/强度/旋转、模型变换/材质以及默认镜头使用现有 snapshot contract。PMREM、纹理和 object URL 由 Core runtime / asset store 管理、重建及释放，不写入 JSON。
- 场景树保留全部 imported targets。当前模型有 8 条共享目标不可独立变换的 **info** 诊断，不是缺失资源或加载错误；整体对象及 material-slot 仍可编辑。没有模拟问题开关、固定“就绪”文案或过滤诊断。

复现资源：

```sh
python3 examples/react-proof-loop/src/showcase/generate-studio.py
python3 examples/react-proof-loop/src/showcase/prepare-model.py /path/to/upstream/ToyCar.glb
```

| 文件 | SHA-256 |
| --- | --- |
| ToyCar.glb | `f5cab0447ef3c0e593987b56ba4d4b5b1978f40cfeddb605e71bb6ef2e529dfb` |
| studio.hdr | `f1753e0767b4b3848535e1fa74d84aabd4b1cfe9c6555378ac6b41038ae7527e` |

## 往返与 Core 缺口

新增真实 App 浏览器闭环以 en / zh-CN 冷启动，整体模型位置编辑→撤销/重做→材质颜色→环境来源 none/HDR、强度/旋转→灯光强度→完整导出→卸载旧宿主→新 editor、新 runtime 打开。核验载荷可导出、变换/材质/环境/灯光/defaultCameraId，并捕获实际相机和前后 WebGL canvas 像素；像素每通道平均绝对差阈值为 0.5（0–255）。测试使用同一视口、显式真实 GLTF loader、相同会话辅助显示配置；不向 snapshot 添加辅助显示字段。

像素检查发现此前未被数据回归捕获的 Core 缺陷：scene imported target 与 owner 共用 runtime 根对象，重复投影时 imported base transform 把 owner 最新变换覆盖为首次值。新 runtime 的首次 base 来自最新 snapshot，于是恢复画面偏移。修复仅在投影和释放 imported target 时排除 owner 根对象的基准变换回写，不改 resolver/remap/schema。公开 editor/runtime 回归覆盖位移、旋转、缩放、撤销、重做、新 runtime 和删除 scene target；原子回归先红后绿，既有 descendant/base 恢复测试继续通过。

新宿主必须按已有契约提供真实 GLTF loader，并应用 `resolveDefaultPresentationView()` 返回的默认视图。测试曾漏传 loader 而使用 Core 的占位 loader，已纠正宿主配置；不改变包的默认依赖策略。

## React 全能力、双语与宿主扩展验收

| 能力 | 验收入口 |
| --- | --- |
| 默认展示、完整载荷、新 runtime 像素往返、真实默认下载失败修复 | `packages/react/test/showcase.browser.test.tsx` |
| 空宿主、外部 snapshot、Core 状态驱动、项目恢复 | `react-proof-loop.integration.test.tsx`、`support/EmptyHost.tsx` |
| 导入真实 GLB、树/画布选择、调宽后点选/变换/撤销、imported target、material-slot | `proof-loop-demo.browser.test.tsx` 已有真实宿主用例 |
| 批量导入、栅格用途、资源筛选/引用/载荷、替换/缺失恢复、重导入/remap | `workbench.test.tsx`、`proof-loop-demo.browser.test.tsx` 资源维护用例 |
| 灯光/阴影、相机捕获/默认视图、环境字段、深层表单滚动 | `inspector.test.tsx`、`proof-loop-demo.browser.test.tsx`、本次截图矩阵 |
| 打开、完整/部分导出、真实诊断及恢复、关闭保留问题 | `workbench.test.tsx`、任务 08 浏览器闭环、本次失败恢复 |
| en/zh-CN、受控/非受控 locale、translate、语言开关隐藏/禁用、输入/history/runtime 稳定 | `workbench.test.tsx`、i18n 字典/审计用例、本次中英闭环 |
| toolbar / leftPanel / sidePanel / viewportOverlay / rightPanel / status 优先级、隐藏默认工具仍保留扩展 | `workbench.test.tsx`、`EmptyHost`、宿主状态抽屉浏览器用例 |
| 面板鼠标/键盘调宽、独立收放、菜单焦点、工具可达、canvas resize | `proof-loop-demo.browser.test.tsx`、`scripts/verify-react-showcase.mjs` |

没有迁移 Vue UI、新增 public API、引入原型 query 开关或包内部深层导入。Three.js 相关 API 核对本地源码及官方 [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[HDRLoader](https://threejs.org/docs/pages/HDRLoader.html)；Context7 未配置 API key。

## 固定截图与 Vue 同步基线

运行 React 示例，然后从仓库根执行：

```sh
pnpm --filter @ek-aiot/react-proof-loop dev --host 127.0.0.1 --port 5180
node scripts/verify-react-showcase.mjs http://127.0.0.1:5180/
```

本机浏览器命令加环境变量 `LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。脚本保留，可重复生成；正常测试不改写基线截图。

| 尺寸 | 默认 | 选中 | 收起侧栏 | 真实问题 | 环境 | 深层灯光 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | [默认](screenshots/showcase/1440-default.png) | [选中](screenshots/showcase/1440-selected.png) | [收起](screenshots/showcase/1440-collapsed.png) | [问题](screenshots/showcase/1440-problems.png) | [环境](screenshots/showcase/1440-environment.png) | [灯光](screenshots/showcase/1440-deep-light.png) |
| 1920×1080 | [默认](screenshots/showcase/1920-default.png) | [选中](screenshots/showcase/1920-selected.png) | [收起](screenshots/showcase/1920-collapsed.png) | [问题](screenshots/showcase/1920-problems.png) | [环境](screenshots/showcase/1920-environment.png) | [灯光](screenshots/showcase/1920-deep-light.png) |
| 1100×800 | [默认](screenshots/showcase/1100-default.png) | [选中](screenshots/showcase/1100-selected.png) | [收起](screenshots/showcase/1100-collapsed.png) | [问题](screenshots/showcase/1100-problems.png) | [环境](screenshots/showcase/1100-environment.png) | [灯光](screenshots/showcase/1100-deep-light.png) |

[中文环境页](screenshots/showcase/1440-zh-CN.png) · [机器验收记录](screenshots/showcase/verification.json)。

Vue 后续同步使用本目录 React 截图和同一 CC0 资产、场景/相机契约作为正式基线。相较原型，模型替换为许可明确的车体，保留全量导入层级和真实诊断；白色连续面板、64px 导航、左右内容区、浅灰视口、蓝色激活、顶部工具和底部状态沿用已交付壳。深层表单在右栏内部滚动，不以原型简化表单替代。

## 验证与审查

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| React / Vue proof-loop build | 两个示例通过；沿用 Vite 大 chunk 提示 |
| Core owner transform + scene projector 定向回归 | 34/34 |
| 原生 Chromium 展示场景定向回归 | 中英像素往返 + 默认下载失败修复，3/3 |
| `pnpm test` | 114 文件，916/916；59.80s |
| 截图脚本 | 22 项状态/布局检查，19 张截图，0 page exception |

全量浏览器回归与双轴审查完成后补记。
