# Issue tracker: Local Markdown

本仓库的任务与规格保存在 `.scratch/` 下，使用本地 Markdown 文件管理。

## 文件约定

- 每个功能使用一个目录：`.scratch/<feature-slug>/`。
- 规格文件：`.scratch/<feature-slug>/spec.md`。
- 实现任务：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`。
  编号从 `01` 开始，每个任务独立成文件。
- 分类状态使用任务文件顶部附近的 `Status:` 行记录；
  分类值见 `docs/agents/triage-labels.md`。
- 评论与讨论历史追加到文件底部的 `## Comments` 下。

## 发布到任务跟踪器

按上述路径创建规格或任务文件，按需创建目录。

## 获取相关任务

读取引用路径对应的文件。若只提供编号，在对应功能目录中查找；
若多个功能下存在同号任务且上下文无法确定，先确认所属功能。

## Wayfinding 操作

供 `/wayfinder` 使用：一份地图文件关联多个独立任务文件。

- 地图：`.scratch/<effort>/map.md`，包含 Notes、
  Decisions-so-far 和 Fog。
- 子任务：`.scratch/<effort>/issues/<NN>-<slug>.md`，
  从 `01` 编号，正文记录需要回答的问题。
- 类型：用 `Type:` 行记录 research、prototype、grilling 或 task。
- 执行状态：wayfinder 使用 `Status: open`、`Status: claimed`
  和 `Status: resolved` 表示待处理、已领取和已解决；
  这些是执行状态，不属于五个分类标签。
- 依赖：顶部附近使用 `Blocked by: NN, NN` 引用同目录任务。
  所有依赖均为 resolved 时，任务解除阻塞。
- 下一任务：扫描地图对应的 issues 目录，选择编号最小、
  状态为 open 且依赖全部解决的任务。
- 领取：开始工作前写入 `Status: claimed` 并保存。
- 解决：在 `## Answer` 下追加答案，设置 `Status: resolved`，
  再向地图的 Decisions-so-far 追加结论摘要和任务链接。
