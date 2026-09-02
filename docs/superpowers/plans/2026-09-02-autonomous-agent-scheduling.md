# Autonomous Agent Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Orchestrator 先判断需求清晰度，再根据复杂度、风险、拓扑和共享架构证据生成最小充分的 `agentSchedule`，并在新证据出现时安全地重新编排。

**Architecture:** 继续以 `SKILL.md` 作为运行时编排契约，以 `manifest.json` 作为唯一 Agent id 来源，以 HANDOFF 和任务拆分模板持久化调度输入与依赖图。新增文档契约测试先锁定清晰度分流、Direct 限制、复杂度矩阵、并行条件和替换式重编排，再同步各 Agent 指令、模板与 README；现有 `fast | standard | rigorous` 治理枚举保持不变，`direct-development` 只是 Fast 的调度变体。

**Tech Stack:** Markdown Skill/Agent 指令、JSON manifest、Node.js 18+、CommonJS、`node:test`、Shell 安装校验。

**Spec:** `docs/superpowers/specs/2026-09-02-risk-based-architecture-role-design.md`

## Global Constraints

- 保留现有治理枚举的精确值：`fast`、`standard`、`rigorous`；不得新增第四种治理深度。
- 调度判断字段的精确值为：`requirementClarity: clear | unclear`、`complexity: trivial | simple | moderate | complex`、`topology: single-workstream | multi-workstream`、`risk: low | medium | high`、`hasSharedArchitecture: boolean`。
- `agentSchedule` 中的 Agent id 必须来自 `manifest.json`，调度项 id 必须唯一，`dependsOn` 只能引用调度项 id。
- 每个调度项必须记录职责、依赖、并行标记、HANDOFF 和 `stopWhen` 停止/升级条件。
- `unclear` 必须调度 `requirements-analyst`；Lin 输出 `READY` 后必须重算全部调度字段并替换旧 `agentSchedule`。
- `direct-development` 只允许清晰、低风险、单工作流、可立即回滚的纯机械非 UI 修改；不得涉及可见 UI、契约、异步、权限、安全或不可逆操作。
- Direct 仍强制测试、真实运行证据和独立 `code-reviewer`，只跳过 Lin、Liu、Architect、方案产物和 `components-readiness`。
- 多工作包只有在无共享写入、契约稳定且依赖图允许时才能并行；执行中只允许自动升级。
- 保留工作区已有的 Lin/grilling 及风险架构调整，不覆盖、回退或顺手重构无关改动。
- 遵守根目录 `AGENTS.md`：新增 JavaScript 字段、常量和函数必须有 JSDoc，禁止 `any`、未使用项和无意义注释。
- 当前 `main` 上已有用户未提交改动；实现阶段不得用批量提交把这些改动纳入本任务提交，使用精确 diff 和测试结果作为检查点。

---

### Task 1: 锁定自主调度运行时契约

**Files:**
- Create: `tests/orchestration.test.js`
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: `manifest.json` 中的 `requirements-analyst`、`task-decomposer`、`developer`、`architect`、`code-reviewer` Agent id，以及设计文档 §4 的调度矩阵。
- Produces: `SKILL.md` 中统一的 `requirementClarity`、`complexity`、`topology`、`risk`、`hasSharedArchitecture` 和 `agentSchedule` 运行时契约，供后续 Agent 指令与模板引用。

- [ ] **Step 1: 创建清晰度、调度结构和重编排失败测试**

创建 `tests/orchestration.test.js`，写入以下测试骨架和首批断言：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

/** Dev Flow Agent 清单文件路径。 */
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");

test("Orchestrator 先按需求清晰度决定是否调度 Lin", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /requirementClarity[^\n]*clear[^\n]*unclear/);
  assert.match(skillContent, /clear[\s\S]{0,500}跳过[^\n]*requirements-analyst/);
  assert.match(skillContent, /unclear[\s\S]{0,500}requirements-analyst/);
  assert.match(skillContent, /Lin[^\n]*READY[\s\S]{0,300}重新计算|READY[\s\S]{0,300}重算/);
});

