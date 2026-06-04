---
date: 2026-06-04
topic: react-vue-npm-editor-package-productization
focus: "将 packages/react 与 packages/vue 从薄适配器推进成 npm 用户可直接使用的 React/Vue 3 编辑器包"
mode: repo-grounded
---

# Ideation: React/Vue npm Editor Package Productization

## Grounding Context

### Codebase Context

当前仓库已经越过 proof loop 阶段，具备可发布的三包结构：

- `@ek-aiot/3d-editor-core`：framework-neutral `SceneSnapshot`、commands/history、validation、asset resolver、`.ek3d` project package、Three.js runtime projection、inspector model、shortcut/action/snap/operation helpers。
- `@ek-aiot/3d-editor-react`：`useEditor`、`useEditorSnapshot`、`useInspector`、`useWorkbench`、`EditorViewport`、`EditorWorkbench`、inspector components。
- `@ek-aiot/3d-editor-vue`：`useEditor`、`useInspector`、`useWorkbench`、`EditorViewport`、`EditorWorkbench`、inspector components。

当前 React/Vue 包的强点是：适配层很薄，编辑语义仍由 core 统一持有；`EditorWorkbench` 已经有 render prop / scoped slot extension regions；workbench context 已暴露 editor、snapshot、inspector、runtime/problems、selection、history、transform/snap、camera helpers、project import/export、asset replacement 和 core operations。

当前主要产品化缺口是：

- npm CSS 消费不够明确：package manifest 有 `style: "./dist/index.css"`，但 `exports` 没有 CSS subpath。
- 包只有 root export，公共 API 分层还不清楚：推荐 API、headless API、workbench API、experimental API、style API 还没有明确边界。
- React 还没有 provider/context convenience layer；Vue 还没有 plugin/install API 或官方 Pinia 接法。
- 默认 workbench 仍偏 proof-loop shell：功能可用，但 toolbar 是文本按钮，尚未明确承诺“安装后直接得到完整编辑器”。下一阶段应把默认入口定义为 batteries-included editor shell：左侧资产/层级，中间 3D viewport，右侧属性/问题面板，顶部工具栏，必要时有底部状态栏。
- 集成文档已经存在，但更像 repository integration guide，还不是“新建 Vite/Next/Nuxt 项目后直接装包”的 starter。
- SSR / browser-only 边界仍是隐含知识；Next/Nuxt 用户可能在 import、hydration 或 WebGL/runtime mount 上踩坑。

必须继续守住的架构边界：

- durable state 只在 versioned JSON `SceneSnapshot` 中。
- 持久化编辑必须通过 core commands/operations。
- Three.js objects、`File`、`Blob`、object URLs、loaded textures、PMREM outputs、resolver outputs、runtime problems 都不能序列化进 snapshot 或 `.ek3d` durable JSON。
- React/Vue 可以提供产品级 shell、状态桥接和文档，但不能把 command reducer、asset resolution、history 或 runtime cleanup 复制到 framework package 里。

### Past Learnings

本仓库没有 `docs/solutions/`，所以没有长期 solution notes 可检索；本次扩大扫描了现有 `docs/`。高信号结论：

- `docs/architecture.md` 和 `docs/decisions.md` 都指向同一原则：core owns durable state and editor semantics；React/Vue own lifecycle, rendering, subscriptions, and extension surfaces。
- `docs/integration-vue.md` 已明确 Vue 适配层要用 `markRaw` / `shallowRef` 保护 editor/runtime 边界。Pinia 可以成为宿主侧 recipe，但不应成为 Vue adapter 的必需依赖。
- `docs/release.md` 已有 tarball verification 和 consumer import checks；下一阶段应把 release workflow 从“包能发”推进到“真实宿主能装、能 import CSS、能 mount、能保存/恢复”。
- 上一份 post-MVP ideation 已经把 API/productization pass 识别为高优先级方向；现在用户明确把范围收束到 React/Vue npm package consumer success path。

### External Context

外部资料只用于校准 API 形态和生态惯例，不改变本仓库的产品身份。

