# 按风险启用架构能力设计

## 1. 背景

当前 Dev Flow 将 Architect 设为所有治理路径中的固定阶段：Task Decomposer 先识别工作包与共享边界，Architect 再产出 `COMPONENTS.md`、可选 `TDD.md` 和共享架构，Developer 随后执行设计补水、开发准入、测试与实现。

这套分工在复杂需求中能够保持跨工作包一致性，但在明确、局部、可逆的任务中存在重复读取、重复判断和多次交接。Task Decomposer 已承担技术边界识别，Developer 也需要理解组件设计才能实现，因此所有任务都经过独立 Architect 的收益不足以覆盖其编排成本。

本次调整取消 Architect 作为固定必经岗位，但不取消架构设计、独立审核和用户确认门禁。Orchestrator 先判断需求清晰度、任务复杂度、风险和拓扑，再自主生成 `agentSchedule`；架构能力只按风险启用。

## 2. 目标与非目标

### 2.1 目标

1. Orchestrator 先判断需求是否清晰；清晰时自行生成精简需求基线，不清晰时才调度 Lin 补充需求。
2. Liu 从“任务拆分师”升级为“技术负责人”，负责候选工作包、依赖排序、治理深度、架构介入判断和 Developer 技术方案审核。
3. Developer 默认拥有工作包内部的组件设计、技术方案、测试和实现。
4. Architect 从固定流水线岗位改为按需架构专家，只在共享架构或高风险技术决策中启用。
5. 保留 `COMPONENTS.md`、`TDD.md`、设计覆盖、用户确认、`components-readiness` 和代码审查等现有质量门禁。
6. 防止 Developer 在跨工作包或高风险场景中自行设计、自行批准。
7. 根据任务复杂度自动选择最小充分 Agent 集合，并在复杂度上升时自动重新编排。

### 2.2 非目标

1. 不取消 `COMPONENTS.md`、`TDD.md` 或 `GLOBAL-ARCHITECTURE.md` 的既有结构与校验器。
2. Lin 被调用时仍使用既有需求 grilling、设计源登记和 `READY/BLOCKED` 协议。
3. 不合并代码审查职责；Reviewer 继续独立于方案作者和实现者。
4. 不删除历史设计文档或旧运行产物。
5. 不增加新的治理深度枚举，继续使用 `fast`、`standard` 和 `rigorous`。

## 3. 调整后的角色模型

| 角色 | 定位 | 主要职责 | 不负责 |
| --- | --- | --- | --- |
| Lin（需求分析师） | 按需需求澄清负责人 | 只在需求不清晰时补充需求基线、UC、范围、验收标准和 `READY/BLOCKED` | 清晰需求重复访谈、工作包技术边界、执行拓扑、开发分配 |
| Liu（技术负责人） | 技术拆分与架构门禁负责人 | 工作包拆分、依赖排序、风险分级、架构路由、Standard 方案审核、Developer 下发建议 | 代替 Developer 完成普通工作包实现 |
| Zhang（开发工程师） | 工作包设计与实现负责人 | 工作包内 `COMPONENTS.md`、按需 `TDD.md`、设计补水、测试和实现 | 批准自己的跨包或高风险技术决策 |
| Chen（按需架构专家） | 非固定专家能力 | 共享架构、跨工作包契约、高风险方案设计与独立技术判断 | 默认参与所有工作包 |
| Reviewer | 独立质量审查 | 代码与交付质量审查、问题分级、限定复审 | 替代架构门禁或需求确认 |
| Orchestrator | 编排与最终调度负责人 | 判断需求清晰度、复杂度、风险与拓扑，生成和执行 `agentSchedule`，执行校验、取得用户确认、重新编排和最终交付 | 擅自改变已确认业务范围或绕过硬门禁 |

固定团队对外表达改为“五个核心角色 + 一个按需架构专家”，不再把 Architect 描述为每次开发必经岗位。`agents/architect.md` 保留，作为严谨路径和多工作流共享架构的可调用能力。

## 4. 自主调度与架构路由

### 4.0 调度输入与输出

Orchestrator 必须先从用户输入、项目证据和风险信号中形成以下结构化判断：

```text
requirementClarity: clear | unclear
complexity: trivial | simple | moderate | complex
topology: single-workstream | multi-workstream
risk: low | medium | high
hasSharedArchitecture: boolean
```

