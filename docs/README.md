# ek-aiot-3d-editor 文档

> 3D 编辑器能力栈：`@ek-aiot/3d-editor-core`（框架无关核心）+ `@ek-aiot/3d-editor-react`（React 适配层）+ `@ek-aiot/3d-editor-vue`（Vue 适配层）。

## 导航

- 项目结构：`./project-structure.md`
- 技术架构：`./architecture.md`
- Scene Snapshot Schema：`./schema.md`
- `.ek3d` 项目包与资产协议：`./project-package.md`
- 集成指南（core-only / vanilla）：`./integration-vanilla.md`
- 集成指南（React）：`./integration-react.md`
- 集成指南（Vue）：`./integration-vue.md`
- 交互与编辑能力：`./interactions.md`
- FAQ：`./faq.md`
- 维护指南：`./contributing.md`
- 设计决策：`./decisions.md`
- npm 发布流程：`./release.md`

## 快速开始（本仓库）

```bash
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

本地示例：

- React proof loop：`pnpm --filter @ek-aiot/react-proof-loop dev`
- Vue proof loop：`pnpm --filter @ek-aiot/vue-proof-loop dev`
- Vanilla proof loop：`pnpm --filter @ek-aiot/vanilla-proof-loop dev`

React/Vue 示例使用同一套本地 Toy Car、HDR、灯光和默认镜头展示场景；完整项目包可在两框架宿主间恢复。示例初始化不属于包默认值，裸 `useEditor()` / `EditorWorkbench` 仍为空。操作位置、宿主扩展区域、构建命令与资产来源见各自的 [`examples/react-proof-loop/README.md`](../examples/react-proof-loop/README.md) 和 [`examples/vue-proof-loop/README.md`](../examples/vue-proof-loop/README.md)。

浏览器相关 runtime/demo 测试：

```bash
pnpm test:browser
```

该命令使用 Vitest browser mode + headless Chromium，覆盖 runtime picking、TransformControls smoke、React/Vue proof-loop demo 的可见 checklist、层级、问题 badge 和 canvas 非空渲染 smoke，以及通过本机同源夹具执行的手动数据源 GET 请求。

新机器首次运行前需要执行 `pnpm exec playwright install chromium`。Linux CI/容器还需要 Playwright Chromium 的系统依赖；可用 `pnpm exec playwright install-deps --dry-run chromium` 查看缺失包。

发布前完整校验：

```bash
pnpm release:verify
```

## 能力概览（当前实现）

- Core：版本化 JSON Scene Snapshot、`SceneNode` / `NodeId` 层级与 target contract、命令分发、撤销/重做、订阅、序列化/恢复、runtime 挂载/销毁。
- 场景节点：GLB object node、empty group node、light node 共享层级、Transform target、选择状态和 JSON metadata；object/light payload 仍保留独立 map。
- Transform：支持 position / rotation / scale 的持久化变更；runtime 提供 node transform transaction 的 start / preview / commit / cancel 结构。
- 资产：支持 `glb`、`texture`、`hdr`、`image` 四类资产引用；真实 `File`、`Blob`、URL、纹理、cubemap、PMREM 输出只属于运行时。
- 材质：持久化一小部分 `MeshStandardMaterial` override 与纹理槽资产引用。
- 环境：持久化 lighting source、visible background source 和 skybox/cubemap authoring intent，支持 none / solid / flat image / equirectangular / HDR / cubemap source。
- 灯光：持久化 ambient、directional、hemisphere、point、spot 五类灯光定义。
- Camera views：持久化用户显式 capture 的 authored perspective camera view，并可设置默认 presentation view；普通 orbit/reset/frame camera 仍是 runtime-only。
- Runtime：core 内置 Three.js 投影层，将 Snapshot 投影为 scene、camera、renderer、对象、环境、灯光和问题列表。
- 问题：resolver、loader、PMREM、runtime、project package 等失败以结构化 problem 暴露，不写回为 runtime-only 状态。
- 项目包：实验性 `.ek3d` ZIP 容器，包含 `project.json`、`scene.json` 和 `assets/*` payload。
- 数据源：v9 顶层 `dataSources` 保存 HTTP/HTTPS 连接配置（名称、服务地址、非秘密公共头、认证引用、超时）、已保存的命名查询与设备属性映射、轮询间隔与最大年龄策略，以及对象绑定（查询、设备、参数覆盖、启停、详情字段与精度、一个属性驱动的有序状态颜色规则）；宿主凭证、请求草稿、示例 JSON、执行器、有效参数、预览状态、共享上下文、原始响应、历史值、规则匹配结果和材质覆盖只存在于运行态，默认 editor 不注入连接也不联网。`editor.getDataService()` 提供与 viewport 独立的受控请求门面，宿主通过 executor 执行真实 HTTP；预览期间相同查询/参数/配置/认证 revision 的多个对象共享一个上下文并按完成后的间隔轮询，最多 4 个请求并发、其余去重排队。`editor.getDataColorService()` 对 `MeshStandardMaterial` 应用投影拥有的颜色克隆并报告逐对象材质能力；无值、错误、过期、bad/uncertain、停用、解除和停止都恢复最新作者材质，unknown 质量仍可使用；草稿试用只在全局预览关闭时作用于一个对象，不发起请求、不保存、不产生历史。全局预览期间选择、镜头导航和数据配置编辑保持可用，变换与材质编辑在 React UI 禁用并由 core 拒绝绕过；undo/redo、restore 与导入先停止预览。React 数据工作区可把单对象/数组响应映射为标准设备属性并一次性保存查询与映射，Object inspector/查询 Bindings 可保存对象绑定与颜色规则，视口工具条手动开始/刷新/停止预览，选中对象显示字段、单位、精度、时间、质量、共享上下文和过期/认证暂停/失败等明确状态及重试入口，问题抽屉可定位数据查询、对象和字段。删除仍被对象或查询使用的配置会被拒绝并给出原因；duplicate 与粘贴会携带绑定及依赖的查询/连接配置（跨 editor 冲突时生成新 ID/名称并重写引用，不覆盖目标配置），React 显示查询/属性/参数使用位置、阻止原因与解除入口，并提示复制后的对象仍关联同一设备。
- React：`useEditor()`、`useEditorSnapshot()`、`useInspector()`、`useWorkbench()`、`EditorViewport`、`InspectorPanel`、`EditorWorkbench`；默认 Data 工作区支持连接搜索、创建、编辑、复制、删除、撤销、未保存草稿确认，以及带类型参数的手动 GET 请求测试（默认值与临时覆盖分离、运行/取消、会话内响应与配置修订标记）；Object inspector 和查询 Bindings 提供同一套设备绑定表单，视口提供手动预览与选中对象详情卡。
- Vue：`useEditor()`、`useInspector()`、`useWorkbench()`、`EditorViewport`、`InspectorPanel`、`EditorWorkbench`；可加载包含 `dataSources` 的 v9 Snapshot，并透传 host executor 到 core 数据服务；core 绑定、手动预览和详情模型可被宿主消费，Vue 数据工作区 UI 保持现状。
- 双语 Workbench：React/Vue package docs 和集成指南覆盖默认 English、内置 `zh-CN`、locale prop / `v-model:locale`、switch 控制、host translate callback、render prop / scoped slot 的 `i18n`。locale/switch/dictionary/translated copy 属于宿主或 session UI state，不进入 Snapshot 或 `.ek3d`。
- 本地 React/Vue proof-loop demo：提供同一可恢复展示场景，以及 Project menu、视口工具组、Scene/Assets/Project 左栏、Object/Environment/Scene 右栏、状态摘要和问题抽屉，用于验证 camera view authoring、selection、transform、material inspector、history、hierarchy、project package 和缺失资产恢复流程。

## 当前工作流边界

当前 proof loop 关注的是：

1. 导入或注册 GLB 资产引用。
2. 选择 object、group 或 light node。
3. 提交一次 Transform 变更。
4. 撤销/重做。
5. 序列化 Scene Snapshot。
6. 从 Snapshot 恢复等价 core/runtime 场景。
7. 在需要携带二进制资产时导出/导入 `.ek3d` 项目包。
8. 在 React/Vue 本地 demo 中通过层级、资产/问题面板、material inspector 和 checklist 验证可见状态。

## 关键约束（必读）

- Durable editor state 只存在于版本化 Scene Snapshot 中。
- 禁止把 Three.js 对象、`File`、`Blob`、object URL、已加载 texture、PMREM render target、resolver 结果、framework component state 写入 Snapshot。
- Core 是编辑行为来源；Vue/React 只负责生命周期、渲染和宿主集成。
- 持久化编辑必须通过 command：`import-glb`、`register-asset`、`select-node`、`select-nodes`、`create-group`、`set-node-transform`、`delete-nodes`、`group-nodes`、`set-material`、`set-environment`、`add-light`、`update-light`、`remove-light`、`create-camera-view`、`update-camera-view`、`delete-camera-view`、`set-default-camera-view`、data connection/query commands、`set-data-object-binding`、`delete-data-object-binding`。旧 `select-object` / `set-transform` 等 object-only 命令是兼容路径。
- Snapshot 是 JSON-compatible 记录；二进制资产通过 `.ek3d` 项目包 payload 或宿主 resolver 管理。
- runtime problem 是派生状态；除非未来新增显式恢复命令，否则不要把 resolver/loader 失败结果写回 Snapshot。
- `@ek-aiot/3d-editor-core` 是 ESM only，并直接依赖 Three.js。
- React/Vue 包是薄适配层，框架库为 peer dependency；不要在 core 中引入 React/Vue。
- 公开 API 仍处于实验性 `0.x` 阶段，不承诺 1.0 稳定性。
- React/Vue Workbench 只内置 `en` 和 `zh-CN`；不承诺额外语言、外部 locale pack、通用设置系统或持久化语言偏好。

## 当前非目标

框选/lasso、系统剪贴板集成、外部 paste 格式、完整资产库、云端资产库、模型市场、本地导入队列、持久化布局、schema-driven inspector 插件、per-submesh 材质槽发现、完整 GLTF 材质图编辑、阴影、高级辅助器、持续数据预览调度与数据驱动外观、事件编排、运行态发布、Agent 集成和稳定非 `0.x` API 都是后续工作。

## 需求与规划来源

- 初始需求：`./brainstorms/2026-05-28-core-editor-contract-requirements.md`
- MVP 方向：`./ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md`
- 计划文档：`./plans/`
