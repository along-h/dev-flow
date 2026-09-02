# Risk-Based Architecture Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消 Architect 作为固定必经岗位，让 Developer 默认承担工作包内设计与实现，由 Liu 审核 Standard 方案，并仅在 Rigorous 或存在共享架构的 Multi-workstream 中启用 Architect。

**Architecture:** 保留现有 `COMPONENTS.md`、`TDD.md`、`GLOBAL-ARCHITECTURE.md`、用户确认、`components-readiness` 和独立代码审查门禁，只改变方案作者、审核者和路由条件。Manifest 将五个核心角色与一个按需架构专家显式区分，Agent 指令负责局部职责，`SKILL.md` 负责最终编排，现有校验器继续只验证产物而不绑定作者身份。

**Tech Stack:** Markdown Agent 指令、JSON manifest、Node.js 18+、`node:test`、CommonJS、现有 `validate-artifact.js` 校验器。

**Spec:** `docs/superpowers/specs/2026-09-02-risk-based-architecture-role-design.md`

## Global Constraints

- 保留 `fast`、`standard`、`rigorous` 三种治理深度，不新增枚举。
- Lin 只负责需求基线和 `READY/BLOCKED`，不得承担技术拆分、执行拓扑或 Developer 下发。
- Fast 由 Developer 产出精简 `COMPONENTS.md`；Standard 由 Developer 产出 `COMPONENTS.md`/`TDD.md` 并由 Liu 审核。
- Rigorous 和存在共享契约的 Multi-workstream 启用 Architect；Multi 中各工作包仍独立选择治理深度。
- 不删除 `agents/architect.md`，将其改为按需专家能力。
- 保留设计覆盖、用户确认、`components-readiness`、测试和独立代码审查门禁。
- 不修改 `scripts/validate-artifact.js` 的产物结构契约，除非新增测试证明现有校验器无法支持作者变化。
- 保留工作区当前 `README.md`、`SKILL.md`、`agents/requirements-analyst.md`、`manifest.json`、`templates/prd-template.md` 中未提交的 Lin/grilling 修改；只在相关文件做最小叠加。
- 上述五个文件在执行开始前已经是 dirty，不得把它们的既有差异擅自纳入实施提交。当前工作树内完成并验证全部修改，但实施阶段默认不提交；只有用户另行授权如何处置混合差异后才能提交。
- 遵循根目录 `AGENTS.md`：新增或修改 JavaScript 字段、函数和状态时写 JSDoc，禁止 `any`，不引入无关重构。

---

### Task 1: 固化“五个核心角色 + 一个按需架构专家”元数据

**Files:**
- Modify: `tests/terminology.test.js`
- Modify: `manifest.json`
- Modify: `agents/task-decomposer.md`

**Interfaces:**
- Consumes: 设计文档第 3、5 节的角色与决策权定义。
- Produces: `manifest.agents[].optional?: boolean`；Liu 的公开别名 `Liu（技术负责人）`；Architect 的公开别名 `Chen（按需架构专家）`。

- [ ] **Step 1: 修改术语测试，先声明新的角色模型**

将 `tests/terminology.test.js` 中“所有 Agent 的用户可见代号都携带岗位”测试替换为以下测试：

```js
test("manifest 区分五个核心角色与一个按需架构专家", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const coreAliases = manifest.agents
    .filter(({ optional }) => optional !== true)
    .map(({ alias }) => alias);
  const optionalAgents = manifest.agents
    .filter(({ optional }) => optional === true)
    .map(({ alias, id }) => ({ alias, id }));

  assert.deepEqual(coreAliases, [
    "Lin（需求分析师）",
    "Liu（技术负责人）",
    "Zhang（前端开发工程师）",
    "Wang（独立质量审查官）",
    "Scanner（项目扫描师）",
  ]);
  assert.deepEqual(optionalAgents, [
    { alias: "Chen（按需架构专家）", id: "architect" },
  ]);
});
```