test("agentSchedule 使用 manifest Agent id 和完整调度字段", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const agentIds = manifest.agents.map(({ id }) => id);

  for (const agentId of [
    "requirements-analyst",
    "task-decomposer",
    "developer",
    "architect",
    "code-reviewer",
  ]) {
    assert.ok(agentIds.includes(agentId));
    assert.match(skillContent, new RegExp(`\\b${agentId}\\b`));
  }

  for (const field of ["id", "agent", "role", "dependsOn", "parallel", "handoff", "stopWhen"]) {
    assert.match(skillContent, new RegExp(`\\b${field}\\b`));
  }
  assert.match(skillContent, /dependsOn[^\n]*调度项 id/);
});

test("命中停止条件后替换旧调度且只自动升级", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /stopWhen[\s\S]{0,500}(?:替换|废弃)[^\n]*旧[^\n]*agentSchedule/);
  assert.match(skillContent, /只允许自动升级/);
  assert.match(skillContent, /不得[^。\n]*追加/);
});
```

- [ ] **Step 2: 运行新增测试并确认红灯原因**

Run: `node --test tests/orchestration.test.js`

Expected: FAIL；至少缺少 `requirementClarity`、`agentSchedule` 或“替换旧调度”的断言，不得是 JavaScript 语法错误。

- [ ] **Step 3: 在主技能中定义统一调度输入和输出**

在 `SKILL.md` 的编排契约区加入以下等价结构，保留字段名和枚举值：

```json
{
  "requirementClarity": "clear | unclear",
  "complexity": "trivial | simple | moderate | complex",
  "topology": "single-workstream | multi-workstream",
  "risk": "low | medium | high",
  "hasSharedArchitecture": false,
  "agentSchedule": [
    {
      "id": "WP01-developer",
      "agent": "developer",
      "role": "proposal-and-implementation",
      "dependsOn": [],
      "parallel": false,
      "handoff": ".dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md",
      "stopWhen": ["发现共享契约", "风险升级"]
    }
  ]
}
```

同时明确：

```text
- requirementClarity = clear：Orchestrator 生成可验证的精简需求基线和适用的设计源登记，跳过 requirements-analyst。
- requirementClarity = unclear：调度 requirements-analyst；Lin 返回 READY 后重算全部判断字段并生成新 scheduleVersion。
- dependsOn 仅引用调度项 id；agent 仅使用 manifest.json 中存在的 Agent id。
- 任一 stopWhen 命中后停止相关项，废弃并替换旧 agentSchedule，不在末尾追加补丁项。
- 执行中只允许自动升级；降级必须重新证明高风险信号已经消失。
```

- [ ] **Step 4: 运行自主调度契约测试**

Run: `node --test tests/orchestration.test.js`

Expected: PASS，3 tests passed。

- [ ] **Step 5: 检查本任务精确差异**

Run: `git diff -- tests/orchestration.test.js SKILL.md`

Expected: 只包含新增契约测试和 Orchestrator 调度输入/输出定义；不得删除现有 Lin grilling、设计覆盖或风险架构路由。

---

### Task 2: 实现按复杂度选择最小 Agent 集合

**Files:**
- Modify: `tests/orchestration.test.js`
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: Task 1 的五个调度输入字段和 `agentSchedule` 项结构。
- Produces: `direct-development`、Fast UI、Standard、Rigorous、Multi 无共享架构和 Multi 有共享架构六条确定性路径。

- [ ] **Step 1: 添加复杂度矩阵和 Direct 限制失败测试**

在 `tests/orchestration.test.js` 追加：

```js
test("复杂度矩阵选择最小充分 Agent 集合", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /direct-development[\s\S]{0,600}developer[\s\S]{0,300}code-reviewer/i);
  assert.match(skillContent, /Fast UI[\s\S]{0,600}Developer[^\n]*方案[\s\S]{0,300}用户确认[\s\S]{0,300}Reviewer/i);
  assert.match(skillContent, /Standard[\s\S]{0,800}task-decomposer[\s\S]{0,300}developer[\s\S]{0,300}Liu[^\n]*审核/i);
  assert.match(skillContent, /Rigorous[\s\S]{0,800}task-decomposer[\s\S]{0,300}architect[\s\S]{0,300}developer/i);
  assert.match(skillContent, /Multi 无共享架构[\s\S]{0,800}task-decomposer[\s\S]{0,400}developer[\s\S]{0,300}code-reviewer/i);
  assert.match(skillContent, /Multi 有共享架构[\s\S]{0,800}architect[\s\S]{0,400}developer[\s\S]{0,300}code-reviewer/i);
});