- React 官方 `useSyncExternalStore` 仍是订阅外部 store 的标准 API，要求 `subscribe` 返回 cleanup，`getSnapshot` 在 store 未变化时保持稳定引用，SSR 场景需要 `getServerSnapshot`。这支持 React adapter 继续包装 core external store，而不是把 core 状态复制进 React state。
- Vue 官方 composables 文档强调 `use*` 命名、返回 refs/functions、在生命周期中注册和清理副作用。Pinia 官方 `skipHydrate()` 用于 setup store 中“不是 state 的对象”，这直接支持“Pinia 可选桥接，但 editor/runtime 必须 raw/shallow/client-only”的判断。
- Node/npm/Vite 文档都指向显式 package contract：`exports` 定义公共入口，`files` 控制 tarball 内容，peer dependencies 表达宿主框架兼容；Vite library mode 支持 CSS output，并示例用 `./style.css` export 暴露 CSS。
- tldraw、Excalidraw、React Flow、Tiptap 的共同模式是：给新用户一个极低门槛入口，同时给高级用户 headless/custom store/controlled mode。对本项目更适合的借鉴不是完整复制它们的功能，而是采用“Workbench 快速入口 + Headless 深度集成 + 明确 persistence boundary”的包装心智。

## Topic Axes

- Package consumption and public API
- Framework state integration
- Product-grade workbench UX
- Asset/project persistence workflow
- Host integration docs and verification

## Ranked Ideas

### 1. Define a Workbench + Headless Dual Consumer Contract

**Description:** 把 React/Vue 包的用户心智明确成两条路径：`Workbench` 模式用于几分钟内嵌入完整编辑器，`Headless` 模式用于宿主自己组合 UI。Workbench 路径应支持 `initialSnapshot` / `defaultSnapshot` / `snapshot` / `onSnapshotChange`、resolver、CSS import、host-owned editor handle、read-only 或 interaction options；Headless 路径则提供 provider/composable/hooks、viewport binding、selection/history/problems/commands/snapshot IO 等可组合能力。两条路径都只通过 core commands 修改 durable snapshot。

**Axis:** Package consumption and public API

**Basis:** `direct:` 当前 React/Vue 已暴露 `EditorWorkbench`、primitive viewport/inspector、hooks/composables 和 workbench context，但 README 仍把包描述为 thin adapter / proof-loop shell。`external:` Tiptap 明确采用 headless + framework integrations；tldraw/Excalidraw/React Flow 都提供低门槛 embed、snapshot/change 或 controlled/uncontrolled 心智。

**Rationale:** 这是最能改变 npm 用户第一印象的方向。现在用户必须先理解 core/editor/runtime/resolver/workbench context 才知道怎么组合；双层消费契约能让“快速可用”和“深度定制”同时成立，而不破坏 core-first 架构。

**Downsides:** 需要非常谨慎地定义 props 和事件语义，尤其是 controlled mode 与 core history/undo 的关系。做得太宽会变成 API 承诺过多；做得太窄又无法真正降低集成门槛。

**Confidence:** 94%

**Complexity:** Medium

**Status:** Unexplored

### 2. Make Exports, CSS, and Theme Tokens an Explicit Public Contract

**Description:** 做一次 package surface audit：保留 root entry 的推荐 API，同时增加明确的 CSS subpath，例如 `@ek-aiot/3d-editor-react/styles.css` 和 `@ek-aiot/3d-editor-vue/styles.css`。如果确有消费价值，再考虑小而稳定的 `./workbench`、`./headless`、`./experimental` 子入口；不要因为“看起来 tree-friendly”就暴露整个文件结构。CSS 应有 documented custom properties 覆盖尺寸、颜色、密度、focus ring、selection state、panel chrome，避免用户 deep import 或覆盖私有 class。

**Axis:** Package consumption and public API

**Basis:** `direct:` 当前 `packages/react/package.json` 和 `packages/vue/package.json` 只有 `"."` export，虽然有 `style` 字段但没有 CSS subpath；`docs/integration-react.md` / `docs/integration-vue.md` 已明确指出当前 CSS 消费依赖 bundler 读取 `style` 字段。`external:` Node package docs 将 `exports` 作为定义公共接口的机制；Vite library docs 示例把 CSS 作为 `./style.css` export；npm docs 用 `peerDependencies` 表达宿主框架兼容。