新增技术负责人职责测试：

```js
test("Liu 负责技术拆分、架构路由和 Standard 方案审核", () => {
  const taskDecomposer = fs.readFileSync(
    path.resolve(__dirname, "../agents/task-decomposer.md"),
    "utf8",
  );

  assert.match(taskDecomposer, /Liu（技术负责人）/);
  assert.match(taskDecomposer, /风险分级/);
  assert.match(taskDecomposer, /架构路由/);
  assert.match(taskDecomposer, /Standard[\s\S]*Developer[\s\S]*COMPONENTS\.md[\s\S]*TDD\.md/);
  assert.match(taskDecomposer, /Orchestrator[^。\n]*最终[^。\n]*(?:路由|调度)/);
});
```

- [ ] **Step 2: 运行测试并确认旧角色模型导致失败**

Run: `node --test tests/terminology.test.js`

Expected: FAIL；差异包含 `Liu（任务拆分师）`、Architect 未标记 `optional`，且 `agents/task-decomposer.md` 缺少 Standard 方案审核或架构路由描述。

- [ ] **Step 3: 最小修改 manifest 角色元数据**

在 `manifest.json` 中：

1. 将 Liu 的 `name` 改为 `技术负责人`，`alias` 改为 `Liu（技术负责人）`，`role` 改为“技术拆分与架构门禁负责人，负责工作包、依赖、风险分级、架构路由和 Standard 方案审核”。
2. 将 Chen 的 `name` 改为 `按需架构专家`，`alias` 改为 `Chen（按需架构专家）`，`role` 改为“按需架构专家，负责共享架构和高风险技术方案”，并新增顶层字段 `"optional": true`。
3. 将 Chen 条目移动到 agents 数组末尾，使五个核心角色保持连续；其余 Agent 不添加 `optional` 字段。

目标 JSON 片段必须为：

```json
{
  "id": "task-decomposer",
  "name": "技术负责人",
  "alias": "Liu（技术负责人）",
  "file": "agents/task-decomposer.md",
  "role": "技术拆分与架构门禁负责人，负责工作包、依赖、风险分级、架构路由和 Standard 方案审核",
  "persona": "先找可独立验收的交付边界，再排依赖"
}
```

```json
{
  "id": "architect",
  "name": "按需架构专家",
  "alias": "Chen（按需架构专家）",
  "file": "agents/architect.md",
  "role": "按需架构专家，负责共享架构和高风险技术方案",
  "persona": "只在共享边界和高风险决策需要独立判断时介入",
  "optional": true
}
```

- [ ] **Step 4: 扩充 Liu 的 Agent 指令**

在 `agents/task-decomposer.md` 中完成以下最小变更：

- 标题改为“技术负责人 Agent（Technical Lead）”。
- 代号改为 `Liu（技术负责人）`。
- 角色定位增加“风险分级、架构路由和 Standard 技术方案审核”，并保留“Orchestrator 做最终路由与调度”。
- 在生成候选工作包后增加“风险分级与架构路由”章节，逐项写明：Fast → Developer 自主设计；Standard → Developer 提案、Liu 审核；Rigorous → Architect；Multi 有共享边界 → Architect 产出 `GLOBAL-ARCHITECTURE.md`。
- 增加“Standard 方案审核”章节，要求 Liu 核对 Developer 的 `COMPONENTS.md`、`TDD.md`、复用判断、数据流、API、状态、测试策略和风险，问题必须退回 Developer 修正，审核结论写入 HANDOFF 或方案确认记录。
- 增加升级规则：发现共享契约、高风险不确定性或权限/安全/不可逆操作时，不得批准 Standard，必须返回 Orchestrator 升级。

- [ ] **Step 5: 运行术语测试**

Run: `node --test tests/terminology.test.js`

Expected: PASS。

- [ ] **Step 6: 记录角色元数据与技术负责人职责检查点**

```bash
git diff -- tests/terminology.test.js manifest.json agents/task-decomposer.md
```

