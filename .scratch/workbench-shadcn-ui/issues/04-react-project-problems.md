# 04: React 项目状态与问题修复

Status: done
Blocked by: 03

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：6、15–17、23、25、29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

让用户从项目状态发现问题，打开非模态详情并完成已有定位或恢复流程。

## Acceptance criteria

- [x] 状态栏保留真实项目/资源/运行时摘要；重要错误持续可见，关闭抽屉不清除问题。
- [x] 问题抽屉保持非模态，打开时仍可编辑场景。
- [x] 来源、严重性、目标、详情及已有定位/恢复操作可见；恢复进度和结果与真实操作一致。
- [x] 取消返回入口，定位进入目标区域；只提供当前能力支持的目标操作。
- [x] 完整/部分项目导出及恢复诊断保留，修复后摘要和问题详情正确更新。
- [x] 验证发现问题→定位或恢复→结果反馈路径；当前已有数据目标定位回归，跨模块最终回归在 07 完成。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-11：实现完成，Status → done。

**实现要点**

- `packages/react/src/components/problem-locate.ts`（新增）：`ProblemLocateRequest`（`data-query` / `data-object` / `data-field` / `node` / `asset`）与 `locateProblemRequest(problem, model)`。数据目标直接映射到数据面板；可恢复的资源问题优先落到资源工作区（缺失文件在那里补）；其余按模型解析到**最深**的场景行（容器行因子孙命中，故选最深避免落到父节点）；模型里没有归属的问题返回 `null`，抽屉便不提供定位按钮——只给当前能力支持的操作。
- `packages/react/src/components/asset-maintenance.ts`（新增）：`serializeAssetMaintenance(editor, assetId, task)`，按 editor+asset 串行化替换/重导入。抽屉与资源工作区共用同一条队列，因此较早的文件不会比较晚的文件更晚提交（沿用资产面板原有注释所声明的跨入口约束，此前只覆盖面板内部）。
- `packages/react/src/components/WorkbenchProblemsDrawer.tsx`（重写）：仍是 `<section>`（非 dialog，不夺焦点、不阻断场景），按严重性排序（error → warning → info），每行给出标题、`Severity`+来源、`Target`（种类 + 标识）、`Detail`、以及该问题真正可用的操作：能定位则一个 `Locate` 按钮；`assetId + user-action` 则一个文件输入；恢复期间行内给出进度（`Replacing...`）。恢复结果改为按 assetId 存在独立 `role="status"` 区域（`Recovery results`），因为修好后问题本身通常消失，结果仍必须可读；失败走真实返回（`projectProblemStatusMessage` / `replace.failed` / 异常文本）。关闭按钮、Escape 关闭、关闭后焦点回到入口按钮均保留。
- `packages/react/src/components/WorkbenchStatusBar.tsx`：状态栏保留原有全部真实摘要（选择、历史、运行时、快照、项目、资源、保存），新增按严重性汇总的 chip（`{errorCount} errors · {warningCount} warnings · {infoCount} notes`），关闭抽屉不清除任何问题——状态全部读自模型。`onLocateProblem` 取代 `onLocateDataTarget`。
- 定位落点：`WorkbenchHierarchy` 新增可选 `focus` / `onFocusHandled`（展开祖先、必要时清空搜索、移动 roving focus 到目标行并 `scrollIntoView`）；`WorkbenchAssets` 新增 `locate` / `onLocateHandled`（清空搜索/类型/状态过滤以让行可见，再聚焦该行的展开按钮）。`WorkbenchLeftPanel` 与 `EditorWorkbench`（`locateProblem`）串联；关闭抽屉在定位之后发生，用户落到目标区域。
- i18n：新增 5 个键（`reactWorkbench.problems.severity` / `.source` / `.detail` / `.results.label`、`reactWorkbench.status.severitySummary`），中英双语并同步 `packages/vue/src/i18n/workbench-i18n.ts`（parity 测试守护）。
- CSS：`workbench.css` 追加 `.ek-workbench__problems-summary` / `__problem-head` / `__problem-facts` / `__problem-actions` / `__problem-results`，抽屉仍在 footer 的常规流中，不覆盖视口。

**测试**

