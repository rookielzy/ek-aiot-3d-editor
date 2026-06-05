---
date: 2026-06-05
topic: real-user-3d-editor-delivery-readiness
focus: "在既有 MVP、默认 Workbench、React/Vue npm 包产品化都已实现后，规划真实用户可交付前的下一阶段 3D editor 能力"
mode: repo-grounded
---

# Ideation: Real-User 3D Editor Delivery Readiness

## Grounding Context

### Codebase Context

本轮把 `docs/ideation/` 中已有三轮方向都视为已实现背景，而不是重新规划 MVP：

- `2026-05-28-threejs-3d-editor-mvp-ideation.md` 的 snapshot-first core、runtime projection、asset reference、TransformControls、Workbench、React/Vue shell、npm package 边界已经落地。
- `2026-06-03-post-mvp-3d-editor-next-stage-ideation.md` 中最核心的 `SceneNode` / `NodeId` durable hierarchy、node selection、light node、runtime picking、material/environment/light projection、project package 等基础也已经落地。
- `2026-06-04-react-vue-npm-editor-package-productization-ideation.md` 与 `2026-06-04-001-feat-default-editor-workbench-plan.md` 的 install-ready React/Vue default Workbench、CSS subpath、host fixture release verification 也已经写入当前文档与代码表面。

当前仓库已经具备：

- `SceneSnapshot.version = 4`，用 `nodes` / `rootNodeIds` 作为 canonical hierarchy、selection、transform target 和 inspector target；object/light payload map 保留为兼容面。
- GLB asset reference import、`.ek3d` project package、transient project asset store、missing asset replacement。
- OrbitControls、camera reset / frame selected / frame all、viewport pointer selection、selection visuals、TransformControls transaction。
- object-level `MeshStandardMaterial` override 与 texture slot runtime projection。
- environment/background authoring intent：solid、texture、HDR background / environment、intensity、blur、rotation，以及 PMREM runtime projection。
- ambient / directional / hemisphere / point / spot light definitions、light nodes、runtime projection、light inspector。
- React/Vue 默认 `EditorWorkbench`：toolbar、left hierarchy/assets/project/problems panel、viewport、right inspector/status、CSS subpath、fresh Vite consumer verification。

但从“真实用户拿一个复杂 GLB 场景来用”的角度看，仍有明显交付缺口：

- GLB 当前是 object-level 导入与投影，不是 decoder-aware import pipeline；`ThreeGltfLoaderAdapter` 每次创建普通 `GLTFLoader`，没有 Draco / KTX2 / Meshopt 配置、import result manifest、导入队列或导入诊断。
- Durable object 类型只有 `kind: "glb"`，GLB 内部 mesh/node 还没有进入 `SceneNode` target 体系；材质 assignment 虽然已有 `material-slot` target 类型，但 runtime `MaterialProjector` 只处理 object-level assignment。
- Workbench asset surface 主要来自 snapshot asset references 和 problems；还不是本地资产 workspace，没有批量导入、缩略图、引用位置、依赖、搜索/过滤、导入状态。
- 文档仍明确未实现框选/lasso、网格渲染、对齐辅助线、可视 snap controls、系统剪贴板、command palette、持久化 layout。
- 相机 helper 是 transient editor view；当前没有 authored camera node、camera bookmark、align view to camera、export/viewer 默认相机等 durable presentation model。
- HDR / image background 已有，但文档仍把 true cubemap skybox authoring 和更清晰 environment/background source cleanup 留作后续。
- 阴影、light helpers、shadow camera / map size controls、视觉质量 preset 和性能诊断仍未实现。
- 数据绑定、事件编排、runtime dashboard、hosted publishing 和 Le5le-style low-code runtime workflow 仍是明确 non-goals；但 EK AIoT 的长期方向最终会需要 node-level binding target 边界。

### External Context

外部资料只用于校准“成熟 3D editor 用户会默认期待什么”，不改变本项目的 snapshot-first static scene editor 身份。