Expected: 差异只包含本任务的角色模型、测试和 Liu 职责，以及 `manifest.json` 执行前已有的 Lin/grilling 差异；不暂存或提交。

---

### Task 2: 让 Developer 默认设计，让 Architect 仅按需介入

**Files:**
- Modify: `tests/token-efficiency.test.js`
- Modify: `agents/developer.md`
- Modify: `agents/architect.md`

**Interfaces:**
- Consumes: Task 1 的 Fast/Standard/Rigorous/Multi 路由语义。
- Produces: Developer 方案阶段协议；Architect 的 `shared-architecture | rigorous-review` 两种按需模式；升级回 Liu 的停止条件。

- [ ] **Step 1: 添加 Agent 职责失败测试**

在 `tests/token-efficiency.test.js` 增加：

```js
test("Developer 按治理深度产出方案且高风险时停止升级", () => {
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );

  assert.match(developer, /fast[\s\S]*Developer[\s\S]*COMPONENTS\.md/);
  assert.match(developer, /standard[\s\S]*Developer[\s\S]*COMPONENTS\.md[\s\S]*TDD\.md/);
  assert.match(developer, /Liu[\s\S]*审核/);
  assert.match(developer, /共享契约|权限|安全|不可逆|复杂状态/);
  assert.match(developer, /停止[\s\S]*Liu[\s\S]*(?:重新路由|升级)/);
  assert.doesNotMatch(developer, /不得自行补写架构事实/);
});

test("Architect 只接受共享架构或 Rigorous 高风险任务", () => {
  const architect = fs.readFileSync(
    path.resolve(__dirname, "../agents/architect.md"),
    "utf8",
  );

  assert.match(architect, /Chen（按需架构专家）/);
  assert.match(architect, /shared-architecture/);
  assert.match(architect, /rigorous-review/);
  assert.match(architect, /不得默认参与|不默认参与/);
  assert.doesNotMatch(architect, /对每个工作包分两个阶段执行/);
});
```

- [ ] **Step 2: 运行新增测试并确认失败**

Run: `node --test tests/token-efficiency.test.js`

Expected: FAIL；Developer 仍只读取 Architect 已确认方案，Architect 仍声明每个工作包执行 ②a/②b。

- [ ] **Step 3: 为 Developer 增加方案阶段**

在 `agents/developer.md` 的“开发流程”之前新增“方案阶段”，写明：

```text
fast：读取 HANDOFF、COMPONENT-SLICE 和受影响代码，创建精简 COMPONENTS.md；components 校验和用户确认后进入设计补水。
standard：创建候选 COMPONENTS.md 与 TDD.md，提交 Liu 审核；Liu 审核、components/tdd-proposal 校验和用户合并确认全部完成后进入设计补水。
rigorous：只读取 Architect 已确认或已审核的 COMPONENTS.md/TDD.md，不自行批准高风险方案。
multi-workstream：先读取 GLOBAL-ARCHITECTURE.md，不得重定义共享契约；当前 WP 仍按自身治理深度执行。
```

同步修改 Developer 的输入和“顺序 1”：Developer 在 Fast/Standard 是方案作者，因此不能再统一要求“先读取已确认 COMPONENTS”或“不得自行补写架构事实”；改为只有进入设计补水阶段时，必须读取已经完成对应审核、结构校验和用户确认的最终版本。

增加明确停止条件：发现共享契约、权限、安全、不可逆操作、复杂状态机、高影响并发或既有方案需要改变职责边界时，停止方案或实现并返回 Liu 重新路由，不能自行降级风险。

- [ ] **Step 4: 将 Architect 收敛为两种按需模式**

修改 `agents/architect.md`：