- 新增 `packages/react/test/workbench-problems.test.tsx`（7 个用例，真实 `EditorWorkbench` 可见操作）：关闭抽屉后状态栏仍给出 Project/Assets/Runtime/Problems 与严重性汇总且 `editor.serialize()` 不变；抽屉打开时仍可复制节点（对象数 +1，抽屉保持展开）；每行显示 Severity/Source/Target/Detail，损坏包问题（`Project Archive Invalid`，目标 Scene）不给 Locate 也不给文件输入；定位场景节点问题后焦点落在 `Hierarchy` 区域中被选中且聚焦的 treeitem 上并关闭抽屉；定位资源问题后切到 `Assets` 区域并聚焦该资源行；恢复后 `Recovery results` 区域出现 `Replaced with recovered.glb`、损坏问题从摘要消失、导出载荷存在；Escape 关闭并把焦点还给入口。
- 新增 `packages/react/test/workbench-problems.browser.test.tsx`：在 1440x900 / 1920x1080 / 1100x800 三个验收尺寸下断言抽屉与视口不重叠（`regionRect.top >= viewportRect.bottom`）、无横向溢出、抽屉打开时仍能通过视口菜单复制对象、关闭后状态栏摘要与问题仍在、`problems.acknowledged` 未变。截图（`VITE_CAPTURE_PROBLEMS=1`）输出到 `packages/react/test/__screenshots__/problems/{1100,1440,1920}-en.png`。
- 调整既有用例两处（行为变化是合理的）：`packages/react/test/workbench-data-preview.test.tsx` 中原本无作用域的 `getByRole("button", { name: "Locate" })` 现在会匹配多个问题，改为先定位到目标行为 `Data query` 的那一行再点其 `Locate`。

**实际执行的命令**

- `pnpm --filter @ek-aiot/3d-editor-core typecheck`、`pnpm --filter @ek-aiot/3d-editor-react typecheck`、`pnpm --filter @ek-aiot/3d-editor-vue typecheck`：均通过。（注：根 `pnpm typecheck` 在本机 pnpm 版本下 `pnpm -r --filter './packages/*' typecheck` 报 `No projects matched the filters`，故改为逐包执行；core build 已由该脚本先跑过并通过。）
- `pnpm test`：160 个文件 / 1417 个用例全部通过（含既有 `workbench.test.tsx` 65 个、`workbench-data-preview.test.tsx` 14 个、i18n parity 与字符串审计）。
- `pnpm test:browser`：45 个文件 / 156 个用例全部通过（chromium / chromium-desktop-boundary / chromium-mobile 三套）。
- 单个文件复跑：`pnpm exec vitest run --root ../.. packages/react/test/workbench-problems.test.tsx`（7/7）、`pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/workbench-problems.browser.test.tsx`（3/3）。

**未做/边界**

- 未改动 Core 契约、Scene Snapshot 形状或既有 Inspector 语义；抽屉的搜索类临时状态、焦点与恢复结果都只存在组件内，不入持久快照。
- `data-object` / `data-field` 目标沿用原有数据面板定位路径（回归由既有数据用例覆盖）；跨模块最终回归按计划在 07 完成。
- 浏览器截图已生成但本轮无法在本机查看图像，验收依据是浏览器测试中的几何断言（不重叠、无溢出、可继续编辑）。


**代码复查与复查后的调整（2026-11-11）**

按 implement 流程做了双轴复查（Standards / Spec 两个并行子代理，固定点 `da5f6bc`，`git diff HEAD`）。Standards 轴无硬性违规（无 durable 快照污染、CSS 仅追加且保持 CRLF、i18n 双端同步）；Spec 轴确认核心契约、快照纯度、非模态与 Escape/焦点回归均成立。复查提出的可修项已在本轮处理：

