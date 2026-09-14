# Vue 视口工具与节点操作

任务：`.scratch/desktop-workbench-refresh/issues/12-vue-tools.md`。审查范围：开工基点 `889d5de` 之后的本次变更。实现提交：`2045312`；审查修复：`7847e35`、`1fa08ff`。

## 交付行为

Vue 浮动工具保留历史、三变换、独立吸附和框选的直接入口，以及辅助显示、相机、节点操作的分组菜单。吸附使用各自变换图标和吸附角标；相机与节点组图标对齐 React。Escape 仅在菜单展开时关闭菜单并恢复触发按钮焦点；菜单关闭后 Escape 继续到 Core 清除选择。移出焦点或在外部按下指针关闭菜单。

变换字段保留本地字符串草稿。Enter 提交且保持输入焦点，blur 不重复提交；Escape 恢复 Core 值并清除校验反馈。旋转显示角度并标记 °，提交时转换为弧度；未修改的角度不因浮点往返生成历史。空输入和非法数值沿用 Core 校验问题。撤销/重做刷新字段；切换目标丢弃前一目标草稿。XYZ 保持原有并排排列，未迁移其他 Inspector 表单。

复制、粘贴、副本、删除、组合、解组、全选和清除继续走 Core operations；相机和辅助显示也复用现有 runtime。默认工具与宿主 toolbar scoped slot 的区域、开关和上下文保持兼容。数字输入、textarea、select、contenteditable 中的编辑快捷键不会被工作台截获。

相机捕获的默认名称根据当前 locale 创建：`Camera view 1` / `相机视图 1`；创建后属于 authored name，切换语言不会重写已存名称。

## Core 模型缺口

原 WorkbenchToolbarModel 只有 can* 布尔值，没有禁用原因。本次增加可选 `disabledReasons`，使用已有 MessageDescriptor，由 Core 判断选择、相机节点、历史、runtime、相机视图和剪贴板不可用原因，Vue 只翻译并显示 title。两适配器字典保持相同键集合。

原纯 builder 的 canPaste 固定为 true。增加可选 `BuildWorkbenchModelOptions.canPaste`，Vue 用 `editor.operations.canPaste()` 提供真实值；省略选项时保持既有 builder 行为。默认 Copy 和 scoped-slot Copy 更新 Vue 的内部响应式版本，使 Paste 即时启用或禁用。scoped operations 显式委托，保留宿主原型方法及其接收者。

以上均为派生模型或 UI/session 状态；没有 command、history 算法、Scene Snapshot schema 或项目包格式变更。未创建新的 Core UI 抽象。

## 验证边界

- 已确认的 Vue Workbench/Inspector DOM：Escape、角度、草稿提交/取消、Core 双语原因、空剪贴板、继承式宿主操作先红后绿。
- 真实节点操作闭环检查对象数量、父子关系、选择、撤销/重做与焦点；三吸附独立，宿主输入保留原生事件。
- 复用既有 package-root public-api、scoped slots、showDefaultToolbar、locale 和项目导入恢复测试。
- 扩展既有真实 GLB Vue 浏览器宿主路径：双语角度提交/取消、焦点、Undo/Redo、相机捕获/应用及 contenteditable；切语言保留 snapshot/history/runtime/canvas。
- 复用 React/Vue 层级浏览器路径核验真实坐标轴拖动、单次历史、Undo/Redo及三桌面尺寸。工具可达性同时覆盖 1440×900、1920×1080、1100×800 和 1100×600 的展开抽屉宿主。

Context7 未配置密钥，Vue API 用法改查 [watch 官方文档](https://vuejs.org/guide/essentials/watchers.html)和[事件处理文档](https://vuejs.org/guide/essentials/event-handling.html)。

## 视觉记录

对照原型 `a9ebc22` 的 reference-1440 与 React 已验收工具组织，亲自查看三个桌面尺寸的 Vue 截图。白色浮动工具组、蓝色激活态、浅灰视口及紧凑菜单保持一致；1100 下工具换行，菜单末项和状态栏可达。截图使用既有真实 GLB 测试立方体与 imported targets，非新增包默认展示模型。全局项目区及深层属性表单仍按后续任务推进。

| 尺寸 | 节点操作 English | 辅助显示 简体中文 |
| --- | --- | --- |
| 1440×900 | [节点](screenshots/vue-tools/1440-nodes-en.png) | [辅助](screenshots/vue-tools/1440-helpers-zh-CN.png) |
| 1920×1080 | [节点](screenshots/vue-tools/1920-nodes-en.png) | [辅助](screenshots/vue-tools/1920-helpers-zh-CN.png) |
| 1100×800 | [节点](screenshots/vue-tools/1100-nodes-en.png) | [辅助](screenshots/vue-tools/1100-helpers-zh-CN.png) |

复现：设置 `VITE_CAPTURE_TOOLS=1`，运行既有 `proof-loop-demo.browser.test.tsx` 的 `hierarchy targets at desktop sizes` 用例；输出位于 `packages/react/test/__screenshots__/vue-tools/`。普通测试不设置此变量即可不截图。

## Standards

初审未发现硬性规范违反，保留一项 Duplicated Code/Shotgun Surgery 建议：两份字典需同步新增原因。按项目最小重构约束继续使用现有字典，通过既有跨框架 parity 测试防止漂移，不为本切片建立共享文案包。

修复复核发现 operations 对象展开会遗漏宿主原型方法并改变接收者。已改为显式委托；继承式宿主 scoped-slot Copy/Paste 回归先失败于 `operations.paste is not a function`，修复后通过。最终无未处理硬性规范问题，保留一项维护建议。

## Spec

初审发现空剪贴板 Paste 仍可用。已接入 Core `operations.canPaste()` 和空剪贴板双语原因，并覆盖默认及 scoped-slot Copy 的即时刷新；独立复核确认解决。未发现任务 13–15 的越界实现，最终无未处理规格问题。

累计审查发现：Standards 2 项（1 项硬性问题已修复，1 项维护建议保留）；Spec 1 项（已修复）。

## 命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | Core、React、Vue 通过；最后一次 scoped operations 修复后额外构建 Vue 通过 |
| `pnpm typecheck` | Core、React、Vue 通过，开发过程中多次运行 |
| `pnpm exec vitest run --maxWorkers=2` | 全量 114 文件，927/927 通过；限制并发，不跳过测试或修改超时阈值 |
| 最后修复后的 Vue Workbench / Inspector / public-api 定向运行 | 71/71 通过（47 + 21 + 3） |
| `VITE_CAPTURE_TOOLS=1 LD_LIBRARY_PATH=/home/slimj/.cache/playwright-system-libs/ubuntu-noble/root/usr/lib/x86_64-linux-gnu pnpm test:browser` | 三个 Chromium 配置，12 文件，90/90 通过；434.16 秒 |
| React / Vue proof-loop build | 两个示例通过 |
| `git diff --check 889d5de...HEAD` | 通过 |

已记录的失败与处理：首次全量单测 925/926，跨框架新增字典键不齐，补齐后 parity 3/3；第二轮 925/926，React 既有测试在并发压力下超时，限制 workers 后全量 927/927。首轮浏览器 86/90，三项 Vue 中文相机名称旧断言及一项 React showcase 超时；名称断言按新的 authored name 修正，后续浏览器单独运行复核。

最终浏览器仍输出此前已有的 `TransformControls: The attached 3D object must be a part of the scene graph.` 提示；示例构建仍有大于 500 kB 的 chunk 提示。两者均保留记录，不以跳过测试使验证通过。