test("Direct 只允许机械非 UI 修改且保留交付门禁", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /direct-development[^\n]*Fast[^\n]*调度变体/i);
  for (const forbiddenSignal of ["可见 UI", "共享契约", "异步", "权限", "安全", "不可逆"]) {
    assert.match(skillContent, new RegExp(`Direct[\\s\\S]{0,1200}${forbiddenSignal}`, "i"));
  }
  assert.match(skillContent, /Direct[\s\S]{0,1200}测试[\s\S]{0,300}真实运行证据[\s\S]{0,300}(?:独立 )?Reviewer/i);
  assert.match(skillContent, /Direct[\s\S]{0,1200}跳过[\s\S]{0,300}components-readiness/i);
});

test("多工作包只在安全条件满足时并行", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /并行[\s\S]{0,500}无共享写入/);
  assert.match(skillContent, /并行[\s\S]{0,500}契约稳定/);
  assert.match(skillContent, /并行[\s\S]{0,500}依赖图/);
});
```

- [ ] **Step 2: 运行矩阵测试并确认红灯**

Run: `node --test tests/orchestration.test.js`

Expected: FAIL；新增 3 个测试至少一个因缺少 Direct、Multi 或并行规则而失败。

- [ ] **Step 3: 在 SKILL.md 增加最小充分调度矩阵**

加入一张包含以下精确路线的表，不创建新的 manifest Agent：

```text
direct-development = developer → code-reviewer
Fast UI = developer(proposal) → user-confirmation → developer(implementation) → code-reviewer
Standard = task-decomposer → developer(proposal) → task-decomposer(Liu review) → user-confirmation → developer(implementation) → code-reviewer
Rigorous = task-decomposer → architect → user-confirmation → developer → code-reviewer
Multi 无共享架构 = task-decomposer → dependency batches of developer → per-package code-reviewer
Multi 有共享架构 = task-decomposer → architect(shared architecture) → dependency batches of developer → per-package code-reviewer
```

Direct 的准入说明必须同时包含：`clear + trivial + single-workstream + low`、纯机械非 UI、可立即回滚、禁止可见 UI/共享契约/异步/权限/安全/不可逆操作、保留测试/真实运行证据/Reviewer、跳过方案产物与 `components-readiness`。

多工作包并行说明必须同时包含：没有共享写入文件、共享契约已经稳定、依赖图允许当前批次并行。任何一项不满足时按拓扑批次串行执行。

- [ ] **Step 4: 运行新增文件全部测试**

Run: `node --test tests/orchestration.test.js`

Expected: PASS，6 tests passed。

- [ ] **Step 5: 运行既有术语与路由回归测试**

Run: `node --test tests/terminology.test.js tests/token-efficiency.test.js`

Expected: PASS；Fast、Standard、Rigorous 的既有风险路由断言仍成立。

---

### Task 3: 让各 Agent 遵守调度与停止协议

**Files:**
- Modify: `tests/orchestration.test.js`
- Modify: `agents/requirements-analyst.md`
- Modify: `agents/task-decomposer.md`
- Modify: `agents/developer.md`
- Modify: `agents/architect.md`
- Modify: `agents/code-reviewer.md`

**Interfaces:**
- Consumes: Task 1 的调度字段、Task 2 的路线矩阵、现有 `READY/BLOCKED` 和风险升级规则。
- Produces: 每个可调度 Agent 的准入、输出和 `stopWhen` 行为；Reviewer 提供路由证据失效后的重编排信号。

- [ ] **Step 1: 添加 Agent 行为契约失败测试**

在测试文件顶部增加路径常量，并追加测试：

```js
/** 需求分析师 Agent 指令路径。 */
const REQUIREMENTS_ANALYST_PATH = path.resolve(__dirname, "../agents/requirements-analyst.md");