判断完成后生成 `agentSchedule`。每个调度项至少包含唯一调度项 id、Agent id、职责、依赖项、可否并行、输入 HANDOFF 和停止/升级条件；`dependsOn` 引用调度项 id，Agent id 必须来自 `manifest.json`，不得临时发明角色。

```json
{
  "agentSchedule": [
    {
      "id": "WP01-developer",
      "agent": "developer",
      "role": "proposal-and-implementation",
      "dependsOn": [],
      "parallel": false,
      "handoff": ".dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md",
      "stopWhen": ["发现共享契约", "风险升级"]
    },
    {
      "id": "WP01-reviewer",
      "agent": "code-reviewer",
      "role": "independent-review",
      "dependsOn": ["WP01-developer"],
      "parallel": false,
      "handoff": ".dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md",
      "stopWhen": ["缺少运行证据"]
    }
  ]
}
```

需求清晰度规则：

- `unclear`：目标、范围、关键行为、可验证验收或高影响未知项任一不足，调度 `requirements-analyst`；Lin 输出 `READY` 后重新计算全部调度字段。
- `clear`：证据已足以形成可验证需求基线，Orchestrator 直接生成精简需求基线和适用的设计源登记，不调度 Lin。
- 用户确认只能确认业务事实和取舍，不能把未经验证的高影响假设变成 `clear`。

复杂度与最小 Agent 集合：

| 调度场景 | 必要条件 | 自动调度 |
| --- | --- | --- |
| `direct-development` | `clear + trivial + single + low`，纯机械非 UI、无契约/异步/权限/不可逆操作且可立即回滚 | Developer → Reviewer |
| Fast UI | `clear + simple + single + low`，局部可逆且无共享契约 | Developer 方案 → 用户确认 → Developer 实现 → Reviewer |
| Standard | `moderate` 或中风险，但无必须先统一的共享架构 | Liu 拆分 → Developer 方案 → Liu 审核 → 用户确认 → Developer 实现 → Reviewer |
| Rigorous | `complex`、高风险或高技术不确定性 | Liu → Architect → 用户确认 → Developer → Reviewer |
| Multi 无共享架构 | 至少两个独立工作包，且有无共享边界的可核验证据 | Liu → 按依赖批次调度多个 Developer → 各包 Reviewer |
| Multi 有共享架构 | 至少两个工作包共享关键契约或基础 | Liu → Architect 共享架构 → 按依赖批次调度多个 Developer → 各包 Reviewer |

`direct-development` 是 Fast 治理下的调度变体，不新增治理深度枚举。它只跳过需求分析师、技术负责人、方案产物和 `components-readiness`；测试、真实运行证据和独立 Reviewer 仍然强制。任何可见 UI 修改都不得进入 `direct-development`。

### 4.1 Fast：Developer 自主设计与实现

适用条件保持严格：验收明确、影响局部、可逆、不修改共享契约、不涉及权限/安全/不可逆操作，也不包含高风险异步状态变化。

执行顺序：

1. Orchestrator 确认需求清晰、单一内聚工作包和低风险 Fast 条件；边界明确时不调度 Liu。
2. Developer 定向读取项目代码和组件切片，产出精简 `COMPONENTS.md`，包含职责目录树、页面组件树和唯一设计覆盖矩阵。
3. Orchestrator 运行 `components` 校验并取得用户对组件职责的确认。
4. Developer 完成设计补水并运行 `components-readiness`。
5. 准入通过后，Developer 编写测试并实现。
6. Reviewer 执行独立代码与交付质量审查。

Fast 不调用 Architect，也不要求完整 `TDD.md`。Developer 可以设计，但不能绕过结构校验、用户确认或 readiness。

### 4.2 Standard：Developer 提案，Liu 审核

适用于有限需求不确定性、局部架构决策、中等风险异步交互，且不存在必须先统一的跨工作包共享架构。

执行顺序：

1. Liu 完成工作包拆分和 `standard` 路由。
2. Developer 产出候选 `COMPONENTS.md` 和 `TDD.md`。
3. Liu 以技术负责人身份审核组件职责、复用判断、数据流、API、状态、测试策略和风险；有问题时退回 Developer 修正。
4. Orchestrator 分别运行 `components` 与 `tdd-proposal` 校验，并将通过审核的组件方案与 TDD 一次性提交用户确认。
5. Developer 完成设计补水、`components-readiness`、测试和实现。
6. Reviewer 独立审查。

Standard 不默认调用 Architect。Liu 的审核结论必须写入 HANDOFF 或方案确认记录，避免口头审核不可追踪。