- Three.js `GLTFLoader` 支持 glTF / GLB，同时可配置 Draco、KTX2、Meshopt 等扩展解码器；这支持把下一步描述为 decoder-aware import pipeline，而不是简单文件选择。
- PlayCanvas Editor 的 Assets Panel 把上传、创建、删除、inspect、搜索、过滤、拖拽到 viewport/inspector slot、引用检查作为编辑器资产基础面。
- PlayCanvas Import Hierarchy 会把模型 mesh hierarchy 导入为可编辑 entity tree，并关联 materials、textures、animations、template/container/render assets；这支持 GLB 内部层级和 material target 进入 durable target 体系。
- Three.js 提供 `GridHelper`、`SelectionBox` / `SelectionHelper`、`BoxHelper`、light helpers、camera helpers 等 primitives；这些适合做 runtime/UI projection，不应该写入 snapshot。
- Three.js shadow 文档强调 shadow map 会让投射阴影的灯光额外渲染场景，PointLight shadow 尤其昂贵；这说明阴影不能只是一个 `castShadow` checkbox，需要 helper、参数和诊断。
- Unity 类编辑器区分 Scene view 与 Camera object，并提供 align/capture 类工作流；这支持“editor view camera 继续 transient，authored camera 作为显式 node/setting”的边界。

### Past Learnings

本仓库仍没有 `docs/solutions/`，所以没有长期 solution notes 可检索。本轮可复用的高信号学习主要来自项目自身文档：

- durable state 只能在 versioned snapshot 和 `.ek3d` JSON 里，runtime-only values 不能持久化。
- runtime problems 是派生问题，不写回 snapshot。
- React/Vue shell 不能拥有 editor semantics，只能订阅、渲染、派发 core command/operation。
- Workbench extension regions 不是 core plugin API，不能把 private runtime projector 或 loader 变成 accidental public API。

## Topic Axes

- Asset/import workflow
- GLB structure and material targeting
- Viewport authoring ergonomics
- Scene presentation and visual fidelity
- Host delivery and integration boundary

## Ranked Ideas

### 1. Build a Local Asset Workspace and Decoder-Aware Import Pipeline

**Description:** 把当前“注册 asset reference / 导入 `.ek3d` / 替换缺失资产”的能力推进成真实本地 authoring workflow：资产面板支持 GLB/HDR/image/texture 批量导入、导入队列、文件状态、缩略图/预览、搜索/过滤、引用位置、依赖、缺失/失败诊断。GLB 导入管线应支持 host 配置 Draco、KTX2、Meshopt decoder，返回 import result manifest：创建了哪些 asset、是否含内嵌 texture/material/animation、有哪些 unsupported extension 或 loader warning。第一版仍是 local/project-package 优先，不做云资产库、账号、CDN、marketplace。

**Axis:** Asset/import workflow

**Basis:** `direct:` README 仍把 full asset libraries、local import queues、cloud asset storage、model marketplaces 标为后续；当前 `AssetRegistry` 只保存 reference/source，Workbench asset model 主要从 snapshot references 和 problems 派生。`external:` PlayCanvas Assets Panel 覆盖上传、创建、删除、inspect、搜索/过滤、拖拽和引用检查；Three.js `GLTFLoader` 可配置 Draco/KTX2/Meshopt decoder。

**Rationale:** 真实用户的第一步不是“已有 asset reference”，而是把本地模型和贴图拖进来、知道导入成功/失败、知道哪些资产被场景引用、知道导出 `.ek3d` 是否完整。这个方向也为后续 GLB hierarchy、material slot、reimport/remap 提供统一入口。

**Downsides:** 容易滑向完整资产管理产品。必须限制为 local/session/project package workspace，不承诺云同步、权限、模型市场或外部仓库。

**Confidence:** 94%

**Complexity:** High

**Status:** Unexplored

### 2. Make Imported GLB Internals Addressable: Hierarchy, Stable Target Keys, and Reimport Remap

**Description:** 规划 GLB authoring 的核心升级：导入时可选择把 GLB 内部 node/mesh 展开为 durable `SceneNode` targets，保留 object-level 导入作为简单模式。每个 imported child / mesh / material slot 需要 stable imported target key，用于 selection、transform、inspector、material assignment、problem reporting、reimport diff 和未来 binding target。替换或重新导入 GLB 时，不应直接丢弃用户编辑；应尝试按 node path、mesh name、parent relationship、material slot 等信息 remap，无法匹配时生成 recoverable problem。

**Axis:** GLB structure and material targeting

**Basis:** `direct:` 当前 durable object payload 只有 `kind: "glb"`，GLB 内部节点没有进入 snapshot hierarchy；README/docs 明确把 per-submesh material slot discovery、per-submesh assignment、full GLTF material graph editing 标为后续。`external:` PlayCanvas Import Hierarchy 会把模型 mesh hierarchy 导入为可编辑 entity tree，并在模型更新时用 mesh instance name + parent 判断 remap。