- **重复代码**：抽屉与资源面板各自重写了一遍「替换 → 重新投影 → 刷新问题 → 生成结果文案」。现在统一为 `asset-maintenance.ts` 中的 `replaceAssetFile(host, assetId, file): Promise<{ replaced, message }>`，两处都调用它；异常仍各自表述（抽屉用 `recoveryFailed`，资源面板用原始错误文本），因为两者面向的语境不同。
- **属性簇 / 中间人**：左栏原本透传 `sceneFocus`/`onSceneFocusHandled`/`assetLocate`/`onAssetLocateHandled` 四个平行属性。现在收敛为一个 `focus?: PanelLocateRequest | null` + `onFocusHandled?()`（`PanelLocateRequest` = `node | asset`），由 `WorkbenchLeftPanel` 分派给能执行它的区域，`EditorWorkbench` 的 `sceneFocus`/`assetLocate` 两个状态也合并为一个 `panelFocus`。
- **职责分离**：`problem-locate.ts` 不再对同一个 `ProblemTarget` 连做两个 switch；拆成 `dataRequestFor`（数据目标自带面板）与 `assetIdOf`（目标自带资源）两个各管一件事的函数。
- **逐个问题的进度键**：抽屉的进度与结果统一以 assetId 为键（与文件输入的作用域一致），不再一个问题一套键、一个资源一套键。
- **测试改断言用户可见结果**：`workbench-problems.test.tsx` 不再读 `data-tree-row-id`、`li` 选择器、`aria-label` 子串或 `hidden` 属性，改为 `getAllByRole("listitem")`、`getByRole("treeitem", { name: /Key light/ })`、`getAllByRole("button", { name: /asset-a/ })`、`getByLabelText("Replace asset")` 等角色/可访问名查询，断言「焦点是否落在那个用户看得见的控件上」。

复查中提到但**有意不改**的两点：

- `material` / `imported-material-slot` 目标在本壳层没有可进入的区域，因此不给 `Locate` 按钮。这正是验收项「只提供当前能力支持的目标操作」要的行为，而不是缺陷。
- `assetId + user-action` 的问题即使资源未出现在资源面板列表里也保留文件输入：`replaceAsset` 按 assetId 直接改文档，不依赖列表；此时没有可定位处，但恢复动作本身仍然真实可用。

**独立 code review 与修复（2026-11-11）**

审查范围：`git diff da5f6bc...61a2bda`，按 Standards / Spec 两轴并行审查。

- Standards：确认 3 处低优先级风格问题，已移除替换结果的多余可变变量、将资源行 ref 注册改为 early return，并用 reduce 表达层级行选择；保持原有定位优先级。
- Spec：确认 1 项 P2 数据定位缺陷，包含两种表现：字段 Locate 只滚动而未转移键盘焦点；当前选中对象的详情关闭后，对象 Locate 无法重新打开。现在对象与字段均生成独立定位请求，详情卡重新打开并聚焦字段或卡片；已处理请求不会在后续普通选择时再次抢焦点。
- 回归：扩充真实 EditorWorkbench 的既有数据预览测试，覆盖同一对象/字段连续两次关闭后重新定位及目标区域内焦点。修复前两个测试失败，修复后通过。
- 导入目标跨对象误定位的初步疑点经复核撤回：正常生成的 importKey 带 owner 前缀，复制时也会重映射，没有可复现依据，因此没有扩大修改。
- `.opencode/skills` 及其指定测试技能在当前仓库中不存在；按当前 Vitest 配置与规格的用户可见行为边界验证。

验证（命令从 `packages/react` 执行，根脚本除外）：

- `pnpm exec vitest run --root ../.. packages/react/test/workbench-data-preview.test.tsx`：14/14 通过；最终焦点请求去重调整后，使用 `-t 'reopens dismissed details each time|reports a device that is absent'` 复跑两个相关用例，2/2 通过。
- `pnpm typecheck`（React 包）：通过。
- `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/workbench-problems.browser.test.tsx`：三套浏览器配置 3/3 通过。
- 同命令运行 `packages/react/test/object-data-details.browser.test.tsx`：真实 GLB 数据详情三套配置 3/3 通过。
- 根 `pnpm typecheck` 被现有 core build 脚本的 `rm` 在 Windows cmd 中不可用阻断；没有修改工具链，也未宣称全仓构建或根检查通过。根目录无 `bun run check` 脚本。
- `git diff --check`：通过。
- 全量常规回归：从 React 包执行 pnpm exec vitest run --root ../.. --reporter=dot，160 个文件、1417 个用例，1409 通过，8 个用例超过默认 10 秒限制（3 个 React 文件），无断言失败。随后仅对这 8 个用例使用 --maxWorkers=1 串行复跑，保持原 10 秒限制，8/8 全部通过；未修改测试超时配置。