- 标题改为“按需架构专家 Agent（On-Demand Architect）”，代号改为 `Chen（按需架构专家）`。
- 删除“对每个工作包分两个阶段执行”的固定岗位叙述。
- 将工作模式明确为：`shared-architecture` 产出 `GLOBAL-ARCHITECTURE.md`；`rigorous-review` 产出或独立审核高风险工作包的 `COMPONENTS.md`/`TDD.md`。
- 保留 HANDOFF-first、组件复用、职责目录树、设计覆盖矩阵、风险评分和现有产物格式要求。
- 增加拒绝条件：Fast/Standard 且没有升级证据时不默认参与；工作包边界错误时退回 Liu，不自行调整业务优先级。

- [ ] **Step 5: 运行 Agent 职责与 readiness 测试**

Run: `node --test tests/token-efficiency.test.js`

Expected: 新增的两项测试 PASS；“所有治理路径按可见 UI 组件补水并执行开发准入”仍 PASS。

- [ ] **Step 6: 记录 Agent 职责调整检查点**

```bash
git diff -- tests/token-efficiency.test.js agents/developer.md agents/architect.md
```

Expected: 差异只包含方案作者、审核者、按需 Architect 和对应测试；不暂存或提交。

---

### Task 3: 改造主 Flow 的 Fast、Standard、Rigorous 与 Multi 路由

**Files:**
- Modify: `tests/token-efficiency.test.js`
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: Task 1 的 Liu 路由责任和 Task 2 的 Developer/Architect 模式。
- Produces: Orchestrator 可执行的四条路由；保持原有确认、readiness、审查顺序。

- [ ] **Step 1: 将 Fast 现有断言改为 Developer 产出方案**

在“所有治理路径按可见 UI 组件补水并执行开发准入”测试中，将 Fast 的第一个动作替换为：

```js
{
  label: "Developer 产出并确认 COMPONENTS",
  pattern: /Developer[^。\n]*COMPONENTS\.md[^。\n]*用户明确确认/,
},
```

并保留 Developer 补水、`components-readiness`、测试实现的后三个顺序断言。

- [ ] **Step 2: 新增四路由契约测试**

在 `tests/token-efficiency.test.js` 增加：

```js
test("主 Flow 按风险路由方案作者和审核者", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const standardSection = skill.match(/### `standard`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const rigorousSection = skill.match(/### `rigorous`[\s\S]*?(?=\n## )/)?.[0] ?? "";
  const multiSection = skill.match(/## 多工作流执行[\s\S]*?(?=\n## 通用)/)?.[0] ?? "";

  assert.match(fastSection, /Developer[^。\n]*COMPONENTS\.md/);
  assert.doesNotMatch(fastSection, /Architect[^。\n]*COMPONENTS\.md/);
  assert.match(standardSection, /Developer[^。\n]*COMPONENTS\.md[^。\n]*TDD\.md/);
  assert.match(standardSection, /Liu[^。\n]*审核/);
  assert.doesNotMatch(standardSection, /默认[^。\n]*Architect|Architect[^。\n]*默认/);
  assert.match(rigorousSection, /Architect/);
  assert.match(multiSection, /共享契约|共享架构/);
  assert.match(multiSection, /GLOBAL-ARCHITECTURE\.md/);
  assert.match(multiSection, /各工作包[^。\n]*(?:fast|standard|rigorous)/i);
});
```

- [ ] **Step 3: 运行路由测试并确认失败**

Run: `node --test tests/token-efficiency.test.js`

Expected: FAIL；Fast 仍由 Architect 产出 `COMPONENTS.md`，Standard 未声明 Developer 提案与 Liu 审核。

- [ ] **Step 4: 更新主技能的团队与阶段表**

在 `SKILL.md` 中：

- 团队描述改为五个核心角色和一个按需架构专家。
- Liu 改为技术负责人；Chen 改为按需架构专家。
- 阶段 ② 工作包拆分增加风险分级和架构路由。
- 原固定 ②a/②b 改为“工作包方案”，作者与审核者由治理深度决定。
- HANDOFF 示例中的 `to`、`phase` 和必读资料允许 Developer 作为方案作者；共享或高风险路径才指向 Architect。