**Rationale:** 只把复杂 GLB 当作一个 object，很快会遇到真实使用阻断：用户无法选择模型的一部分、无法只移动一个子部件、无法只替换一个材质槽、资产替换后编辑丢失。这个方向是后续 material slot、animation preview、AIoT binding target 和 agent command proposal 的共同基础。

**Downsides:** 这是 schema/API 级别工作，复杂度高。需要避免一步做成完整 ECS、prefab/template 系统或 full GLTF editor。第一版应只支持可稳定识别的 imported node/mesh/material slot targets，并清楚定义 reimport 失败时的 problem 行为。

**Confidence:** 92%

**Complexity:** High

**Status:** Unexplored

### 3. Upgrade Material Editing From Object-Level Override to Slot-Aware Authoring

**Description:** 在 imported target keys 之上实现 material slot discovery 和 slot-aware assignment：展示 GLB 中可编辑 material slots，允许对单个 slot 或 imported mesh 使用 `MeshStandardMaterial` override / texture slot，而不是把同一 override 应用到整个 GLB object 下所有 `MeshStandardMaterial` mesh。保留 object-level override 作为快速路径，但 UI 应明确它是 broad override。第一版不做完整 glTF material graph、node material、shader editor。

**Axis:** GLB structure and material targeting

**Basis:** `direct:` `MaterialAssignmentTarget` 已经有 `{ kind: "material-slot"; objectId; slotId }` 类型，但 `MaterialProjector.project()` 目前只处理 `assignment.target.kind === "object"`；docs 明确完整子网格发现和 per-submesh assignment 未实现。`external:` Blender/Babylon/PlayCanvas 这类 3D authoring 工具都把材质槽、submesh 或 mesh instance material mapping 当作常见编辑目标。

**Rationale:** 真实模型通常有多个 mesh 和材质。object-level material override 会让“改一个按钮颜色”变成“整台设备都变色”。Slot-aware authoring 是 GLB 进入真实业务场景的核心分水岭，而且比 full material graph 更小、更符合当前 snapshot-first contract。

**Downsides:** Slot ID 稳定性和 reimport 后保留 assignment 是主要风险。需要定义 slot target 失败时如何降级：保留 durable assignment、显示 unresolved slot problem，而不是静默删除。

**Confidence:** 90%

**Complexity:** High

**Status:** Unexplored

### 4. Add Viewport Authoring Helpers: Grid/Floor, Marquee Selection, Alignment, and Visible Snap

**Description:** 把 viewport 从“可点选和拖拽”推进到“可高效编辑”：GridHelper / floor plane / axes toggle、框选/marquee selection、对齐辅助线、拖拽时 snap feedback、snap increment UI、selection bounds、hover/primary selection feedback 和状态栏摘要。所有 helper、selection rectangle、grid visibility、hover state 都是 runtime/UI state；durable snapshot 只保存 selection 和 committed transform。

**Axis:** Viewport authoring ergonomics

**Basis:** `direct:` `docs/interactions.md` 明确列出框选/lasso、网格渲染、对齐辅助线、可视 snap controls 未实现；core 已有 pointer selection、多选、snap helpers、TransformControls transaction、selection visuals。`external:` Three.js 提供 `GridHelper`、`SelectionBox` / `SelectionHelper`、`BoxHelper` 这类 primitives。

**Rationale:** 网格地面和可视吸附不是装饰，它们决定用户能不能把模型摆准、批量选择、理解空间尺度。这个方向复杂度低于 GLB 内部层级，但能显著提升编辑器“真实可用”的手感。

**Downsides:** UI 状态容易被错误持久化，或者扩张成 dockable/persisted workspace。需要坚持 helper-only runtime projection，并用 serialization tests 证明这些值不进 snapshot / `.ek3d`。

**Confidence:** 91%

**Complexity:** Medium

**Status:** Unexplored

### 5. Separate Transient Editor View From Authored Cameras and Presentation Views

**Description:** 保持 OrbitControls editor camera transient，但新增显式 authored camera / view bookmark model：用户可以从当前 editor view capture 一个 camera node 或 saved view，设置 name、projection、FOV、near/far、target、preview thumbnail/fit 行为，并支持 align view to camera / align camera to view。导出或 viewer-only runtime 可以选择默认 camera/view；普通 orbit/pan/zoom 不自动写入 snapshot。