### 4.3 Rigorous：启用独立 Architect

命中以下任一信号时，不得由 Developer 自行批准方案，至少升级为 `rigorous` 并启用 Architect：

- 权限、安全、隐私、资金或不可逆操作。
- 复杂状态机、并发写入、离线恢复或高影响异步一致性。
- 修改公共 API、公共类型、全局状态、路由/布局或基础组件契约。
- 技术不确定性高，错误方案将造成大范围返工。
- Liu 与 Developer 对关键技术边界无法形成有证据的一致结论。

Architect 负责独立产出或审查 `COMPONENTS.md` 与 `TDD.md`；组件职责和技术方案继续按 rigorous 既有门禁分别确认。Developer 只在最终方案确认并通过 readiness 后实现。

### 4.4 Multi-workstream：Architect 负责共享架构

多工作流不自动意味着每个工作包都由 Architect 设计，但只要存在跨工作包共享契约或关键基础，就必须启用 Architect 产出 `GLOBAL-ARCHITECTURE.md`。

1. Liu 负责工作包边界、依赖图、批次和开发下发建议。
2. Architect 只设计共享数据模型、公共组件、API、路由/布局、全局状态及工作包拥有/引用边界。
3. 各工作包仍按自身风险进入 Fast、Standard 或 Rigorous：低风险包由 Developer 自主设计，中风险包由 Developer 提案并由 Liu 审核，高风险包再调用 Architect。
4. Developer 不得在工作包内部重新定义已经确认的共享契约。

如果多工作流不存在共享架构边界，Liu 必须在任务拆分中给出可核验证明，此时可以不调用 Architect。

## 5. 决策权与下发责任

Orchestrator 负责需求清晰度、复杂度、风险、拓扑、最终路由和实际 Agent 调度。只有 Moderate/Complex、Multi 或边界不确定任务才调度 Liu，由 Liu 提出工作包、执行顺序、治理深度和 Architect 是否介入的建议。业务优先级与范围继续由用户确认。

```text
Orchestrator 判断 requirementClarity
  → unclear：Lin 补充到 READY，再重新编排
  → clear：直接生成精简需求基线
    → trivial：Developer 实现 → Reviewer
    → simple：Developer 设计并实现 → Reviewer
    → moderate：Liu 拆分 → Developer 提案 → Liu 审核 → Developer 实现 → Reviewer
    → complex/high-risk：Liu → Architect → Developer → Reviewer
    → multi：Liu 拆包；有共享架构才调用 Architect；各 WP 按依赖批次调度
```

Liu 不直接修改 Developer 的实现产物来替代开发；发现方案问题时，应提供明确审核意见并退回方案作者修正。Orchestrator 不得因为用户希望加快速度而静默跳过风险升级。

多个工作包只有在没有共享写入文件、没有未稳定契约且依赖图允许时才能并行调度不同 Developer；否则按拓扑批次串行执行。任何 Agent 命中 `stopWhen` 后必须停止，Orchestrator 使用新证据重新计算调度，不得沿用旧 `agentSchedule`。执行中只允许自动升级；降级必须重新证明所有更高风险信号已消失。

## 6. 产物与门禁

| 产物或门禁 | Direct | Fast UI | Standard | Rigorous | Multi 共享层 |
| --- | --- | --- | --- | --- | --- |
| `TASK-BREAKDOWN.md` | 不要求 | 可精简 | 需要 | 需要 | 需要 |
| `COMPONENTS.md` 作者 | 不适用 | Developer | Developer | Architect 或 Architect 审核后的 Developer | 各 WP 按自身路径 |
| `TDD.md` | 不适用 | 不要求 | Developer | Architect 或 Architect 审核后的 Developer | 各 WP 按自身路径 |
| 技术审核 | 不适用；仅限机械非 UI | 结构校验 + 用户确认 | Liu 审核 + 结构校验 + 用户确认 | Architect 独立判断 + 结构校验 + 用户确认 | Architect + 用户确认 |
| `GLOBAL-ARCHITECTURE.md` | 不适用 | 不适用 | 不适用 | 按共享边界决定 | 有共享边界时强制 |
| `components-readiness` | 不适用；禁止可见 UI | 强制 | 强制 | 强制 | 各 WP 强制 |
| 独立代码审查 | 强制 | 强制 | 强制 | 强制 | 各 WP 强制 |

现有校验器关注产物结构和确认状态，不绑定作者身份，因此原则上无需重写校验规则。需要更新的是 Agent 指令、主流程、模板说明文字和流程测试。

