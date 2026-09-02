# {WP编号} 最小上下文交接

## 当前目标与覆盖 UC

## 当前调度上下文

| 字段 | 值 |
|------|----|
| `requirementClarity` | `clear` / `unclear` |
| `complexity` | `trivial` / `simple` / `moderate` / `complex` |
| `topology` | `single-workstream` / `multi-workstream` |
| `risk` | `low` / `medium` / `high` |
| `hasSharedArchitecture` | `true` / `false` |
| `scheduleVersion` | `v{n}` |
| 当前调度项 `id` | `{唯一调度项 id}` |
| Agent `agent` / 职责 `role` | `{manifest Agent id}` / `{本次职责}` |
| 依赖 `dependsOn` / 并行 `parallel` | `{调度项 id 列表}` / `true` / `false` |

**HANDOFF**：`.dev-flow/runs/{需求编号}/work-packages/{WP编号}/HANDOFF.md`

**stopWhen**：`{可观察停止与升级条件}`

## 范围与非目标

## 已确认决策与接口契约

## 系统不变量与风险

## 当前阻塞项

## 允许读取清单

| 路径 | 读取模式 | 范围 | 理由 | 失效条件 |
|------|---------|------|------|---------|
| `{精确路径}` | `section` / `targeted` / `full` | `{章节、符号或搜索词}` | `{当前任务需要}` | `{重新加载条件}` |

## 代码与测试范围

## 下一动作与停止条件
