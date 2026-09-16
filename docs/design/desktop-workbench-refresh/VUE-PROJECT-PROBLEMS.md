# Vue 项目往返与问题抽屉交付记录

日期：2026-09-16。

## 交付行为

- 项目打开、完整导出、部分导出和语言切换进入可关闭的全局菜单；Escape、外部点击和失焦会关闭菜单，Escape 会把焦点还给入口。
- 项目操作带互斥 busy 状态。打开结果按 partial / warnings / success 区分；导出只在异步 `packageBytes` 成功解析且宿主下载能力可用后下载并报告成功，同步异常、异步拒绝及下载能力缺失均进入错误反馈。
- 项目导入、导出返回的真实 `Problem` 作为当前 editor 的 session 反馈合并进 Workbench model，不写入 Scene Snapshot。资源恢复后，已解除的导出阻塞诊断会从当前投影中消失。
- 状态栏问题摘要可展开本地化抽屉。抽屉显示 severity、source、target、detail，并对可恢复资源执行真实 `replaceAsset`、runtime 重投影和 problems refresh；关闭和重开不会清除问题。
- Vue 的 `update:locale`、scoped slots、默认工具开关及 context 形状保持不变。locale、菜单、抽屉、反馈和 replacement `File` 仍是 session/runtime 状态。
- 完整 Workbench 测试暴露了粘贴生成 ID 与已有对象碰撞的 Core 缺陷；粘贴现在会继续生成 ID 直至无冲突，并保留显式 `objectIdMap` 的冲突错误。

## 验证

- `pnpm build`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，115 个文件、957 个测试。
- `pnpm vitest packages/core/src/editor/operations.test.ts packages/vue/test/workbench.test.ts packages/vue/test/vue-proof-loop.integration.test.ts --run`：通过，71 个测试。
- `pnpm --filter @ek-aiot/react-proof-loop build`：通过。
- `pnpm --filter @ek-aiot/vue-proof-loop build`：通过。
- `pnpm test:browser`：通过临时解压 NSS / NSPR / ALSA 用户态依赖后实际执行全部 12 个浏览器文件、99 个测试。初次执行 90 个通过，9 个因旧用例未打开 Vue 新增的 Project 菜单而超时；修正三处 locale 交互后，针对三种浏览器配置重跑 9 个失败用例全部通过。

## 覆盖说明

Vue DOM 行为用例覆盖完整导出阻塞、明确部分导出、恢复后完整导出、损坏包不替换场景、问题关闭/重开保留、菜单生命周期、双语诊断、异步包拒绝及宿主下载能力缺失。浏览器规格实际覆盖 Vue 的真实 GLB 导入、选择、变换、撤销/重做、材质槽、环境、灯光、默认相机、资源载荷、locale/runtime identity 与项目恢复。浏览器失败诊断截图由 Vitest 自动生成在未跟踪目录中；未把测试产物纳入提交。
