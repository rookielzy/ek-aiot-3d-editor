---
date: 2026-06-03
topic: post-mvp-3d-editor-next-stage
focus: "MVP 已完成后的下一阶段 3D editor 产品与工程方向"
mode: repo-grounded
---

# Ideation: Post-MVP 3D Editor Next Stage

## Grounding Context

### Codebase context

`2026-05-28-threejs-3d-editor-mvp-ideation.md` 中的 MVP 方向，以及 2026-06-02 resume 里的本地 demo 交互验证缺口，现在基本都已完成。当前仓库已经具备：

- `@ek-aiot/3d-editor-core`：versioned `SceneSnapshot`、command/history、serialization/restore、asset resolver、`.ek3d` project package、runtime projection、viewport picking、camera helpers、TransformControls transaction、material/environment/light projection、runtime problems、shortcut/action/snap/operation helpers。
- React/Vue packages：薄适配层、`EditorViewport`、`InspectorPanel`、`EditorWorkbench`、`useWorkbench()` / composable、render prop / scoped slot extension regions。
- React/Vue proof-loop demos：camera helper、viewport/hierarchy selection、TransformControls、material inspector、hierarchy operations、`.ek3d` export/reopen、missing-asset replacement、browser-level checklist parity。
- Release surface：Changesets、tarball verification、public package boundaries、experimental `0.x` language。

本轮关键判断是：继续补“证明 MVP 可用”的工作价值开始下降。下一阶段更应该从 proof loop 走向可复用编辑器产品，但仍守住当前身份：snapshot-first static scene editor foundation，不直接跳到完整 Le5le-style 低代码平台。

Direct evidence:

- `README.md` 当前非目标包括 box/lasso selection、system clipboard formats、full asset libraries、local import queues、persisted layout、schema-driven inspector plugins、per-submesh material slot discovery、shadows、advanced light helpers、animation timelines、data binding、event orchestration、hosted publishing、Agent 集成和 stable non-`0.x` API。
- `docs/interactions.md` 说明已实现 viewport picking、多选、hierarchy operations、TransformControls、material projection、project package 和 browser demo validation；未实现项集中在框选、系统剪贴板、grid/alignment/snap 可视化、持久化快捷键/command palette、完整资产库、数据绑定和 Agent editing。
- `docs/residual-review-findings/feat-core-schema-extension.md` 留下三个结构性后续：command input DTO 不应直接复用 durable schema、GLB objects 和 lights 是否需要共享 `SceneNode`/`NodeId` 边界、environment/background source 结构需要更清晰。
- `docs/residual-review-findings/feat-runtime-capability.md` 留下 runtime loading 和 light projection 的工程后续：loader timeout / in-flight dedupe、runtime light entry 类型、runtime light objects 内部化。

### Past learnings

当前仓库没有 `docs/solutions/`，所以没有可复用 solution learning 可检索。这个空缺本身说明：项目已有较多 ideation/brainstorm/plan 文档，但还没有把解决过的问题沉淀成长期可复用的 solution notes。

### External context

外部参考只作为校准，不改变本仓库的产品身份。

- Three.js 提供 `SelectionBox` / `SelectionHelper` 这类 rectangle selection primitive，支持把 box selection 视为当前 viewport interaction 的延伸，而不是全新状态架构。
- PlayCanvas Editor 的 asset 文档显示，成熟编辑器通常把 asset panel、upload/import、folder organization、search/filter、asset inspector 和 import pipeline 作为基础 authoring surface；它的 import hierarchy 文档也把模型导入为可编辑 entity tree，且关联 materials、textures、animations 和 template。
- Three.js shadow 手册强调 shadow map 的性能和调参成本：投影阴影会让场景从灯光视角额外渲染，point light shadow 尤其昂贵，并且 shadow camera、map size、helper 需要清晰 UI 才能调好。
- Three.js animation/runtime 能力说明 `AnimationMixer` 是 animation playback primitive，但一旦引入 animation preview，就会引入时间轴、render loop、clip lifecycle 和 runtime resource cleanup 问题。

## Topic Axes

- Scene graph and authoring model
- Asset and import workflow
- Viewport editing ergonomics
- Visual fidelity and material/light workflow
- Extension/API/productization boundary

## Ranked Ideas

### 1. Establish a Shared SceneNode Model Before Bigger Features

