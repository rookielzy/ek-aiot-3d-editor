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
python3 examples/showcase/assets/generate-studio.py
python3 examples/showcase/assets/prepare-model.py /path/to/upstream/ToyCar.glb
```

| 文件 | SHA-256 |
| --- | --- |
| ToyCar.glb | `f5cab0447ef3c0e593987b56ba4d4b5b1978f40cfeddb605e71bb6ef2e529dfb` |
| studio.hdr | `f1753e0767b4b3848535e1fa74d84aabd4b1cfe9c6555378ac6b41038ae7527e` |

## 往返与 Core 缺口

新增真实 App 浏览器闭环以 en / zh-CN 冷启动，整体模型位置编辑→撤销/重做→材质颜色→导入不同内容的 cool-studio.hdr 并切换环境来源、强度/旋转→灯光强度→完整导出→卸载旧宿主→新 editor、新 runtime 打开。核验新来源确实不同于初始 showcase-studio、全部载荷可导出、变换/材质/环境/灯光/defaultCameraId，并捕获实际相机和前后 WebGL canvas 像素。App 与 fresh host 的状态 chrome 可能令有效 canvas 宽高比有小幅差异，因此测试锁定宽高比差 `< 0.04`，把两张真实 framebuffer 统一缩放到 256×256 后要求每通道平均绝对差 `< 2.5`（0–255）。测试使用同一桌面视口、显式真实 GLTF loader、相同会话辅助显示配置；不向 snapshot 添加辅助显示字段。

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

2026-09-14 人工对照结论：已并列查看原型 `reference-1440.png` 与正式 1440 默认画面，并查看正式 1100 默认/问题/深层灯光、1920 选中及中文环境页。白色主面板、细分隔线、蓝色激活、左右栏与中央视口的区域关系保持；1100 下工具自然换行且模型未被裁切，问题抽屉缩小 canvas 后仍可操作，深层阴影字段在右栏内部滚动。明确差异为车体替代头盔、正式项目菜单和全量层级/诊断比原型更密集；不把它宣称为原型逐像素复制。默认只显示轻网格，灯光辅助可由现有控件打开；照明来自可导出的 HDR 和场景灯光。这些截图可作为 Vue 同步依据。

Vue 最终同步与双框架项目包恢复证据见 [双框架最终交付](PARITY-DELIVERY.md)。两示例现在直接复用 `examples/showcase` 中的同一初始化代码、CC0 资产和场景/相机契约。

## 验证与审查

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | 三个包通过 |
| React / Vue proof-loop build | 两个示例通过；沿用 Vite 大 chunk 提示 |
| Core owner transform + scene projector 定向回归 | 34/34 |
| 原生 Chromium 展示场景定向回归 | 中英像素往返 + 默认下载失败修复，3/3 |
| `pnpm test` | 114 文件，916/916；59.80s |
| `pnpm test:browser` | 三个 Chromium 配置，12 文件，75/75；380.90s |
| 空宿主 DOM 定向复验 | 1 文件，2/2 |
| 截图脚本 | 22 项状态/布局检查，19 张截图，0 page exception |

浏览器调度同时使用 `fileParallelism: false` 和各 instance 的 `sequence.groupOrder`，避免真实 GLB/PMREM 在无头软件 GPU 上争用资源；没有放宽既有用例超时或跳过配置。Vitest 将 [browser instances](https://vitest.dev/config/browser/instances) 转换为项目，跨项目串行还需要 [groupOrder](https://vitest.dev/config/sequence)。展示闭环固定在规格要求的桌面视口，既有宿主用例继续覆盖桌面边界和移动配置。测试把 shader 编译失败直接判为失败。


## Standards

对 `b0988f8...90fc7b9` 的规范轴未发现文档硬违规：初始化留在 demo，载荷与 runtime-only 资源不进入 snapshot，公开 API 与测试布局符合 AGENTS.md。

提出 1 项判断性维护建议：投影和释放路径分别检查 `target.object !== ownerRoot`，未来变更需同步，可能存在 Duplicated Code 风险。本次保留两个紧邻生命周期操作的简单身份检查，避免为一个比较新增抽象；两处共同表达 owner 变换由 authored object 拥有，已有投影和删除目标回归验证。

## Spec

初审提出 2 项证据缺口：人工原型对照结论未写明；环境来源测试切换后回到原资产，不能证明不同来源的往返。已补上方明确人工结论，并将测试改为从 UI 导入不同内容的 `cool-studio.hdr`、切换来源后完整导出，以新资产 ID 和实际像素恢复验证。

未发现有证据的越界或错误实现。Core 小修属于规格 Testing Decisions 7 的真实契约缺口修复。
