# Vue 场景层级与选择

任务：`.scratch/desktop-workbench-refresh/issues/11-vue-hierarchy.md`。审查基点：用户确认的 `78f9365`；实现提交：`5af6b12`。

## 交付行为

Vue 默认层级消费现有 Workbench hierarchy，保留 object、group、light、camera、imported 节点。搜索忽略大小写及首尾空格，命中子节点时保留祖先路径；搜索期间展开匹配路径并禁用折叠，清空搜索恢复折叠状态。没有匹配节点时显示本地化空结果。

树行支持单选，Ctrl/Meta 切换、Shift 添加、Alt 移除选择；双击先选中，再使用既有 runtime `frameSelected()`。视口点选/框选及宿主 dispatch 改变选择后，自动展开所选节点的祖先，并在搜索遮挡目标时清空搜索。树行、Inspector、状态栏与 scoped-slot 上下文消费同一 Core 选择。

搜索与折叠保存在层级组件内。切换导航仅隐藏场景区，保留组件实例；调宽、收放和 locale 不改变 editor/runtime/canvas、history 或 durable snapshot。无新增公开 API 或 schema。

层级样式沿用 React 已验收的密度：行填满可用宽度，深层缩进按面板比例约束，长名称省略但保留完整 title 和可访问名称。折叠按钮、搜索框和树行沿用工作台可见焦点。Vue 通用按钮规则排除树行与折叠按钮，避免覆盖宽度、背景和边框。

## 诊断本地化缺口

真实浏览器中文验收发现：共享 runtime object 的 imported target 已有中文标题，但详情来自原始英文 `message`。本次在 `createImportedTargetNonTransformableProblem` 补充详情 descriptor，并在 React/Vue 字典补齐 en/zh-CN。原来的诊断 ID、severity、target、message 与不能独立变换的语义保持。没有新增 Core 算法或 command 测试；通过已确认的真实宿主边界验证两侧中文详情。

Context7 因未配置 API key 不可用，响应式监听和隐藏保留行为改用 [Vue watch 官方文档](https://vuejs.org/guide/essentials/watchers.html)及[条件渲染文档](https://vuejs.org/guide/essentials/conditional.html)核对。

## 验证边界

- Vue Workbench DOM：搜索/折叠先红后绿；多选/宿主定位先红后绿；灯光/相机、locale、导航调宽和快照/history/runtime/canvas 保留。
- 既有跨框架真实宿主入口：将 React 层级用例参数化为 React/Vue，复用 GLTFExporter 生成的真实 GLB、十层分组与长名称。覆盖搜索/折叠、键盘展开与焦点、双击相机、共享目标诊断、点选/框选、多选/清除、字段同步、坐标轴变换与撤销重做。
- 两个 locale 在 1440×900、1920×1080、1100×800 下核验选择反馈；切换语言保持 history/选择/runtime。中文搜索无结果后，从画布选择 Primitive 0 会清空过滤并展开目标。点选命中 primitive，不能把 mesh 名称当成固定命中结果。
- 全量回归包含原有 Vue scoped slots、package-root public-api 和真实宿主导入/编辑/项目路径。

浏览器双击测试先证明 Vue 相机未变化，接入聚焦后通过。首轮截图发现通用按钮规则覆盖，已修复并增加树行占满可用宽度的布局断言。

## 视觉记录

原型依据：`a9ebc22` reference-1440；同场景 React/Vue 对照如下。截图场景是验收生成的蓝色立方体与真实 imported targets，非包默认场景或后续展示场景。

| 尺寸 | Vue English | Vue 简体中文 | React English 对照 |
| --- | --- | --- | --- |
| 1440×900 | [English](screenshots/vue-hierarchy/vue-1440-en.png) | [中文](screenshots/vue-hierarchy/vue-1440-zh-CN.png) | [React](screenshots/vue-hierarchy/react-1440-en.png) |
| 1920×1080 | [English](screenshots/vue-hierarchy/vue-1920-en.png) | [中文](screenshots/vue-hierarchy/vue-1920-zh-CN.png) | [React](screenshots/vue-hierarchy/react-1920-en.png) |
| 1100×800 | [English](screenshots/vue-hierarchy/vue-1100-en.png) | [中文](screenshots/vue-hierarchy/vue-1100-zh-CN.png) | [React](screenshots/vue-hierarchy/react-1100-en.png) |

已亲自查看 Vue 三尺寸及 React 1440 同场景截图，并对照原型：白色连续面板、浅灰视口、细分隔线、蓝色选择态和树行密度保持；十层分组名称可读，长 imported 名称省略显示，层级内容在左栏内部滚动。1100 下顶部工具换行、状态栏仍可达。Vue 顶部项目工具、右侧深层表单仍属于后续迁移内容，不把本切片表述为完整工作台视觉迁移完成。

复现截图：

```sh
VITE_CAPTURE_HIERARCHY=1 LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium -t 'hierarchy targets at desktop sizes'
```

截图输出到 `packages/react/test/__screenshots__/hierarchy/`；普通测试不设置 `VITE_CAPTURE_HIERARCHY`，不保存这些截图。

## 命令结果

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run packages/vue/test/workbench.test.ts` | 42/42 通过 |
| `pnpm build` | Core、React、Vue 通过 |
| `pnpm typecheck` | Core、React、Vue 通过；实现过程中定期运行 |
| React / Vue proof-loop build | 两个示例通过 |
| `pnpm test` | 114 文件，921/921 通过 |
| Chromium 定向 React/Vue 层级用例 | 2/2 通过，每项覆盖三个桌面尺寸及双语反馈 |
| `VITE_CAPTURE_HIERARCHY=1 … pnpm test:browser` | 三个 Chromium 配置，共 12 文件、90/90 通过；430.78 秒 |
| 最终 CSS 修正后的 Vue 包及示例 build | 通过 |
| `git diff --check` | 通过 |

全量单测保留 jsdom 未实现 canvas getContext 的环境提示。浏览器全量仍输出前置交付记录已有的 `TransformControls: The attached 3D object must be a part of the scene graph.`，本次未定位该全量提示来源；未将测试通过表述为控制台完全无错误。示例构建保留 Vite 大 chunk 提示。

## Standards

未发现硬性文档规范违反。UI 折叠与搜索留在 Vue 本地 ref，未进入 durable snapshot；Vue DOM 测试归本包，真实宿主测试沿用规格确认的跨框架入口。

判断性建议 1 项：**Duplicated Code（低优先级）**。React `WorkbenchHierarchy.tsx:13` 与 Vue `WorkbenchHierarchy.vue:33` 的匹配及祖先补齐算法重复，选择变化后的祖先展开亦重复。可考虑纯层级查询函数，但规格要求最小必要重构且不为 UI 改版新增专用 Core 抽象，因此不是本次必须整改项。主代理复核后保留两侧框架实现，后续修改规则时继续对称核验。

## Spec

未发现 Spec 轴问题。审查核对了全部节点种类、搜索/折叠、修饰键选择、双击聚焦、诊断本地化、三桌面尺寸真实 GLB 行为、locale 与 scoped-slot 实时上下文。React/Core 变动是对称验证与诊断展示所需，没有提前迁移后续功能。

审查计数：Standards 0 项硬性违反、1 项低优先级维护建议；Spec 0 项。
