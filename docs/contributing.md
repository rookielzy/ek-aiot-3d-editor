# 维护指南

## 本地环境

```bash
corepack enable
pnpm install
```

仓库使用 pnpm workspace 和 ESM-only package。

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:browser
pnpm release:verify
```

命令说明：

- `pnpm build`：构建 `packages/*`。
- `pnpm typecheck`：先构建 core，再 type-check 所有包。
- `pnpm test`：运行普通 Vitest jsdom 测试。
- `pnpm test:browser`：运行 browser-specific runtime 测试。
- `pnpm release:verify`：发布前完整校验，包括 build、typecheck、test、browser test 和 tarball 验证。

## 代码风格

- TypeScript strict。
- ESM only。
- 两空格缩进。
- 双引号。
- 分号。
- 包入口使用明确 named export。
- 不引入无必要的新抽象；优先遵循当前模块边界。

## durable state 规则

任何修改都必须遵守：

- Durable state 只进 Scene Snapshot。
- 持久化编辑只通过 command。
- Runtime 资源只存在于 runtime。
- React/Vue 不能直接改 Snapshot。
- 不要把 framework state、Three.js object、`File`、`Blob`、object URL、loaded texture、PMREM 输出写入 Snapshot 或 `.ek3d` manifest metadata。

## 修改 core 时

优先补对应测试：

- snapshot/schema：`packages/core/src/snapshot/*.test.ts`
- command：`packages/core/src/commands/*.test.ts`
- history：`packages/core/src/history/*.test.ts`
- runtime projection：`packages/core/src/runtime/*.test.ts`
- project package：`packages/core/src/project/*.test.ts`
- inspector model：`packages/core/src/inspector/*.test.ts`

如果变更会影响公开类型，请同步检查：

- `packages/core/src/public-api.ts`
- `packages/core/src/public-api.test.ts`
- package README
- docs
- changeset

## 修改 React/Vue 时

React：

- hooks 在 `packages/react/src/hooks/`。
- components 在 `packages/react/src/components/`。
- 行为测试在 `packages/react/test/`。

Vue：

- composables 在 `packages/vue/src/composables/`。
- components 在 `packages/vue/src/components/`。
- 行为测试在 `packages/vue/test/`。

适配层应只调用 core API，不复制 command/history/runtime 逻辑。

## 文档维护

- 新增能力时更新 `docs/README.md` 的能力概览。
- 修改 Snapshot 时更新 `docs/schema.md`。
- 修改 `.ek3d` 格式时更新 `docs/project-package.md`。
- 修改 shell API 时更新对应集成指南。
- 修改发布流程时更新 `docs/release.md`。

## 发布相关

包发布使用 Changesets。影响 public package 的变更需要运行：

```bash
pnpm changeset
```

docs-only 变更通常不需要 changeset，除非改了 package README 或 npm-facing 行为说明。

发布流程详见 `./release.md`。
