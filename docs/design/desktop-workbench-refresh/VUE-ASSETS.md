# Vue 资源导入与维护

任务：`.scratch/desktop-workbench-refresh/issues/14-vue-assets.md`；父规格：`.scratch/desktop-workbench-refresh/spec.md`。实现基点为 `cc742a6`，视觉和交互继续对照 `a9ebc22` reference 及已验收的 React 资源工作区。

## 交付范围

Vue 资源面板现与 React 保持同一宿主行为：批量选择和拖放共享逐文件队列，raster intent 决定图片登记为 texture 或 image，部分失败不回滚成功项。队列保留全部结果并使用实例内单调 ID，同一毫秒连续导入同名文件也不会互相覆盖；队列内部滚动，避免大批次挤走资源列表。

搜索、类型、状态和排序继续复用 Core workspace helpers。零匹配显示双语空态；资源 kind、workspace/payload/package/import 状态、全部引用和全部诊断都可读取。普通已注册资源可直接替换，missing recovery 保留 asset identity，替换后 payload、runtime projection 和问题摘要同步更新。

普通替换、missing recovery 和 GLB reimport 统一进入按 asset ID 的维护链。同一资源的操作串行执行，并以共享 token 阻止旧结果覆盖新反馈；较旧 GLB 分析无论成功或失败，都不能在较新文件之后提交。GLB identity、Core remap 和 unresolved diagnostics 沿用既有合约，没有修改 Core、公开 API、history 或 Scene Snapshot。

资源区样式同步 React 的连续白色列表、细分隔线、两列过滤控件、缺失/错误色条、长名称换行和完整文件控件点击范围。新增可访问状态使用现有 en/zh-CN 字典；scoped-slot context 未改变。

## 测试

Vue Workbench DOM 用例覆盖：超过八个文件、同毫秒同名队列、部分失败、拖放 image intent、全部引用、搜索/类型/状态/排序、零匹配、可用图片替换、missing recovery、payload-only 刷新、GLB identity/remap，以及旧 GLB 成功/失败和重叠 missing replacement 的竞态。

跨框架浏览器用例继续使用父规格确认的唯一真实宿主入口。测试用 `GLTFExporter` 生成真实 GLB，经原生 file input 恢复缺失资源，验证 runtime 中出现真实 mesh；随后选择引用对象、将 Position X 改为 2，再重导入并验证 asset identity/remap。用例还覆盖 raster 部分失败、图片替换、搜索空态、1440×900 / 1920×1080 / 1100×800 可达性，以及 locale 切换不重建 runtime/canvas。React/Vue 两个分支在三个 Chromium 配置下共 6/6 通过；保留既有 TransformControls 日志。

## 审查

Standards 轴报告两项：跨框架浏览器测试位于 React test 目录，以及 React/Vue 维护链和 deferred helper 重复。第一项沿用父规格 Testing Decisions 指定的现有跨框架 E2E 入口，不认定为本次违规；第二项保留为维护建议，父规格要求最小必要重构且不新增通用插件或设计系统，本切片不扩大抽象范围。

Spec 轴发现两项并已修复：时间戳队列 ID 可能让同名文件状态互相覆盖；真实浏览器切片缺少编辑引用对象。队列改为单调 ID并新增回归，浏览器闭环新增层级选择和 Position X durable 结果断言。精确浏览器复跑还发现 Vue 使用原始 `image` 而非本地化 `Image`，已统一用英中字典格式化资源 kind。

## 验证记录

| 命令 | 结果 |
| --- | --- |
| `pnpm vitest run packages/vue/test/workbench.test.ts` | 56/56 通过 |
| React/Vue 真实资产浏览器定向用例 | 三个 Chromium 配置，6/6 通过 |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | Core / React / Vue 通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 通过，保留既有大 chunk 提示 |
| `pnpm test` | 115 文件、951/951 通过；初次并发运行的既有 React 中文用例曾 5 秒超时，单独复跑 1/1 通过 |
| `pnpm exec vitest run --config vitest.browser.config.ts` | 12 文件、99/99 通过；保留既有 TransformControls 提示 |

首次直接运行浏览器命令因缺少 `libnspr4.so` 启动失败；使用仓库既有 Playwright 缓存路径设置 `LD_LIBRARY_PATH` 后运行。一次误转发为全量浏览器的命令暴露既有 showcase 超时，也发现 Vue kind 大小写差异；精确资产用例修正后全部通过。