/** 技术负责人 Agent 指令路径。 */
const TASK_DECOMPOSER_PATH = path.resolve(__dirname, "../agents/task-decomposer.md");

/** Developer Agent 指令路径。 */
const DEVELOPER_PATH = path.resolve(__dirname, "../agents/developer.md");

/** Architect Agent 指令路径。 */
const ARCHITECT_PATH = path.resolve(__dirname, "../agents/architect.md");

/** Reviewer Agent 指令路径。 */
const REVIEWER_PATH = path.resolve(__dirname, "../agents/code-reviewer.md");

test("Agent 指令遵守清晰度准入和隐藏复杂度升级", () => {
  const requirementsAnalyst = fs.readFileSync(REQUIREMENTS_ANALYST_PATH, "utf8");
  const taskDecomposer = fs.readFileSync(TASK_DECOMPOSER_PATH, "utf8");
  const developer = fs.readFileSync(DEVELOPER_PATH, "utf8");
  const architect = fs.readFileSync(ARCHITECT_PATH, "utf8");
  const reviewer = fs.readFileSync(REVIEWER_PATH, "utf8");

  assert.match(requirementsAnalyst, /requirementClarity[^\n]*unclear/);
  assert.match(requirementsAnalyst, /READY[\s\S]{0,400}(?:重新编排|重算)/);
  assert.match(taskDecomposer, /moderate|complex/);
  assert.match(taskDecomposer, /multi-workstream|边界不确定/);
  assert.match(developer, /direct-development/);
  assert.match(developer, /Direct[\s\S]{0,800}(?:可见 UI|共享契约|异步)[\s\S]{0,400}(?:停止|升级)/i);
  assert.match(architect, /shared-architecture|rigorous-review/);
  assert.match(reviewer, /路由证据[\s\S]{0,400}(?:重新编排|Orchestrator)/);
});
```

- [ ] **Step 2: 运行 Agent 契约测试并确认红灯**

Run: `node --test tests/orchestration.test.js`

Expected: FAIL；缺少需求分析师的 `requirementClarity` 准入、Developer Direct 模式或 Reviewer 重编排回报。

- [ ] **Step 3: 更新需求分析师和技术负责人指令**

在 `agents/requirements-analyst.md` 明确：只接受 `requirementClarity = unclear` 的 HANDOFF；输出 `BLOCKED` 时不得排后续开发；输出 `READY` 时只证明需求基线可重新判断，不沿用旧复杂度和旧 schedule，返回 Orchestrator 重算。

在 `agents/task-decomposer.md` 明确：只在 `moderate`、`complex`、`multi-workstream` 或边界不确定时由 Orchestrator 调度；输出候选依赖批次、共享架构证据、风险等级、建议 Agent 和停止条件，但 Orchestrator 仍负责生成最终 `agentSchedule`。

- [ ] **Step 4: 更新 Developer、Architect 和 Reviewer 指令**

在 `agents/developer.md` 增加 `direct-development` 模式：只做 HANDOFF 指定的机械修改，先写/更新测试再实现，提供真实命令证据，不创建 `COMPONENTS.md`，命中可见 UI、共享契约、异步、权限、安全或不可逆行为立即停止并回报重编排。

在 `agents/architect.md` 保持且明确只接受 `shared-architecture` 与 `rigorous-review` 两种职责，不因 `complexity` 文本单独越权改业务范围。

在 `agents/code-reviewer.md` 增加调度一致性审查：核对实际改动没有超出 HANDOFF 路由证据；发现 Direct 准入不成立、共享边界遗漏或实际复杂度升级时，记录证据并返回 Orchestrator 重新编排，不代补架构审批。

- [ ] **Step 5: 运行 Agent 契约与全量文档测试**

Run: `npm test`

Expected: PASS；新增 Agent 行为测试和所有既有测试通过。

---

### Task 4: 持久化调度输入、依赖和替换式重编排

**Files:**
- Modify: `tests/orchestration.test.js`
- Modify: `templates/handoff-template.md`
- Modify: `templates/task-breakdown-template.md`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: Task 1 的调度输入字段与调度项结构、Task 2 的依赖批次规则。
- Produces: HANDOFF 的当前调度项上下文、任务拆分中的完整 `agentSchedule` 和 manifest 的公开调度能力声明。

- [ ] **Step 1: 添加模板和 manifest 失败测试**

在顶部增加三个路径常量并追加：

```js
/** HANDOFF 模板路径。 */
const HANDOFF_TEMPLATE_PATH = path.resolve(__dirname, "../templates/handoff-template.md");

