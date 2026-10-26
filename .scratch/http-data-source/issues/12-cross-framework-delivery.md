# 12: 验收跨框架闭环并完成文档和发布准备

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段四

Blocked by: 11

User stories: 25, 26, 27, 28, 29, 30, 31, 32

Decisions: D01, D02, D04, D05, D08, D10, D11, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

使用同一真实 HTTP/GLB 夹具验证 React、Vue、vanilla 的配置往返与运行态边界，并给宿主提供可安装、可集成的正式能力。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 完成公开导出、schema/数据源/执行器/生命周期文档，固定集成夹具与必要污染检查；核对已有 API 和迁移兼容。 |
| React | 完善正式示例的显式数据演示入口、绑定/问题/恢复指引、集成及 package-root 使用文档和可见界面证据。 |
| Vue | 使用同一数据与场景完成等价示例、集成文档和界面证据，不硬编码与 React 不同的设备定义。 |

## Acceptance criteria

- [ ] React 配置并导出 → Vue 恢复并显式连接 → vanilla 读取/执行的数据与身份一致；缺凭证时可修复。
- [ ] 所有 AC01–AC15 有对应证据，不用 SVG 原型截图、内存模拟请求或 2D renderer 冒充正式 WebGL/HTTP 验收。
- [ ] 1440×900、1920×1080、1100×800 下配置窗口/底部按钮/Inspector/问题入口可达，无横向遮挡；保存焦点与双语行为。
- [ ] 100 对象共享一个列表查询、100 台设备×2 属性、连续 3 个轮询周期无重复请求/队列累积，记录环境与事实，不声称生产吞吐。
- [ ] 默认空 editor 和 demo 未显式开启数据时零请求；运行态/样本/秘密不进入 Snapshot/.ek3d/clipboard。
- [ ] 构建、类型、单测、浏览器全套及现有发布校验通过；旧浏览器实例和原 proof loop 不删除、不放宽断言掩盖回退。
- [ ] React/Vue/core 集成、schema、交互、项目包、FAQ 和适用的 changeset 更新；记录命令、结果与剩余限制。
- [ ] 任务只做到发布准备，不发布 npm、不合并或部署；实现来源可追溯到正式规格和原型基线。

## Testing

执行 pnpm build、pnpm typecheck、pnpm test、pnpm test:browser 与现有发布验证；检查三个 package-root consumer；保留截图/短录屏和真实请求及材质状态证据。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不把发布准备理解为授权发布，不将原型代码直接并入正式示例。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。
