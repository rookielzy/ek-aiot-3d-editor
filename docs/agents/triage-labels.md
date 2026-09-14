# Triage Labels

五个标准分类角色映射到以下本地任务状态值：

| 标准角色 | 本地状态值 | 含义 |
| --- | --- | --- |
| needs-triage | needs-triage | 等待维护者评估 |
| needs-info | needs-info | 等待报告者补充信息 |
| ready-for-agent | ready-for-agent | 规格完整，可交由代理执行 |
| ready-for-human | ready-for-human | 需要人工实现 |
| wontfix | wontfix | 不予处理 |

技能要求设置某个分类角色时，在任务顶部附近的 `Status:` 行
写入对应的本地状态值。

例如：`Status: needs-triage`。

以后调整分类名称时，修改本表的“本地状态值”列。
Wayfinder 执行状态另见 `docs/agents/issue-tracker.md`。