**Rationale:** 用户可用 npm 包的第一批失败通常不是业务逻辑，而是 import path、CSS、peer dependency、ESM 和 tarball shape。把这些变成显式 contract，会让后续 UI/product work 更安全，也让 `0.x` experimental 不等于“公共面随意泄漏”。

**Downsides:** 一旦新增 subpath，就会形成事实公共 API。需要避免过早暴露 `components/*`、`hooks/*`、`composables/*` 这类文件结构绑定入口。

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 3. Add Framework-Native State Bridges Without Moving Semantics Into Adapters

**Description:** React 侧增加 `EditorProvider` / `useEditorContext` 和更聚焦的 hooks，例如 `useEditorSelection()`、`useEditorHistory()`、`useEditorProblems()`、`useEditorCommands()`，内部继续基于 `useSyncExternalStore` 订阅 core。Vue 侧增加 `createEk3dEditorPlugin()` 或 app-level provide/inject convenience，同时提供 Pinia recipe 或可选 bridge：只同步 `SceneSnapshot`、dirty state、selected IDs、host project metadata 这类可序列化/可派生信息，editor/runtime 用 `markRaw`、`shallowRef`、client-only 或 `skipHydrate` 边界处理。Pinia 不应成为 `@ek-aiot/3d-editor-vue` 的硬依赖。

**Axis:** Framework state integration

**Basis:** `direct:` React adapter 已使用 external-store subscription；Vue adapter 已使用 `markRaw` / `shallowRef`，集成文档也警告不要把 core editor 深拷贝或放进 deep reactive object。`external:` React 官方 `useSyncExternalStore` 是外部 store 订阅 API；Vue composable 文档建议返回 refs/functions；Pinia `skipHydrate()` 明确适用于 setup store 中“不是 state”的对象。

**Rationale:** 用户提到 Pinia 是合理信号，但更准确的方向是“生态桥接”而非“状态所有权迁移”。这能让 React/Vue 用户按各自生态习惯组织 app，同时避免 adapter store fork core semantics 或把 runtime-only object 持久化。

**Downsides:** Provider/plugin/Pinia recipe 会增加维护面，而且很容易被用户误解为新的 source of truth。必须在类型、命名和文档里反复强调：commands/history/validation 仍在 core，framework store 只是 projection 和 host integration。

**Confidence:** 91%

**Complexity:** Medium to High

**Status:** Unexplored

### 4. Upgrade the Default Workbench From Proof-Loop Shell to Product-Grade Editor Shell

**Description:** 把默认 `EditorWorkbench` 从“证明所有能力可触达”推进到“安装后直接可用的完整编辑器”。默认布局应是 editor-native shell：顶部工具栏承载 undo/redo、选择、transform mode、snap、camera、导入/打开/保存/导出等高频操作；左侧栏承载 assets、scene hierarchy、project/package 状态；中间是 3D viewport 和必要 overlay；右侧栏承载 transform、material、environment、light、problems 等属性面板；底部状态栏显示 runtime/project problems、dirty state、selection summary 和加载状态。React render props / Vue scoped slots 继续作为替换区域，但用户不写自定义 UI 时也应能完成 import asset、select、transform、undo/redo、inspect/edit properties、replace missing asset、save/export、restore 的完整基础流程。

组件库策略也应纳入这个方向，而不是后置实现细节：React 侧可评估 Radix/shadcn-style primitives、Ant Design、Mantine、React Aria 等路线；Vue 侧可评估 Element Plus、Naive UI、Ant Design Vue、Arco Design Vue 等路线。选型目标不是追求“生态热门”，而是满足 editor shell 的具体控件需求：resizable panes、tree/list、upload/dropzone、form controls、tabs、menus/popovers/tooltips、toast/dialog、keyboard/focus/accessibility、theme tokens、dark mode、bundle impact、SSR/client-only 兼容和 CSS 隔离。组件库如果成为 package hard dependency，会影响宿主包体和视觉风格；因此应优先评估“内部 wrapper + 明确 theme contract”或“可替换 UI primitives”，避免把第三方组件库 API 泄漏成 `@ek-aiot/*` 的公共 API。

**Axis:** Product-grade workbench UX

