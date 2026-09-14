# React 资源导入与维护

任务：`.scratch/desktop-workbench-refresh/issues/07-react-assets.md`；父规格：`.scratch/desktop-workbench-refresh/spec.md`。前置桌面壳由 `25dfe2e` 交付；实现前基线为 `ab465e71ed13ada0265cde2eb6b5007aa66ece26`。

资源面板改为连续白色列表、细分隔线与紧凑过滤控件。导入支持文件选择、拖放、多文件及 texture/image 用途；队列保留所有文件结果，内部滚动避免挤走资源列表。队列 ID 不再依赖时间戳。搜索无结果有明确双语空态，全部引用与诊断均可读取。

替换、缺失恢复和 GLB 重导入统一按 asset ID 管理会话反馈，共享请求令牌。同一资源的操作串行执行，已过期的排队请求不再执行，较新请求等待在途请求完成后才进入 Core；不同资源可并行。较旧结果或异常不能覆盖较新状态，过滤导致行卸载也不丢失反馈。普通已注册图片/纹理/HDR 可直接替换；GLB 延续 Core reimport/remap 合约。替换重投影 runtime 并刷新问题；成功载荷登记与仍然存在的 runtime 问题分别可见，不承诺自动修复 imported targets。

队列类型、引用位置和维护状态随 locale 重解析。Vue 同步新增字典键以维持现有 parity，没有迁移 Vue UI。新增字典键触发既有宽泛联合类型的 TS2590，React/Vue 的私有 knownSectionReasonKey 返回类型收窄到实际返回的 WorkbenchMessageKey，构建和类型检查通过。没有修改 Core、公开 API、history 或 Scene Snapshot。

## 测试与视觉

沿用父规格确认的 Workbench DOM 和真实宿主浏览器边界。TDD 复现超过八个文件时结果丢失、旧 GLB 分析失败覆盖新摘要、可用图片缺少替换入口，然后修复。DOM 补充拖放 image 用途、全部引用、过滤/排序和切换后的维护反馈；既有缺失恢复与 remap 用例继续覆盖。

浏览器通过 Playwright 原生 file input 上传真正的 GLB，验证缺失恢复、runtime 实际网格、保留 asset identity 的重导入、多文件部分失败、图片替换、搜索空态、键盘焦点和 locale 切换不重建 runtime/canvas。GLB 由 GLTFExporter 生成；旧 simple-box.glb 是供假加载器使用的文本占位，不能用于真实解析验证。

对照 a9ebc22 reference 核验面板颜色、分隔、密度及三个桌面尺寸无横向溢出。截图使用真实测试方块，展示重导入产生的现有 imported-target 诊断；不作为后续示例模型切片的展示验收。截图临时调用已移除，行为与布局断言保留。

- [1440×900](screenshots/react-assets/assets-1440.png)
- [1920×1080](screenshots/react-assets/assets-1920.png)
- [1100×800](screenshots/react-assets/assets-1100.png)

Context7 未配置 key，本次使用 [React useRef 官方文档](https://react.dev/reference/react/useRef) 核对请求令牌的组件会话生命周期。

浏览器沿用本机缓存运行库：`LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu`。


## Standards

独立审查报告 2 项：一是令牌仅保护文案，Core 的旧成功操作仍可能最后提交；二是浏览器部分失败测试只查成功资产的 snapshot，未同时断言成功项可见。前者通过每个 asset 串行维护修复，并对旧分析成功/失败两种时序验证最终 payload 大小和新的 remap 目标；既有缺失替换用例也改为验证实际 payload。后者已在浏览器同时检查 reference.png 的 succeeded/Image 与 notes.txt 的 failed/诊断。无其他仓库标准违规或需单列的 smell 建议。

## Spec

独立规格审查发现 1 项：旧成功 GLB 分析能覆盖新 payload/remap，而界面仍显示新摘要。根因是 Core reimport 在分析完成后提交，UI 只在 await 返回后检查令牌不足以控制提交顺序。现将同一资源的替换、恢复和重导入统一串行执行，较旧操作无法在较新操作完成后提交；保留 Core 原有 remap 算法、问题与 history，不新增 Core API。

规范轴 2 项已修复；规格轴 1 项已修复。主代理复核具体 Core 提交位置并完成修正与验证；审查不代替实际运行测试。


## 最终验证

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run packages/react/test/workbench.test.tsx` | 审查修正后 57/57 通过 |
| 定向真实资源浏览器用例（Chromium） | 通过，含 1440×900、1920×1080、1100×800 |
| `pnpm build` | Core / React / Vue 通过 |
| `pnpm typecheck` | Core / React / Vue 通过 |
| React / Vue proof-loop `build` | 均通过，保留既有超过 500 kB chunk 提示 |
| `pnpm run test --maxWorkers=2` | 113 文件、911/911 通过，164.62s |
| `pnpm test:browser` | 9 文件实例、57/57 通过，73.75s |

初次全量单测 909/910：新增拖放测试在资产登记后过早读取仍为 importing 的队列，改为等待用户可见的 succeeded 状态。初次构建发现 TS2590，以上私有返回类型收窄后恢复。审查修正后的完整回归全部通过；保留既有 JSDOM canvas 与项目恢复期 TransformControls 日志，没有跳过测试或提高 timeout。

任务 07 五项验收全部完成。实现提交 `a22fe19`；后续提交包含审查修正及本验证记录。