- [ ] **Step 5: 更新四条执行路径**

严格按以下顺序改写：

```text
Fast：Liu 路由 → Developer 产出 COMPONENTS → components 校验 → 用户确认 → Developer 补水 → components-readiness → 测试实现 → Reviewer。
Standard：Liu 路由 → Developer 产出 COMPONENTS/TDD → Liu 审核 → components 与 tdd-proposal 校验 → 用户一次合并确认 → Developer 补水/readiness/测试实现 → Reviewer。
Rigorous：Liu 路由 → Architect 产出或独立审核 COMPONENTS/TDD → 分阶段校验和用户确认 → Developer 补水/readiness/测试实现 → Reviewer。
Multi：Liu 拆包与排序 → 有共享边界时 Architect 产出 GLOBAL-ARCHITECTURE → 用户确认 → 各 WP 单独选择 Fast/Standard/Rigorous。
```

保留现有完整代码审查、用户选择 P0/P1/P2、`WAIVED_BY_USER`、`selected-change-recheck` 和证据交付段落，不在本任务重写审查语义。

- [ ] **Step 6: 运行主 Flow 契约测试**

Run: `node --test tests/token-efficiency.test.js`

Expected: PASS，包括 readiness 顺序、Standard 一次合并确认、Fast 独立代码审查和新的风险路由测试。

- [ ] **Step 7: 记录主 Flow 路由检查点**

```bash
git diff -- tests/token-efficiency.test.js SKILL.md
```

Expected: 差异保留 `SKILL.md` 执行前已有的 Lin/grilling 修改，并只叠加本任务的四路由调整；不暂存或提交。

---

### Task 4: 同步公开文档、扫描提示与模板措辞

**Files:**
- Modify: `README.md`
- Modify: `agents/project-scanner.md`
- Modify: `templates/component-index-template.md`
- Modify: `templates/task-breakdown-template.md`
- Modify: `templates/tdd-template.md`
- Modify: `templates/global-architecture-template.md`
- Modify: `tests/terminology.test.js`

**Interfaces:**
- Consumes: Task 3 已稳定的四条路由。
- Produces: 用户可见说明、项目扫描交接和产物模板与运行时一致。

- [ ] **Step 1: 添加公开说明一致性测试**

在 `tests/terminology.test.js` 增加：

```js
test("公开说明将 Architect 表述为按需能力", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const readmeContent = fs.readFileSync(README_PATH, "utf8");

  for (const content of [skillContent, readmeContent]) {
    assert.match(content, /五个核心角色|5 个核心角色/);
    assert.match(content, /按需架构专家/);
    assert.match(content, /fast[\s\S]*Developer[\s\S]*COMPONENTS\.md/i);
    assert.match(content, /standard[\s\S]*Developer[\s\S]*Liu[\s\S]*审核/i);
    assert.match(content, /rigorous[\s\S]*Architect/i);
  }
});
```

- [ ] **Step 2: 运行公开说明测试并确认 README 失败**

Run: `node --test tests/terminology.test.js`

Expected: FAIL；README 仍将 Chen 列为固定前端架构师，Fast 仍声明 Architect 先产出方案。

- [ ] **Step 3: 更新 README**

完成以下同步：

- 团队介绍改为“五个核心角色 + 一个按需架构专家”。
- Liu 行改为技术负责人；Chen 从核心角色表移到“按需专家”说明。
- 流程图和治理深度说明使用 Task 3 的四条执行路径。
- 明确 Architect 不默认参与 Fast/Standard；Standard 的 Liu 审核不得替代用户确认。
- 保留当前工作区已经修改的 Lin/grilling 文案。

- [ ] **Step 4: 更新 Scanner 与模板中的作者硬编码**

逐文件修改：