**Axis:** Scene presentation and visual fidelity

**Basis:** `direct:` 当前 README 和 tests 明确 camera helper 是 transient，不序列化 camera/control state；用户也明确提到镜头设置缺失。`external:` OrbitControls 的 target/save/reset 是 controller state，而 Unity 类编辑器区分 Scene view 与 authored Camera object。

**Rationale:** 真实交付不只是编辑场景，还要定义用户打开场景时看到什么。显式 camera/view 让场景预览、嵌入 viewer、截图/demo、host app 默认视角都有 durable target，同时避免把每次编辑器导航噪声写进 snapshot。

**Downsides:** 需要清楚区分 editor-only view、authored camera 和 runtime viewer camera。过早做多相机剪辑、时间线或 cinematic workflow 会超范围。

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

### 6. Improve Environment/Sky and Lighting Quality With Helpers, Presets, Shadows, and Diagnostics

**Description:** 在已有 environment/background/HDR/light projection 基础上，做一个受控的 visual quality pass：更清晰的 environment source / background source / skybox authoring，基础 scene lighting presets，light helper gizmos，directional/spot target helper，shadow enablement、shadow camera helper、mapSize/bias/range controls、性能/质量 diagnostics。目标是“能把场景调得可信”，不是做完整 render suite、IES 全支持、后期管线或物理渲染产品。

**Axis:** Scene presentation and visual fidelity

**Basis:** `direct:` README 仍把 shadows、advanced light helpers、true cubemap skybox authoring 标为后续；residual schema review 曾指出 top-level environment mode 与 background mode 结构需要更清晰。`external:` Three.js shadow map 会对投射阴影的灯光额外渲染场景，PointLight shadow 尤其昂贵，因此需要 helper、参数和诊断，而不是单一 checkbox。

**Rationale:** 当前已经能设置 HDR/image background 和灯光，但真实用户会关心“为什么模型黑、为什么阴影糊、为什么很卡、背景到底是天空还是环境光”。这个方向可以沿用 runtime problem 模型，把视觉质量问题作为 derived diagnostics，而不是污染 durable state。

**Downsides:** 阴影和光照调参容易吞掉大量时间。必须限制在 directional/spot/point 的基础 shadow authoring、helpers 和 diagnostics，不做高级灯光库或 renderer preset 体系。

**Confidence:** 84%

**Complexity:** Medium to High

**Status:** Unexplored

### 7. Define the Host Delivery Boundary: Viewer Mode, Storage Adapter Recipes, and AIoT Binding Targets

**Description:** 做一次面向真实宿主应用的交付边界设计：提供 read-only / viewer-only runtime recipe、host storage adapter recipe、snapshot vs `.ek3d` 保存策略、resolver rehydration、default camera/view 使用方式，以及最小 AIoT binding target schema draft。Binding 只先定义 target metadata、host-provided value preview、problem diagnostics 和 command-safe proposal boundary，不做 MQTT/WebSocket runtime、事件编排、dashboard 发布或完整 Le5le-like 低代码流程。

**Axis:** Host delivery and integration boundary

**Basis:** `direct:` 当前 release workflow 已证明 packed package 可消费，但 README/release 仍明确 hosted publishing、data binding、event orchestration、stable 1.0 API 和 Le5le-style workflows 是 non-goals；同时 v4 `SceneNode` 已经提供 durable target identity。`reasoned:` 真实用户不仅编辑，还需要把结果保存、嵌入、预览，并最终把场景对象和业务数据连接起来。

**Rationale:** 这个方向把“真实用户可交付”从编辑器内部延伸到宿主集成，但保持边界很重要：先让 host 能保存/展示/恢复/绑定 target，后续才谈完整运行态平台。它也能帮助判断哪些 API 必须稳定，哪些仍是 experimental。

**Downsides:** 容易过早进入低代码平台、IoT runtime、发布系统和协作。必须把第一版限定为 recipes + types + diagnostics，不实现真实数据协议或 hosted runtime。

**Confidence:** 78%