/** 任务拆分模板路径。 */
const TASK_BREAKDOWN_TEMPLATE_PATH = path.resolve(__dirname, "../templates/task-breakdown-template.md");

test("模板持久化调度判断、依赖和停止条件", () => {
  const handoffTemplate = fs.readFileSync(HANDOFF_TEMPLATE_PATH, "utf8");
  const taskTemplate = fs.readFileSync(TASK_BREAKDOWN_TEMPLATE_PATH, "utf8");

  for (const field of [
    "requirementClarity",
    "complexity",
    "topology",
    "risk",
    "hasSharedArchitecture",
    "scheduleVersion",
  ]) {
    assert.match(handoffTemplate, new RegExp(field));
    assert.match(taskTemplate, new RegExp(field));
  }

  for (const field of ["id", "agent", "role", "dependsOn", "parallel", "HANDOFF", "stopWhen"]) {
    assert.match(taskTemplate, new RegExp(field));
  }
  assert.match(taskTemplate, /重编排[\s\S]{0,400}(?:替换|废弃)[^\n]*旧调度/);
});

test("manifest 公开复杂度自适应调度能力且保持治理枚举", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  assert.equal(manifest.capabilities.scheduling, "complexity-adaptive");
  assert.deepEqual(manifest.capabilities.governance, ["fast", "standard", "rigorous"]);
});
```

- [ ] **Step 2: 运行模板测试并确认红灯**

Run: `node --test tests/orchestration.test.js`

Expected: FAIL；模板缺少调度字段，manifest 缺少 `scheduling` 能力。

- [ ] **Step 3: 扩充 HANDOFF 模板**

在 `templates/handoff-template.md` 的目标区后增加调度上下文：

```markdown
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
```

- [ ] **Step 4: 扩充任务拆分模板和 manifest**

在 `templates/task-breakdown-template.md` 的“编排决策”中补全五个判断字段和 `scheduleVersion`，并增加：

```markdown
### 5.4 Agent 调度表

**scheduleVersion**：`v{n}`

| id | agent | role | dependsOn | parallel | HANDOFF | stopWhen |
|----|-------|------|-----------|----------|---------|----------|
| WP01-developer | developer | proposal-and-implementation | [] | false | `.dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md` | 发现共享契约；风险升级 |
| WP01-reviewer | code-reviewer | independent-review | [WP01-developer] | false | `.dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md` | 缺少真实运行证据 |

### 5.5 重编排记录