**Basis:** `direct:` 当前 `EditorWorkbench` 已有 toolbar、sidePanel、viewportOverlay、status extension regions，但默认 toolbar 仍是文本按钮组，README 也把 workbench 叫做 compact shell。`external:` Ant Design 定位于 enterprise-class web applications，提供高质量 React components 和主题能力；Radix Primitives 强调 accessibility、customization、developer experience；Naive UI 是 Vue 3 component library，Arco Design Vue 也是 Vue 3 UI library。这些都说明 React/Vue 生态已有可复用 UI 基础，但是否作为依赖必须结合本包的 editor shell 边界评估。`reasoned:` npm 用户会先体验默认 UI，再决定是否深度定制；默认 shell 如果像测试夹具，就会削弱 package adoption。

**Rationale:** 这是用户可见价值最高的方向。公共 API、Pinia recipe、release verification 都是在降低失败率；产品级 workbench 则直接让包成为“安装即可用的编辑器”，而不是一组需要宿主自行拼装的 primitives。

**Downsides:** UI polish 会引入 CSS contract、accessibility、responsive layout、组件库依赖和 browser tests 的成本。三栏布局也容易滑向 dockable/persisted workspace、完整 design system 或 plugin framework；第一版应保持固定但可替换的 editor layout，不承诺复杂停靠布局。

**Confidence:** 88%

**Complexity:** High

**Status:** Unexplored

### 5. Introduce a Project Persistence and Asset Lifecycle Contract

**Description:** 在 core 已有 `serialize()` / `exportProject()` / `importProject()` / `replaceAsset()` 基础上，给 React/Vue package consumer 一个清楚的项目生命周期接口或 recipe：open, save, autosave, export, restore, missing asset replacement, resolver rehydration, dirty state, import/export failure reporting。`onSnapshotChange` 应只发 durable snapshot 和少量命令/dirty metadata；`.ek3d` recipe 应说明何时保存 snapshot JSON、何时导出 project package、何时只保存 host asset references。可以借鉴 `persistenceKey` 的低门槛体验，但不能把 asset payload 与 runtime object 混进 snapshot。

**Axis:** Asset/project persistence workflow

**Basis:** `direct:` core 已有 `.ek3d` project package 和 asset replacement flow，`docs/project-package.md` 明确说明 snapshot 不保存二进制资产，resolver output/object URL/loaded texture 不写入 snapshot。`external:` tldraw persistence 文档把自动本地持久化、manual snapshots、document/session 分离和 schema migration 作为 editor SDK 的核心采用路径。

**Rationale:** 真正安装到业务项目后，用户很快会问“怎么保存项目、怎么恢复资产、刷新后怎么回来”。如果没有官方 recipe，用户最可能犯的错就是把 `File`、object URL、runtime problem 或 resolver result 误当作 durable state。

**Downsides:** 持久化接口很容易被误读成后端/云同步承诺。必须把范围限制在 local-first 和 host-provided storage adapter，不承诺 cloud asset library、marketplace、collaboration 或 hosted publishing。

**Confidence:** 90%

**Complexity:** Medium to High

**Status:** Unexplored

### 6. Build a Host Compatibility Matrix and Executable Starter Recipes

**Description:** 在 release verification 里增加真实宿主矩阵：Vite React、Vite Vue、Next client component、Nuxt client-only、Vue + optional Pinia。每个 fixture 都从 packed tarball 安装，而不是 workspace source；至少验证 package exports、CSS subpath import、peer dependency shape、SSR/client-only boundary、mount default workbench、执行一个最小 edit、serialize/restore。对应的 starter recipes 应成为文档入口，而不是只在 CI 中存在。

**Axis:** Host integration docs and verification

**Basis:** `direct:` `docs/release.md` 已有 pack all publishable packages 和 consumer import checks，但当前文档仍说 React/Vue integration guide 需要宿主自行处理 CSS、resolver、lifecycle 和 runtime boundary。`external:` npm/Node/Vite packaging 文档都表明 package shape、exports、CSS output 和 peer dependency 是真实消费路径的一部分；React/Vue editor package 还额外面临 SSR 与 browser-only runtime 的边界。

**Rationale:** “用户可以直接下载使用”不能只靠 README 断言，必须由 packed package 在真实 host app 中证明。这个矩阵会把很多支持问题提前转化成 CI 回归：CSS path、exports、Next/Nuxt import、Three/WebGL client-only、peer range、type declarations。