**Description:** 把下一阶段的第一优先级放在 scene graph 合同上：评估并设计统一的 `SceneNode` / `NodeId` 边界，让 GLB object、empty group、light、未来 imported child node、未来 agent/data-binding target 能共享 hierarchy、selection、transform、metadata 和 inspector targeting 语义。不要急着把它做成完整 ECS；目标是解除当前 “GLB objects 与 lights 分离、activeLightId 只是 UI-local、grouping 没有 empty group node” 的结构性限制。

**Axis:** Scene graph and authoring model

**Basis:** `direct:` `docs/residual-review-findings/feat-core-schema-extension.md` 明确留下 “GLB objects and lights remain separate durable models” 的设计后续，并建议决定是否引入 shared `SceneNode`/`NodeId` boundary；`docs/interactions.md` 也说明当前没有 durable light selection，`activeLightId` 是 workbench-local 状态。

**Rationale:** 这是最能复利的下一步。box selection、light helpers、empty group node、imported child editing、per-submesh/material-slot targets、Agent command diff、未来数据绑定 target 都需要一个稳定目标模型。先定 scene graph，后续功能才不会各自发明 ID 和 selection 语义。

**Downsides:** 这是 schema/API 级别工作，迁移和兼容成本高。过度设计会把简单 static scene editor 拉向 ECS 或完整低代码 runtime。

**Confidence:** 93%

**Complexity:** High

**Status:** Unexplored

### 2. Build a Local Asset Workspace and Import Pipeline

**Description:** 在现有 `asset://`、resolver、`.ek3d` package 和 replacement flow 之上，规划一个本地优先的 asset workspace：asset panel、批量导入队列、资产状态、缩略图/预览、搜索/过滤、引用位置、缺失/失败诊断、GLB/HDR/texture 的 import result。先服务本地 authoring，不做 cloud library、marketplace 或账号体系。

**Axis:** Asset and import workflow

**Basis:** `direct:` README 和多个 plan 都把 full asset library、cloud asset storage、model marketplace、local import queue 标为 deferred；当前已有 `.ek3d` package、asset replacement 和 runtime problem 体系。`external:` PlayCanvas Editor asset docs 把 asset panel、upload/import、folder organization、search/filter、asset inspector 和 import pipeline 作为 editor 的基础资产管理面。

**Rationale:** 现在编辑器已经能导入和恢复资产，但还缺一个“管理多个资产并把它们放进场景”的日常工作流。这个方向能显著提高本地 demo 和真实 host integration 的产品感，同时仍然不需要进入云资产库或市场。

**Downsides:** 很容易滑向 full asset management product。需要明确第一版只做 local/session/project package 资产，不承诺云同步、权限、CDN 或 marketplace metadata。

**Confidence:** 90%

**Complexity:** Medium to High

**Status:** Unexplored

### 3. Add Viewport Authoring Helpers: Box Selection, Grid, Alignment, and Snap UI

**Description:** 把现有可交互 viewport 从“能操作”推进到“可编辑”：box/marquee selection、grid/axes/floor helper、bounding boxes、alignment helpers、可视 snap controls、transform mode/snap 状态反馈。这些都应继续是 runtime/UI transient state；真正 durable 的仍只是 selection、transform 和 command history。

**Axis:** Viewport editing ergonomics

**Basis:** `direct:` `docs/interactions.md` 明确列出 box/lasso selection、grid rendering、alignment helpers、visual snap controls、command palette UI 和 persisted shortcut config 未实现；同时 core 已经有 multi-selection、snap state、TransformControls、pointer picking 和 selection visuals。`external:` Three.js 提供 selection/helper 类 primitive，可作为实现参考。

**Rationale:** MVP 已经证明 transform transaction 正确，但用户编辑效率仍受限。这个方向风险较低、可分阶段落地，而且能让 React/Vue workbench 更像真实 3D editor，而不是 proof checklist。

**Downsides:** UI 细节会变多，测试也更偏 browser interaction。需要避免把它扩成 dockable layout、完整 toolbar framework 或持久化 workspace preference。

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 4. Deepen GLB Authoring: Import Hierarchy, Material Slots, and Per-Part Overrides

**Description:** 规划 GLB authoring 的第二层：可选择是否把 GLB 内部节点导入为 editable hierarchy、发现 mesh/material slot、支持 per-submesh 或 per-imported-node material assignment，并保留 object-level override 作为简单路径。第一版目标不是完整 GLTF material graph editor，而是让用户能编辑模型的一部分而不是整个 object。

**Axis:** Visual fidelity and material/light workflow