**Complexity:** Medium to High

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | “补 GLB 导入”作为独立方向 | 当前已有 GLB asset reference import 和 runtime projection；真实缺口是 decoder-aware import pipeline、内部 hierarchy、material slot 和 reimport/remap。 |
| 2 | “补天空盒”作为独立方向 | 当前已有 texture/HDR background 和 environment projection；更准确方向是 environment/background source cleanup、true cubemap/skybox authoring、preset 和 diagnostics，已并入视觉质量方向。 |
| 3 | 自动持久化 OrbitControls 每次移动 | 违反当前 transient camera 边界，也会把编辑器导航噪声写进 durable state；改为显式 authored camera / view bookmark。 |
| 4 | Full cloud asset library / model marketplace | Scope overrun；当前阶段先做 local asset workspace 和 `.ek3d`/host resolver 交付。 |
| 5 | Full GLTF material graph / shader editor | Scope overrun；真实阻断先是 material slot target，不是完整材质图编辑。 |
| 6 | Animation timeline / NLE-style clip editor | 有长期价值，但会引入 render loop、clip lifecycle、timeline UI 和资源清理，早于当前交付缺口。 |
| 7 | Full hosted publishing | Scope overrun；应先有 viewer-only recipe、default camera/view、storage adapter 和 asset completeness。 |
| 8 | Jump directly to data binding / MQTT / WebSocket / event orchestration | 战略相关但过早；先定义 node-level binding target 与 host-provided preview/diagnostic 边界。 |
| 9 | Stable 1.0 API guarantee | 当前仍有 GLB hierarchy、import pipeline、material slot、viewer/storage 边界未定；1.0 过早。 |
| 10 | Full plugin ecosystem / schema-driven inspector plugins | 当前 extension regions 不是 core plugin API；先让真实 asset/GLB/viewport/camera/light workflows 成型。 |
| 11 | CAD measurement toolkit | 有用但低于 grid/snap/selection helper 的基础优先级。 |
| 12 | System clipboard and external paste formats | 有价值，但本阶段低于 local asset workspace 和 GLB authoring；可作为 asset/import workflow 后续 host adapter。 |
| 13 | Persisted dockable layout | 对专业体验有帮助，但不会先解决真实模型导入、材质槽、相机/视觉质量等阻断问题。 |
| 14 | Agent editing API | 架构上有潜力，但应等待 stable target keys、import/material targets 和 host delivery boundary 更清楚后再设计。 |

## Useful Sources

- Current README: `README.md`
- Interactions: `docs/interactions.md`
- Architecture: `docs/architecture.md`
- Schema: `docs/schema.md`
- Project package: `docs/project-package.md`
- Release workflow: `docs/release.md`
- Prior MVP ideation: `docs/ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md`
- Prior post-MVP ideation: `docs/ideation/2026-06-03-post-mvp-3d-editor-next-stage-ideation.md`
- Prior package productization ideation: `docs/ideation/2026-06-04-react-vue-npm-editor-package-productization-ideation.md`
- Default Workbench plan: `docs/plans/2026-06-04-001-feat-default-editor-workbench-plan.md`
- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Three.js DRACOLoader: https://threejs.org/docs/pages/DRACOLoader.html
- Three.js KTX2Loader: https://threejs.org/docs/pages/KTX2Loader.html
- Three.js GridHelper: https://threejs.org/docs/pages/GridHelper.html
- Three.js SelectionBox: https://threejs.org/docs/pages/SelectionBox.html
- Three.js SelectionHelper: https://threejs.org/docs/pages/SelectionHelper.html
- Three.js BoxHelper: https://threejs.org/docs/pages/BoxHelper.html
- Three.js OrbitControls: https://threejs.org/docs/pages/OrbitControls.html
- Three.js shadows manual: https://threejs.org/manual/en/shadows.html
- Three.js DirectionalLightHelper: https://threejs.org/docs/pages/DirectionalLightHelper.html
- PlayCanvas Assets Panel: https://developer.playcanvas.com/user-manual/editor/assets/asset-panel/
- PlayCanvas Import Hierarchy: https://developer.playcanvas.com/user-manual/editor/assets/import-pipeline/import-hierarchy/
- PlayCanvas Hierarchy: https://developer.playcanvas.com/user-manual/editor/interface/hierarchy/
- Babylon.js MultiMaterials: https://doc.babylonjs.com/features/featuresDeepDive/materials/using/multiMaterials
- Blender material assignment: https://docs.blender.org/manual/en/latest/render/materials/assignment.html