## 7. 错误处理与升级

1. Developer 在 Fast 中发现共享契约、权限、安全、不可逆操作或复杂状态时，立即停止实现并回报 Liu 重新路由。
2. Liu 审核 Standard 方案时发现跨工作包影响或高风险不确定性，升级为 Rigorous 或 Multi，并调用 Architect。
3. Architect 发现工作包无法独立验收或边界错误时，退回 Liu 重新拆分，不在架构阶段擅自重排业务优先级。
4. 实现中发现已确认方案需要改变组件职责或共享契约时，回到对应方案门禁重新校验和确认。
5. Reviewer 只审查代码与交付质量，不补做遗漏的架构审批。
6. Lin 补充需求、Developer 发现隐藏复杂度或 Reviewer 发现路由证据不成立时，Orchestrator 重新计算 `agentSchedule`，不得只在原计划末尾追加 Agent。
7. Direct 过程中发现可见 UI、契约、异步、权限、安全或不可逆行为时，立即停止并至少升级为 Fast UI 或 Standard。

## 8. 文件调整范围

实施阶段预计修改：

- `SKILL.md`：团队模型、阶段表、Fast/Standard/Rigorous/Multi 流程、HANDOFF 目标和自检项。
- `README.md`：角色表、流程图、治理深度说明和 Architect 按需规则。
- `manifest.json`：Liu 改为技术负责人；Chen 标明按需架构专家，不再描述为固定岗位。
- `agents/task-decomposer.md`：增加风险分级、架构路由、Standard 技术审核和升级责任。
- `agents/developer.md`：允许按路由创建 `COMPONENTS.md`/`TDD.md`，同时增加禁止自批高风险方案和升级触发器。
- `agents/architect.md`：从固定工作包阶段改为按需共享架构/高风险设计与审核模式。
- `agents/project-scanner.md`、相关模板：将硬编码的 Architect 表述改为“当前方案负责人”或按路径明确作者。
- `tests/token-efficiency.test.js`、`tests/terminology.test.js` 及相关测试：验证 Fast 不调用 Architect、Standard 由 Developer 提案并由 Liu 审核、Rigorous/Multi 按需调用 Architect。
- `templates/handoff-template.md`、`templates/task-breakdown-template.md`：记录调度输入、`agentSchedule`、依赖、并行标记和停止条件。

历史 `docs/superpowers/specs/` 保持不变；本设计作为后续行为的最新决策记录。实施时必须保留工作区已有的 Lin/grilling 相关未提交修改。

## 9. 验收标准

1. 文档和主流程不再声明 Architect 是 Fast、Standard 或所有工作包的固定前置阶段。
2. Fast 明确由 Developer 产出精简 `COMPONENTS.md`，且仍需用户确认和 `components-readiness`。
3. Standard 明确由 Developer 产出 `COMPONENTS.md`/`TDD.md`，Liu 审核后才能提交用户确认。
4. Rigorous 和存在共享架构的 Multi 明确调用 Architect。
5. Liu 的角色同时包含工作包拆分、风险分级、架构路由和 Standard 技术审核。
6. Lin 明确不负责技术拆分、执行拓扑和 Developer 下发。
7. Developer 遇到升级信号时必须停止并返回 Liu，不得自行批准高风险或跨包变更。
8. 现有产物校验、设计覆盖、用户确认、readiness、测试和代码审查门禁继续有效。
9. 自动化测试覆盖三条核心断言：Fast 无 Architect、Standard 为 Developer 提案加 Liu 审核、Rigorous/Multi 启用 Architect。
10. 所有现有测试通过，且未覆盖或丢失用户当前未提交的 Lin/grilling 修改。
11. 需求清晰时 Orchestrator 可以跳过 Lin；不清晰时必须调度 Lin，并在 `READY` 后重新计算调度。
12. Direct 只调度 Developer 与 Reviewer，且测试明确拒绝可见 UI、共享契约、异步、权限、安全和不可逆操作。
13. Fast UI 不调度 Liu/Architect；Standard 调度 Liu；Rigorous 调度 Liu 与 Architect。
14. Multi 根据共享架构证据决定是否调用 Architect，并只对依赖图允许且无共享写入的工作包并行调度 Developer。
15. `agentSchedule` 使用唯一调度项 id 和 manifest Agent id，包含职责、依赖、并行、HANDOFF 和停止/升级条件；重新编排会替换旧调度而不是追加。
