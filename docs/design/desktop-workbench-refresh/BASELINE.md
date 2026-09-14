# 桌面工作台类型与回归基线

日期：2026-09-14。任务：`.scratch/desktop-workbench-refresh/issues/01-baseline.md`。
修改前基线：`3ac1f1269dd5b5b541d068a20cb385f6e2ff9727`。

## 修复及复现

- `pnpm --filter @ek-aiot/react-proof-loop typecheck` 原先报 TS2739：`Editor` 缺少 `importGlbAsset`、`reimportGlbAsset`、`importWorkbenchAssets`。React starter 改为通过 Core package-root 的 `createEditor()` 获取完整类型，并使用 `useState` 惰性初始化保持宿主实例。保留 React `useEditor()` 直接返回 editor、Vue hook 返回对象的公开形状，不更改 Core、包公开类型或 Scene Snapshot。
- `pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium -t 'Simplified Chinese'` 原先 React/Vue 两项均在“选择 none”断言失败，实际状态栏为“选择 无”。修正为在“编辑器状态”区域断言“选择 无”，保留导入后的“选择 simple-box”断言，并移除中文导入控件查询的英文回退。修复后两项通过；名称过滤排除的两项英文测试在全量浏览器运行中通过，无新增 skip。

本机 Chromium 首次启动缺少 `libnspr4.so`。以下浏览器命令均使用已有缓存库启动，未改变仓库浏览器配置：

```bash
export LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu
pnpm test:browser
```

其他机器正常安装 Playwright 系统依赖即可，不应依赖此机器的绝对路径。

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core、React、Vue 均通过 |
| `pnpm typecheck` | 三个包均通过 |
| `pnpm --filter @ek-aiot/react-proof-loop build` | 类型检查及构建通过 |
| `pnpm --filter @ek-aiot/vue-proof-loop build` | 类型检查及构建通过 |
| `node scripts/verify-release.mjs` | 3 个安装包验证通过，含 package-root consumer 类型检查、运行时导入、私有路径拒绝及 React/Vue consumer 构建；未发布 |
| `pnpm exec vitest run packages/react/test/workbench.test.tsx` | 初次独立运行 45/45；全量失败后复跑仍为 45/45 |
| `pnpm exec vitest run packages/vue/test/workbench.test.ts` | 全量失败后独立复跑 37/37 |
| 下列定向命令 | 9 文件、67/67 通过 |
| `pnpm test:browser`（使用上述环境变量） | 9 个文件实例、36/36 通过，覆盖 1280×900、1024×900、390×900 |

```bash
pnpm exec vitest run \
  packages/react/test/use-editor.test.tsx packages/vue/test/use-editor.test.ts \
  packages/react/src/public-api.test.ts packages/vue/src/public-api.test.ts \
  packages/vue/test/workbench.test.ts \
  packages/react/test/workbench-i18n.test.ts packages/vue/test/workbench-i18n.test.ts \
  packages/react/test/react-proof-loop.integration.test.tsx \
  packages/vue/test/vue-proof-loop.integration.test.ts
```

浏览器验证保留原有空宿主的导入、选择、编辑、撤销/重做、导出/打开及选择/展示视图恢复闭环，以及两框架中文工作台导入和选择。此基线未新增默认模型或视觉改版。构建保留已有大于 500 kB 的 chunk 提示。

## 全量运行与不稳定项

首次 `pnpm test` 与构建、浏览器测试同时执行，结果为 881/883：

- React `renders representative default Workbench text in Simplified Chinese` 超过原有 5000 ms 限制。
- Vue `renders the install-ready default shell when no slots are provided` 点击 Assets 后 `hidden` 断言未满足。

两份文件分别独立复跑均通过（45/45、37/37）。并发资源竞争是可能因素，尚不能据此断言根因；未扩大 timeout，未修改这两个测试或产品行为。

等待其他验证任务结束后，再以原始 `pnpm test` 命令独立运行，全量 113 文件、883/883 通过（69.57 s）。当前未取得重复性产品缺陷的证据；后续切片应保留这一不稳定项记录，避免把一次高负载失败当成稳定回归。

## 代码审查

- Standards：无硬性规范违规；发现外层仅为获取 editor 调用 `useWorkbench()` 会与默认工作台重复建立订阅，已改为宿主直接惰性创建 Core editor。初始化语义依据 [React useState 文档](https://react.dev/reference/react/useState)。
- Spec：无遗漏或越界。修复范围保持为任务 01。

审查修正后按顺序重跑：React 示例 build（含 typecheck）通过、React starter integration 2/2、`pnpm test:browser` 36/36、`pnpm test` 113 文件且 883/883（63.09 s）。未修改包源码和 Vue 示例，沿用上表已通过的包与 Vue 构建、类型和 consumer 检查结果。
