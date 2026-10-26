# HTTP 数据源管理与 3D IoT 数据绑定：实践调研

调研日期：2026-10-25。范围：HTTP 优先的数据接入、数据规范、运行时更新和 3D 场景绑定。本文是研究与设计建议，不是已经批准的规格或架构决策，也不涉及实现。

## 结论

建议采用“连接 → 查询 → 数据映射与校验 → 业务属性 → 场景绑定”的分层设计。HTTP 是首个连接器，3D 对象消费稳定的业务属性，不直接消费某个接口的任意 JSON 路径。

用户提出的“统一输出规范”很有价值，但规范首先应约束编辑器内部的数据契约。新开发的后端可以直接遵循推荐格式；已有接口通过字段映射适配，不应把所有服务先改成统一响应包装作为接入前提。这是从 Grafana 的统一 DataFrame、Infinity 的字段映射和 ThingsBoard 的转换器归纳出的设计建议。[Grafana DataFrame](https://grafana.com/developers/plugin-tools/key-concepts/data-frames)、[Infinity 查询编辑器](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/query/)、[ThingsBoard HTTP Integration](https://thingsboard.io/docs/user-guide/integrations/http/)

没有一款产品可以直接等同于本项目的最佳方案。更适合组合借鉴：Appsmith 的 HTTP 配置体验、Grafana Infinity 的映射、ThingsBoard 的设备与测点语义、TwinMaker 的 3D 绑定方式，以及 DataV 的可视化适配流程。

## 产品对比：事实与可迁移做法

| 参考 | 官方文档确认的做法 | 对本项目的启发 | 适用边界 |
| --- | --- | --- | --- |
| Grafana / Infinity | 数据源实例共享连接配置；查询配置提取根节点和有类型的字段；查询结果归一为 DataFrame。[连接配置](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/configure/)、[查询编辑器](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/query/)、[DataFrame](https://grafana.com/developers/plugin-tools/key-concepts/data-frames) | 将连接、查询、输出结构分开；先统一内部结果，再供展示消费 | 面向观测与分析；不必照搬完整表格/时序框架 |
| Appsmith | Authenticated API 共享 base URL、认证、headers；query 定义具体请求；绑定可引用运行时输入；执行支持手动、页面加载和依赖变化。[认证 API](https://docs.appsmith.com/connect-data/reference/authenticated-api)、[REST API](https://docs.appsmith.com/connect-data/reference/rest-api)、[代码绑定](https://docs.appsmith.com/write-code/overview)、[执行设置](https://docs.appsmith.com/connect-data/reference/query-settings) | HTTP 编辑器应先配置可复用连接，再创建命名查询；区分取数与事件触发 | JavaScript 能力强；本项目首期不必开放任意脚本 |
| ThingsBoard | alias 解析一个或多个实体；widget 选择 alias 与数据键；最新值、时序和控制属于不同用途。[实体别名](https://thingsboard.io/docs/user-guide/aliases/)、[仪表盘](https://thingsboard.io/docs/user-guide/dashboards/)、[最新值/时序示例](https://thingsboard.io/docs/getting-started/2/) | 用实体标识和属性键表达业务身份；最新状态展示与历史查询分开 | 完整 IoT 平台包含存储、规则引擎等，不宜整体搬入编辑器 |
| AWS IoT TwinMaker | 外部数据通过组件属性及 connector 接入；场景 Tag 选择 EntityID、ComponentName、PropertyName 并应用视觉规则。[组件类型](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/twinmaker-component-types.html)、[连接器接口](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/data-connector-interfaces.html)、[场景 Tag](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/scenes-editing-add-tags.html) | 3D 场景绑定的是业务属性；HTTP 地址不应成为场景对象的业务身份 | AWS 采用托管服务和 Lambda，不等于本项目必须引入云平台或知识图谱 |
| 阿里云 DataV-Board | 查看响应结果，再通过字段映射/过滤器得到适配数据；映射无需修改源字段；受控模式和自动轮询分别配置。[组件数据源配置](https://www.alibabacloud.com/help/zh/datav/datav-7-0/user-guide/widget-data-source-configuration) | 提供“原始响应 → 映射 → 适配结果 → 画布效果”的完整反馈；明确刷新由谁触发 | 示例以图表为主，3D 绑定仍需补充对象目标和运行时投影 |

### 1. 连接和查询应分开

Appsmith 的共享 API 配置与具体 REST query、Infinity 的数据源实例与查询，都体现了这一分层。一个后端可能有设备列表、设备最新值、设备历史、设备控制等多个接口，认证和地址应该复用。[Appsmith Authenticated API](https://docs.appsmith.com/connect-data/reference/authenticated-api)、[Appsmith REST API](https://docs.appsmith.com/connect-data/reference/rest-api)、[Infinity 配置](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/configure/)

本项目建议：连接保存服务地址、认证引用和执行方式；查询保存相对路径、请求参数、输出映射和更新策略。用户仍然可以通过一个向导完成，不必在初次接入时理解所有内部层次。

### 2. 兼容现有接口，通过映射形成稳定结果

Infinity 提供 Root selector 选择嵌套数据数组，再通过 Columns 定义输出字段及类型。Grafana DataFrame 进一步让不同来源共用有类型的字段和元数据。这说明“统一内部结果”与“接受不同外部结构”可以同时成立。[Infinity JSON 映射](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/data-formats/json/)、[Grafana DataFrame](https://grafana.com/developers/plugin-tools/key-concepts/data-frames)

ThingsBoard HTTP Integration 使用 uplink converter 将入站数据转换为设备、telemetry 和 attributes，并提供测试输入、输出和事件检查。这是转换与调试的参考；其 HTTP Integration 是 PE/Cloud 功能，方向是接收设备或服务的 POST 推送，并非本项目计划中的主动 HTTP 拉取。[ThingsBoard HTTP Integration](https://thingsboard.io/docs/user-guide/integrations/http/)

本项目建议：首期提供可视化字段路径、类型、时间单位和简单数值换算；将“字段不存在”“null”“类型错误”和“真实值为 0”分别处理。复杂数组重组、脚本和跨接口聚合可以后置。不要把某一 JSONPath 库的全部语法写进首版产品承诺。

### 3. 3D 绑定应复用业务身份

ThingsBoard alias 可以静态引用设备，也可以根据 dashboard 状态动态解析实体。TwinMaker Tag 则以实体、组件、属性选择数据，并通过规则影响外观；annotation/overlay 可以引用命名绑定显示数值。[ThingsBoard alias](https://thingsboard.io/docs/user-guide/aliases/)、[TwinMaker Tag](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/scenes-editing-add-tags.html)、[TwinMaker 场景增强编辑](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/scenes-ee.html)

本项目建议采用稳定的 `sourceId + entityId + propertyKey`，必要时再增加组件层级。`sourceId` 提供业务来源命名空间，避免两个服务都返回 `device-1` 时发生碰撞；其身份应跨连接地址调整保持稳定。模型名称用于显示，编辑器节点 ID 用于定位场景目标，业务实体 ID 用于定位设备；三者分别维护。这样换接口或重命名模型时，绑定有明确的修复路径。首期可以先用轻量“来源 + 实体标识 + 属性”，不要求建立完整设备管理系统。

### 4. 刷新、响应、命令是不同的事情

Appsmith 将 query 执行分为手动、页面加载、依赖变化，并提醒自动执行加事件执行可能产生重复请求。DataV 也分别提供受控模式和自动轮询。这些是首期运行时调度的直接参考。[Appsmith Query Settings](https://docs.appsmith.com/connect-data/reference/query-settings)、[DataV 数据源配置](https://www.alibabacloud.com/help/zh/datav/datav-7-0/user-guide/widget-data-source-configuration)

本项目建议读取默认按查询调度，而不是每个 3D 对象自行轮询；相同查询和参数应共享一次请求及结果。支持取消、超时、过期响应丢弃、重试退避、暂停/恢复，并限制更新频率。网络请求不能跟随渲染帧率。这些是本项目建议，并非上述所有产品都有完全相同实现的声明。

查询的业务读写语义需要独立于 HTTP method：已有服务可能用 POST 完成只读搜索，但不能因此自动把所有 POST 当成安全查询。建议只对已明确只读、可幂等重试的操作启用自动重试，其他操作显式触发；轮询也必须要求明确的读取语义。

写入与设备控制应作为独立的外部控制操作：显式事件触发、请求参数校验、执行中状态、结果反馈、权限和重复提交策略；不能随着属性重新求值自动发送。外部控制操作不同于仓库中修改 Snapshot 的编辑 command。可以先实现点击选中、打开信息面板等本地交互，再扩展外部控制。WoT 将 Properties、Actions、Events 分开，提供了这一语义区分的标准参考。[W3C WoT Thing Description 1.1](https://www.w3.org/TR/wot-thing-description/)

### 5. 测试连接不能代替验证可用数据

Grafana 的 `testDatasource` 是连接健康检查；Infinity 特别说明其自定义 health check 只检查 HTTP 200，不检查内容。ThingsBoard converter 测试则展示转换输入和输出。因此，本项目应把连接测试、实际查询、数据校验、绑定预览作为不同反馈层。[Grafana 数据源插件教程](https://grafana.com/developers/plugin-tools/tutorials/build-a-data-source-plugin)、[Infinity health check](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/configure/#health-check)、[ThingsBoard converter 测试](https://thingsboard.io/docs/user-guide/integrations/http/)

建议向导顺序：配置服务 → 配置请求 → 运行测试 → 查看原始 JSON → 映射属性 → 查看类型/单位/时间与错误 → 预览绑定 → 保存。单纯显示“连接成功”不足以保证能够驱动场景。

### 6. 秘密和网络执行应独立于场景文件

Grafana 将普通配置与 `secureJsonData` 分开：后者保存到服务端后加密，浏览器不能重新读取秘密；外部认证请求通过代理或插件后端完成。Infinity 文档明确其 API 请求由 Grafana server 发出，因此它的 Frontend parser 不代表浏览器直连。[Grafana 数据源认证](https://grafana.com/developers/plugin-tools/create-a-plugin/extend-a-plugin/add-authentication-for-data-source-plugins)、[Infinity 网络配置](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/configure/#network-settings)

本项目建议场景仅保存连接配置和凭证引用。SDK 的宿主提供执行器、凭证解析和网络访问能力；产品如果需要共享凭证、内网连接和统一控制，再提供服务端网关。不能把可导出的场景 JSON 当作秘密存储。具体执行模式需要结合本项目的交付形态确认。

## 建议的首期数据契约

下面是本项目建议的“最新属性值”内部模型示意，不是 HTTP 响应必须返回的包装，也不是照搬某家厂商的协议。

```ts
type LatestPropertySample = {
  sourceId: string;          // 稳定的来源命名空间
  entityId: string;
  propertyKey: string;
  value: number | string | boolean | null;
  observedAt: string | null; // UTC ISO 8601；源端没有时间就为 null
  receivedAt: string;        // 编辑器收到结果的时间
  sourceQuality: "good" | "uncertain" | "bad" | "unknown";
};
```

属性定义单独保存 `type`、`unit`、显示名、枚举/范围、可空性；运行时另外维护请求状态、错误和新鲜度。`sourceQuality` 来自源端或明确的转换规则，没有提供时使用 `unknown`，不能因为 HTTP 成功就推断设备测量质量良好。缺少 `observedAt` 时，`receivedAt` 只能证明接收时间，不能证明传感器采样时间。离线也不能由一次 HTTP 超时直接断定。

新鲜度可根据接收时间和配置的最大年龄判断，并在源时间存在时额外判断测量数据年龄。请求错误、空结果、过期、源端质量差应分别呈现。保留上一成功值时，应同时显示失败/过期状态，不能把旧值继续当成实时值。以上均为本项目建议。

对象/数组可以继续作为映射阶段的输入；面向场景的首批属性保持标量，足以支持温度文本、运行状态、告警颜色等。历史时序需要时间范围、顺序、分页和聚合等额外契约，不宜用最新值数组含糊兼容。TwinMaker 的历史连接器包含时间范围、属性引用、时间/值及分页，说明两者需求不同。[TwinMaker connector interfaces](https://docs.aws.amazon.com/iot-twinmaker/latest/guide/data-connector-interfaces.html)

## 标准选型的作用

| 标准 | 可解决的问题 | 不会自动解决的问题 | 建议 |
| --- | --- | --- | --- |
| OpenAPI | 描述 HTTP 路径、操作、参数、请求/响应和安全方案。[规范](https://spec.openapis.org/oas/) | 不能自动判断哪个字段是设备身份、单位、测量时间或应绑定什么场景属性 | 后续用于导入 API；首期手工配置同样有效 |
| JSON Schema | 描述类型、对象属性、必填与校验约束。[入门](https://json-schema.org/learn/getting-started-step-by-step)、[对象校验](https://json-schema.org/understanding-json-schema/reference/object) | 不负责轮询、凭证、设备语义或渲染 | 用于输出校验；不要把单次样本自动推断当成长期契约 |
| W3C WoT TD 1.1 | 区分属性、动作、事件，并描述数据 schema、安全信息和交互 forms。[W3C Recommendation](https://www.w3.org/TR/wot-thing-description/) | 不直接提供本项目的管理 UI 或 3D 绑定实现 | 借鉴语义，首期不承诺完整 TD 导入和协议兼容 |

## 建议的 MVP 与后续范围

第一期目标是证明一条完整链路：接入一个现有 HTTP JSON 接口，映射出若干设备属性，在场景中绑定展示；错误可诊断，场景可导出并恢复配置。

| 范围 | 建议首期包含 | 后续扩展 |
| --- | --- | --- |
| 数据源管理 | 列表、新建、编辑、复制、连接测试、使用位置与删除引用检查 | 团队权限、环境管理、审计与发布流程 |
| HTTP 接入 | GET；确有需求时提供明确标为只读查询的 POST；路径/查询参数/JSON body；超时；凭证引用；宿主执行接口 | OAuth 完整流程、分页取全量、更多格式和协议 |
| 数据映射 | 原始 JSON 预览；实体 ID、字段、类型、单位、可选源时间；简单转换；校验结果 | 任意脚本、跨源 join、复杂数据管线 |
| 更新 | 手动运行、可控轮询、同查询共享、取消、错误/过期状态 | WebSocket、SSE、MQTT、历史回放与服务端缓存 |
| 3D 闭环 | 一个文本/信息展示目标和一个受控视觉目标；例如温度文本、状态颜色 | 大范围属性绑定、动画、事件流程编辑器 |
| 交互 | 点击对象查看当前数据；预留独立控制操作模型 | 外部写入、设备控制、命令回执和权限 |
| 持久化 | 连接/查询/映射/绑定描述；恢复时重新解析凭证并获取数据 | 独立的数据历史服务 |

实时结果、请求状态、计时器、订阅、凭证解析结果与场景的持久化配置分开；样本不会因为具有 JSON 结构就自动进入 durable snapshot。恢复场景后先呈现未加载状态，再获取当前值。这是本项目建议，并遵循仓库已有的持久化边界。

一旦首期加入设备控制，就需要把它作为独立范围设计并验收。不能因为 HTTP 编辑器能填写 POST，就默认完成了设备控制能力。

## 与当前仓库的结合

以下是对当前代码与架构文档的核对，以及据此提出的设计建议；不代表已新增这些 API。

| 当前事实 | 对新功能的约束与建议 |
| --- | --- |
| `SceneSnapshot` 当前为 v8，没有数据源、查询或 IoT 绑定字段。[源码](../../packages/core/src/snapshot/types.ts) | 正式实现时应设计有类型的版本化配置及 migration，并校验引用关系；不要长期把完整功能藏进不受约束的 `metadata` |
| D1/D2 规定 durable state 归 Snapshot，持久化编辑通过 command；D3/D6 规定运行时投影与问题不写回。[设计决策](../decisions.md) | 增删改连接、查询、映射、绑定是可撤销的编辑；执行请求、刷新数值和控制设备不进入编辑 history。撤销绑定配置也不应向物理设备发送反向命令 |
| `ImportedGlbTargetBindingDescriptor` 已有 `nodeId`、`ownerObjectId`、`importKey`、可选 `slotKey`，但它描述几何目标身份，并非物联网数据绑定。[源码](../../packages/core/src/imported-targets/types.ts) | 新绑定需要独立表达“业务属性引用 → 场景目标属性/显示规则”；复用已有稳定目标身份和重导入 remap 机制，不以 Three.js UUID、数组位置或模型名称作为持久化目标 |
| `ThreeObjectMap` 解析节点到运行时对象；`SceneProjector` 和 `MaterialProjector` 已负责 Snapshot 的场景/材质投影。[目标表](../../packages/core/src/runtime/three-object-map.ts)、[场景投影](../../packages/core/src/runtime/scene-projector.ts)、[材质投影](../../packages/core/src/runtime/material-projector.ts) | 实时颜色/可见性等应有明确的运行态覆盖层与优先级；禁用预览或解除绑定后恢复 authored 基线。不能仅从 UI 改材质，导致下一次 Snapshot 投影覆盖实时结果或污染共享材质 |
| `Editor` 已有独立订阅、runtime 挂载和 `dispose()` 生命周期。[Editor API](../../packages/core/src/editor/editor-api.ts) | 数据运行时需要自己的结果订阅与停止路径，避免借助 Snapshot 订阅广播每个样本；停止时取消请求、轮询和订阅，配置变化后丢弃旧响应 |
| 当前 `ProblemTarget` 尚无数据源、查询、数据绑定目标。[问题类型](../../packages/core/src/problems/types.ts) | 可以沿用结构化 problem 的方向，但实现时仍需新增定位信息和诊断语义，区分连接、响应解析、字段校验、缺失目标与过期数据；对鉴权失败等敏感信息脱敏 |
| D7/D8 要求 React/Vue 为薄适配层，框架无关模型由 core 提供。[设计决策](../decisions.md)、[架构](../architecture.md) | 查询校验、映射、刷新语义和绑定规则共享；React/Vue 分别渲染面板。宿主请求执行接口可以参考资产 resolver 的依赖注入边界，但不复用资产解析结果或将实时数据当作资产 |

推荐首条验收链路：配置一个设备列表/状态接口 → 在预览中把源字段映射为 `pump-01.temperature`、`pump-01.running` → 选中现有节点绑定信息展示及状态颜色 → 开启预览并观察刷新 → 模拟超时/字段缺失并显示诊断 → 停止预览恢复原场景 → 导出/恢复配置并重新连接。保存、撤销与恢复验证针对配置；实时样本不成为项目历史。

这与现有 Snapshot-first、runtime projection 和薄适配层方向相容，不需要推翻已有决策。新增数据域、执行器接口和运行态覆盖规则仍需要后续规格明确；本次不创建 ADR 或实现任务。

## HTTP 执行与边界核验

- **读取与重试**：RFC 9110 区分安全方法与幂等方法，限制在无法确认幂等语义时自动重试非幂等请求。因此，“HTTP 编辑器支持 POST”不足以决定是否轮询或重试；需要明确查询/控制意图与重试策略。[RFC 9110 §9.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2)
- **浏览器直连**：跨域读取受到 Fetch/CORS 约束；携带浏览器凭证的跨域响应不能使用通配的允许来源。浏览器直连适合源服务明确支持的公开接口或用户会话；需要保密的服务端凭证不能靠前端字段隐藏解决。[WHATWG Fetch：CORS](https://fetch.spec.whatwg.org/#http-cors-protocol)
- **宿主网关**：若服务端代用户访问可配置地址，应验证允许的协议、目标主机/端口和实际解析地址，并处理重定向与 DNS 变化，防止变成任意网络访问代理。IoT 内网接入应由部署方显式授权目标网络；不应为了防护而一刀切禁止合法私网设备。[OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- **SDK 的职责**：建议先提供可替换的请求执行边界，由宿主选择浏览器直连或受控服务端网关；场景保存可移植配置及凭证引用，宿主在执行时解析。服务器的用户/租户鉴权、访问范围和速率限制不能由客户端配置代替。这是结合上述标准与当前 npm 包交付方式提出的建议，并非引入完整后端产品的承诺。

## 进入规格前需要确认的问题

1. 产品主要服务应用开发者，还是完全不写代码的业务人员？决定表达式能力、默认向导与错误信息的深度。
2. 后端服务主要可由浏览器访问，还是依赖内网/私网及共享凭证？决定首期必须由谁提供请求执行器。
3. 第一条场景闭环是最新状态监控、历史回放还是设备控制？建议优先最新状态监控。
4. 规模与时效目标是什么：几十台设备每 5 秒刷新，还是上万测点亚秒级更新？这会改变批量请求与调度设计。
5. 配置属于每个场景还是宿主项目共享？导出恢复时，连接 ID 与凭证引用如何跨环境重新绑定？
6. 首期绑定目标是什么：标签/信息面板、材质颜色、可见性还是变换？建议先选少量稳定目标，明确异常时回退行为。

这些是后续产品决策，不妨碍先确认以上共同模式；本文不代替针对这些问题的规格讨论。