**Basis:** `direct:` README、`docs/interactions.md` 和 `docs/schema.md` 都把 per-submesh material slot discovery、per-submesh assignment、full GLTF material graph editing、node/shader material editor 标为后续工作；当前 runtime material projection 只是 object-level `MeshStandardMaterial` override。`external:` PlayCanvas import hierarchy 文档把模型导入为可编辑 entity tree，并关联 materials、textures、animations 和 template。

**Rationale:** 真实 GLB 往往包含多个 mesh 和材质。只支持 object-level material override 会很快遇到“改一个按钮却把整台机器改色”的问题。这个方向也会反向验证 SceneNode/NodeId 设计，因为 imported child node 和 material slot 都需要稳定 target。

**Downsides:** 复杂度高，容易进入完整 GLTF 编辑器或 material graph 编辑。必须明确 first pass 只处理可稳定识别的 MeshStandard-compatible targets，并设计好重新导入/资产替换后的 target 保留策略。

**Confidence:** 86%

**Complexity:** High

**Status:** Unexplored

### 5. Add Lighting and Visual Quality Authoring Without Becoming a Render Suite

**Description:** 在已有 environment/light projection 基础上，规划 light helpers、light selection/transform、shadow authoring、shadow camera helper、basic preset、diagnostic problems 和性能边界。先把“能看清和调好场景”作为目标，不做物理渲染套件、IES 全面支持或复杂后期管线。

**Axis:** Visual fidelity and material/light workflow

**Basis:** `direct:` README 和计划文档把 shadows、advanced light helpers、physically polished presets、RectAreaLight、IES lights、shadow-map controls 标为 deferred；当前支持 ambient/directional/hemisphere/point/spot 的 durable definitions 和 runtime projection。`external:` Three.js shadow 文档强调 shadow map 有额外渲染成本、point light shadow 特别昂贵，并且 shadow camera / map size 需要 helper 与调参。

**Rationale:** 当前场景 authoring 已有材质、环境和灯光字段，但视觉质量仍缺关键闭环。一个受控的 light-helper/shadow-diagnostic 方向能显著提升结果可信度，同时通过 problem/diagnostic 模型继续保持 snapshot-first 和 runtime-derived failure 的边界。

**Downsides:** 性能和 UX 风险都不小。阴影是典型“看起来只是一个 checkbox，实际需要多项调参”的功能；如果没有 helper 和合理默认值，很容易制造低质量结果。

**Confidence:** 82%

**Complexity:** Medium to High

**Status:** Unexplored

### 6. Stabilize the Extension and Public API Boundary for Real Consumers

**Description:** 做一次面向真实 package consumer 的 API/productization pass：command DTO 与 durable schema 解耦、public exports audit、integration recipes、consumer smoke apps、React/Vue workbench extension contract、viewer-only runtime recipe、versioning/migration guidance。目标不是 1.0 承诺，而是让 `0.x` 的实验 API 更安全、更少 accidental public surface。

**Axis:** Extension/API/productization boundary

**Basis:** `direct:` `docs/release.md` 说明三个 npm package 仍是 experimental `0.x`；`packages/core/src/public-api.ts` 已暴露大量 types/helpers；residual review 指出 command inputs 直接复用 durable schema types；README 也明确 workbench extension regions 不等于 core plugin API。

**Rationale:** MVP 后如果继续快速加功能，public API 会自然膨胀。现在做一次 contract pass，可以降低后续 scene graph、asset workflow、GLB hierarchy 和 host integration 的破坏性，也让第一个公开使用者更容易成功。

**Downsides:** 这不是最可见的产品能力，容易被误解成“只做整理”。需要把产出绑定到具体消费者路径：packed package smoke、integration recipes、明确哪些 API experimental/private。

**Confidence:** 89%

**Complexity:** Medium

**Status:** Unexplored

### 7. Prototype an Agent-Ready Command Proposal Layer

**Description:** 不做完整 Agent runtime，而是先设计一个安全的 command proposal / dry-run / preview 层：Agent 或 host 可以提交候选 commands，core 做 validation、diff summary、problem reporting、preview snapshot、accept/reject/undo。所有建议都必须经过现有 command/validation/history 路径，不能直接改 Three.js runtime。

**Axis:** Extension/API/productization boundary

**Basis:** `direct:` `docs/faq.md` 说明当前没有 Agent API、MCP server 或 host-injected Agent runtime；但本项目已经有 snapshot-first state、commands、validation、history、runtime projection 和 problems。`reasoned:` 这些正好构成 Agent 安全编辑的最低护栏：可验证、可预览、可撤销、不会序列化 runtime-only values。