命中 `stopWhen` 时停止相关调度项，记录新证据，废弃并替换旧调度；不得向旧调度末尾追加补丁项。执行中只允许自动升级。
```

在 `manifest.json` 的 `capabilities` 中添加精确键值：

```json
"scheduling": "complexity-adaptive"
```

不得改变现有 `governance` 数组的三个值。

- [ ] **Step 5: 运行模板、JSON 和安装检查**

Run: `node --test tests/orchestration.test.js && npm run check`

Expected: PASS；新增测试全部通过，安装检查报告所有检查项通过。

---

### Task 5: 同步公开流程并完成回归验证

**Files:**
- Modify: `tests/orchestration.test.js`
- Modify: `README.md`
- Modify: `agents/project-scanner.md`
- Modify: `templates/component-index-template.md`
- Modify: `templates/global-architecture-template.md`
- Modify: `templates/tdd-template.md`

**Interfaces:**
- Consumes: Tasks 1–4 的最终术语、调度矩阵和模板字段。
- Produces: 用户可见说明、扫描与设计产物措辞和完整回归证据，不引入第二套调度规则。

- [ ] **Step 1: 添加公开文档一致性失败测试**

在测试文件顶部增加 README 路径并追加：

```js
/** Dev Flow 公开说明文件路径。 */
const README_PATH = path.resolve(__dirname, "../README.md");

test("README 公开清晰度分流和复杂度自适应调度", () => {
  const readmeContent = fs.readFileSync(README_PATH, "utf8");

  assert.match(readmeContent, /需求清晰度/);
  assert.match(readmeContent, /clear[\s\S]{0,500}跳过[^\n]*(?:Lin|需求分析师)/i);
  assert.match(readmeContent, /unclear[\s\S]{0,500}(?:Lin|requirements-analyst)/i);
  assert.match(readmeContent, /direct-development[\s\S]{0,600}Developer[\s\S]{0,300}Reviewer/i);
  assert.match(readmeContent, /agentSchedule/);
  assert.match(readmeContent, /stopWhen[\s\S]{0,400}重新编排/);
});
```

- [ ] **Step 2: 运行 README 一致性测试并确认红灯**

Run: `node --test tests/orchestration.test.js`

Expected: FAIL；README 尚未完整说明清晰度分流、Direct 和 `agentSchedule`。

- [ ] **Step 3: 同步 README 和关联产物措辞**

在 `README.md` 加入与 `SKILL.md` 相同的六条调度路线、Direct 硬限制、清晰需求跳过 Lin、不清晰需求由 Lin 补充后重编排、`agentSchedule` 字段和并行安全条件。

检查 `agents/project-scanner.md` 与三个设计模板：将“所有任务先交给需求分析师/技术负责人/架构师”的固定串行措辞改为“按当前 `agentSchedule` 和 HANDOFF 定向读取/输出”；不得削弱现有设计覆盖矩阵、共享架构或 `components-readiness` 门禁。

- [ ] **Step 4: 执行全量测试与安装校验**

Run: `npm test`

Expected: PASS；所有 `tests/*.test.js` 通过且无跳过。

Run: `npm run check`

Expected: PASS；安装结构、manifest、模板与脚本校验全部通过。

- [ ] **Step 5: 执行差异质量检查**

Run: `git diff --check`

Expected: 无输出，exit code 0。

Run: `git diff --stat`

Expected: 变更仅覆盖本计划列出的运行时、Agent、模板、README 和测试文件；历史 spec/plan 提交不被改写。

Run: `git status --short`

Expected: 能区分新建 `tests/orchestration.test.js` 与实现前已有的用户改动；不执行 `git reset`、`git checkout --` 或批量提交。

- [ ] **Step 6: 对照设计验收标准完成最终自检**

逐条确认设计文档 §9 的 11–15：清晰需求跳过 Lin、Direct 仅 Developer + Reviewer、Fast/Standard/Rigorous 的 Agent 集合正确、Multi 的 Architect 与并行条件由证据决定、`agentSchedule` 字段完整且重编排替换旧计划。若任一项缺少可定位的测试或运行时文字，回到对应任务补齐后重新运行 Step 4–5。