- `agents/project-scanner.md`：把“由 Architect 决定是否扩读”改为“由当前方案负责人决定；Standard 为 Developer 提案、Liu 审核，Rigorous/Multi 共享层为 Architect”。“给 Architect/开发者”改为“给方案负责人和开发者”。
- `templates/component-index-template.md`：将“给 Architect（组件拆分时）”改为“给方案负责人（组件拆分时）”。
- `templates/task-breakdown-template.md`：在编排建议中增加每个 WP 的方案作者、技术审核者和 Architect 触发器；第 0 批仍保留共享架构校验和用户确认。
- `templates/tdd-template.md`：将页尾“架构师完成本方案后”改为“当前方案负责人完成、并按治理路径通过 Liu 或 Architect 技术审核后”。
- `templates/global-architecture-template.md`：保留 Architect 作为共享架构作者，但明确只有任务拆分确认存在共享边界时启用。

- [ ] **Step 5: 搜索不再适用的固定岗位表述**

Run:

```bash
rg -n "Architect 产出|架构师完成本方案|对每个工作包分两个阶段|Chen（前端架构师）|Liu（任务拆分师）" SKILL.md README.md manifest.json agents templates tests
```

Expected: 无输出。若历史示例必须保留，改写为当前术语；不要通过排除文件掩盖运行时不一致。

- [ ] **Step 6: 运行文档与术语测试**

Run: `node --test tests/terminology.test.js tests/token-efficiency.test.js`

Expected: PASS。

- [ ] **Step 7: 记录公开文档和模板检查点**

```bash
git diff -- README.md agents/project-scanner.md templates/component-index-template.md templates/task-breakdown-template.md templates/tdd-template.md templates/global-architecture-template.md tests/terminology.test.js
```

Expected: `README.md` 保留执行前已有的 Lin/grilling 差异，其他差异只同步按需 Architect 术语和路由；不暂存或提交。

---

### Task 5: 全量验证与变更边界审计

**Files:**
- Verify: `README.md`
- Verify: `SKILL.md`
- Verify: `manifest.json`
- Verify: `agents/*.md`
- Verify: `templates/*.md`
- Verify: `tests/*.test.js`

**Interfaces:**
- Consumes: Tasks 1–4 的所有变更。
- Produces: 可交付的回归证据；不产生新运行时接口。

- [ ] **Step 1: 检查格式与未解决占位符**

Run: `git diff --check`

Expected: 退出码 0，无尾随空格或冲突标记。

Run:

```bash
rg -n "T[B]D|T[O]DO|<<<<<<<|=======|>>>>>>>" README.md SKILL.md manifest.json agents templates tests
```

Expected: 无本次变更新增的占位符或冲突标记；若仓库原有合法待办注释，记录具体路径并证明不在本次差异中。

- [ ] **Step 2: 运行完整测试套件**

Run: `npm test`

Expected: 退出码 0，所有 `tests/*.test.js` 通过。

- [ ] **Step 3: 运行安装自检**

Run: `npm run check`

Expected: 退出码 0，安装文件、manifest、模板和校验器自检全部通过。

- [ ] **Step 4: 审计风险路由关键词**

Run:

```bash
rg -n "fast|standard|rigorous|multi-workstream|按需架构专家|Liu（技术负责人）|components-readiness" README.md SKILL.md manifest.json agents templates
```

Expected: Fast/Standard 不再把 Architect 写成固定作者；Rigorous 和 Multi 共享边界仍能定位到 Architect；所有实现路径仍包含 `components-readiness`。

- [ ] **Step 5: 核对未提交差异归属**

Run: `git status --short`

Expected: 只显示本轮计划内尚未提交的文件，或用户原先的 Lin/grilling 修改；不得出现临时文件、生成缓存或无关源码。

- [ ] **Step 6: 记录最终状态，不擅自提交混合差异**

记录 `npm test` 和 `npm run check` 的退出码与摘要作为最终交付证据。保持实施文件未暂存；最终报告中分别列出执行前已有的五个 dirty 文件和本次新增修改，等待用户另行决定是否以及如何提交混合差异。