**Rationale:** 这是最有“下一阶段差异化”的方向，但应该小心切入。先做 command proposal，而不是自然语言自由修改或 runtime mutation，可以把 Agent 能力绑定在当前最强的架构资产上。

**Downsides:** 仍然偏前沿，容易把团队从基础 editor authoring 拉开。它依赖 stable target model；如果 SceneNode/NodeId 未定，Agent proposal 的 target 语义会摇摆。

**Confidence:** 76%

**Complexity:** Medium to High

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | System clipboard and external paste bridge | 有用，但低于 local asset workspace 的杠杆；未来可以作为 asset/import workflow 上的一层 host adapter。 |
| 2 | Command palette and discoverability surface | 合理的 UX polish，但 command/action inventory 还会因 scene graph、asset、viewport helper 变化而调整，暂不单独优先。 |
| 3 | Preview-only runtime mode for embedding saved scenes | 对 adoption 有价值，但 public API stabilization 和 asset workflow 应先落地。 |
| 4 | Automated demo evidence capture for releases | 好的 release hygiene，但相对核心 authoring 空白，低于下一阶段 ambition floor。 |
| 5 | Separate authoring schema from command input DTOs | 重要，但应并入 “Extension/API stabilization”，不作为独立产品方向。 |
| 6 | Explicit environment/background source objects | 是真实 schema cleanup，但比 lighting/visual quality 和 API stabilization 更窄。 |
| 7 | First-class authored problems and repair commands | 有潜力，但当前只证明了 asset replacement；等 asset workspace 暴露更多真实 repair 场景后再规划。 |
| 8 | Runtime resource loading reliability pass | 工程上必须做，但最好内嵌在 asset/import pipeline 和 visual quality work 中，而非独立方向。 |
| 9 | Shared browser test matrix for editor workflows | 重要支撑工作，但不是主要产品方向；可随被选方向扩展。 |
| 10 | Package-consumer smoke apps | 好的 release support，归入 Extension/API stabilization。 |
| 11 | CAD-like measurement tools | 有吸引力，但在 grid/snap/helper 基础成熟前过宽。 |
| 12 | Debug-inspector-style extension panes | 可作为 analogy，但直接复制 inspector/plugin 体系会过早。 |
| 13 | NLE-style GLB animation timeline | GLB animation 相关性真实，但时间轴会显著扩大产品面，早于当前阶段。 |
| 14 | No new features: harden release and API only | 过于保守，会错过 MVP 后明显的 authoring 缺口。 |
| 15 | Jump directly to data binding / IoT variables | 战略上相关，但在 SceneNode target model 稳定前过早，容易重演低代码平台 scope overrun。 |
| 16 | No workbench UI: expose only primitives and let hosts build | 与当前 React/Vue workbench parity 的学习价值冲突，也会削弱 demo/product feedback。 |
| 17 | Full cloud asset library and marketplace | Scope overrun；README 和 plans 多次明确 deferred，本阶段先做 local asset workflow。 |
| 18 | Full plugin ecosystem now | Scope overrun；当前 extension regions 不是 core plugin API，缺少足够具体的第三方生命周期需求。 |
| 19 | Hosted runtime publishing | Scope overrun；需要 viewer/runtime mode、asset hosting、安全和产品分发决策，超出当前 static scene editor contract。 |

## Useful Sources

- Current README: `README.md`
- Current interactions doc: `docs/interactions.md`
- Architecture: `docs/architecture.md`
- Schema: `docs/schema.md`
- Project package: `docs/project-package.md`
- Release workflow: `docs/release.md`
- Residual schema review findings: `docs/residual-review-findings/feat-core-schema-extension.md`
- Residual runtime review findings: `docs/residual-review-findings/feat-runtime-capability.md`
- Previous MVP ideation: `docs/ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md`
- Three.js SelectionBox docs: https://threejs.org/docs/#examples/en/interactive/SelectionBox
- Three.js GLTFLoader docs: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- Three.js AnimationMixer docs: https://threejs.org/docs/#api/en/animation/AnimationMixer
- Three.js shadows manual: https://threejs.org/manual/en/shadows.html
- PlayCanvas Assets docs: https://developer.playcanvas.com/user-manual/editor/assets/
- PlayCanvas Import Hierarchy docs: https://developer.playcanvas.com/user-manual/editor/assets/import-pipeline/import-hierarchy/