**Downsides:** 会增加 CI 时间和 fixture 维护成本。Next/Nuxt 版本变化也可能让验证不稳定，需要把矩阵控制在推荐路径，而不是承诺覆盖所有宿主框架变体。

**Confidence:** 93%

**Complexity:** Medium

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Make Pinia a required Vue package dependency | 违反 thin adapter 边界，也会诱导用户把 editor/runtime 放进 store；Pinia 应作为可选 recipe 或 bridge。 |
| 2 | Create a separate Pinia package immediately | 方向有价值，但现阶段先用 documented recipe 或 optional subpath 验证需求，独立包过早。 |
| 3 | React Provider as the main idea | 有用，但单独太窄；并入 framework-native state bridges。 |
| 4 | Vue plugin/install API as the main idea | 有用，但单独太窄；并入 framework-native state bridges。 |
| 5 | CSS export only | 必须做，但低于下一阶段 ambition floor；并入 package exports / CSS / theme contract。 |
| 6 | Export every component/hook/composable as subpaths | 可能造成 accidental public surface；应先做小而明确的 public API 分层。 |
| 7 | `persistenceKey` only | tldraw 类比有价值，但本项目有 `.ek3d` 和 asset payload 边界，单一 local key 过窄且可能误导。 |
| 8 | SSR-safe entry points as standalone direction | 重要，但更适合并入 package contract 与 host compatibility matrix。 |
| 9 | Public starter examples only | 有价值，但如果不接入 packed-tarball verification，容易再次变成 demo；并入 host matrix。 |
| 10 | Host fixture matrix only | 很重要，但不是产品能力本身；保留为第 6 个方向，服务前五个方向的可信度。 |
| 11 | Full plugin ecosystem | Scope overrun；当前 extension regions 不是 core plugin API，也缺少第三方 lifecycle 需求。 |
| 12 | Cloud asset library / model marketplace | Scope overrun；README 已明确 deferred，本阶段只处理 host/local project persistence。 |
| 13 | Hosted runtime publishing | Scope overrun；需要 viewer/runtime、asset hosting、安全和分发策略，不属于 React/Vue npm package productization。 |
| 14 | Stable 1.0 API guarantee | 过早；更合理的是定义 0.x public tiers、experimental surfaces 和 migration guidance。 |
| 15 | Move command/history into React or Vue state stores | 破坏 core-first 架构；framework store 只能订阅/投影/派发，不拥有编辑语义。 |
| 16 | No default workbench, only primitives | 会降低可安装包的第一成功率；保留 headless path，但默认 workbench 必须更完整。 |
| 17 | Immediately hard-code one React and one Vue component library as public API | 组件库能提升默认体验，但若把第三方组件 API 暴露为公共契约，会增加迁移成本；应先用内部 wrapper / theme contract 隔离。 |

## Useful Sources

- Current README: `README.md`
- Architecture: `docs/architecture.md`
- React integration: `docs/integration-react.md`
- Vue integration: `docs/integration-vue.md`
- Project package: `docs/project-package.md`
- Release workflow: `docs/release.md`
- Prior post-MVP ideation: `docs/ideation/2026-06-03-post-mvp-3d-editor-next-stage-ideation.md`
- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- Vue composables: https://vuejs.org/guide/reusability/composables
- Pinia `skipHydrate`: https://pinia.vuejs.org/api/pinia/functions/skipHydrate.html
- Node package `exports`: https://nodejs.org/api/packages.html
- npm `package.json`: https://docs.npmjs.com/files/package.json/
- Vite library mode and CSS export: https://vite.dev/guide/build.html
- Radix Primitives: https://www.radix-ui.com/primitives/docs
- Ant Design React: https://ant.design/docs/react/introduce/
- Naive UI: https://www.naiveui.com/
- Arco Design Vue: https://github.com/arco-design/arco-design-vue
- tldraw persistence: https://tldraw.dev/docs/persistence
- Excalidraw component API: https://excalidraw-excalidraw.mintlify.app/api/excalidraw-component
- React Flow uncontrolled flow: https://reactflow.dev/learn/advanced-use/uncontrolled-flow
- Tiptap overview: https://tiptap.dev/docs/editor/getting-started/overview
