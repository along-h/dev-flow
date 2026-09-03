# Dev Flow v2 Lean Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the prompt-heavy workflow with boundary-based ownership, user-selected design input, and dependency-wave parallelism while preserving legacy artifact validation.

**Architecture:** SKILL.md becomes the concise source of truth for v2. Role files contain only role-specific behavior, two active templates carry minimal execution contracts, and legacy Rigorous behavior is isolated behind an explicit reference that new runs never load by default.

**Tech Stack:** Markdown skills and prompts, Node.js 18+, CommonJS, node:test, shell installation checks.

**Spec:** docs/superpowers/specs/2026-09-03-dev-flow-v2-lean-orchestration-design.md

## Global Constraints

- New v2 runs never generate a design coverage matrix, DESIGN-SOURCES.md, module design specs, or run components-readiness.
- Existing legacy templates, scripts/validate-artifact.js, and tests/validate-artifact.test.js remain compatible.
- UI work receives one user design choice before implementation: provided-specific or use-current-basis.
- Components, Hooks, state, and memoization are decided from ownership, change boundaries, contracts, and evidence.
- Same-wave work packages have no unresolved dependency, shared write, or file ownership conflict.
- Preserve the untracked .understand-anything/ directory and unrelated worktree state.
- The repository has no AGENTS.md; external mechanical AGENTS rules require separate user-side removal.

---

### Task 1: Replace the core orchestration contract

**Files:**
- Modify: tests/orchestration.test.js
- Modify: SKILL.md
- Create: references/legacy-rigorous.md

**Interfaces:**
- Consumes: the approved v2 design spec.
- Produces: the v2 phase order, designMode, dependency waves, and the explicit legacy entry point.

- [ ] **Step 1: Replace orchestration tests with v2 behavior tests**

Use the existing CommonJS style. Define JSDoc-documented constants for SKILL_PATH and LEGACY_REFERENCE_PATH, then add:

~~~javascript
test('v2 在 UI 实现前取得用户设计选择', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8')
  const requirementsIndex = skill.indexOf('需求基线')
  const breakdownIndex = skill.indexOf('工作包拆分')
  const designChoiceIndex = skill.indexOf('开发前设计选择')
  const implementationIndex = skill.indexOf('实现与验证')

  assert.ok(requirementsIndex >= 0)
  assert.ok(requirementsIndex < breakdownIndex)
  assert.ok(breakdownIndex < designChoiceIndex)
  assert.ok(designChoiceIndex < implementationIndex)
  assert.match(skill, /provided-specific/)
  assert.match(skill, /use-current-basis/)
})

test('同一依赖波次允许安全并行', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8')
  assert.match(skill, /同一(?:批次|波次)[\s\S]{0,500}并行/)
  assert.match(skill, /无共享写入/)
  assert.match(skill, /文件[^。\n]*冲突/)
  assert.doesNotMatch(
    skill,
    /当前工作包[^。\n]*验收[^。\n]*才[^。\n]*下一个工作包/,
  )
})

test('v2 默认流程不调用旧设计矩阵门禁', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8')
  assert.doesNotMatch(skill, /node[^\n]*components-readiness/)
  assert.doesNotMatch(skill, /输出[^。\n]*DESIGN-SOURCES\.md/)
})

test('旧流程只有显式兼容入口', () => {
  assert.equal(fs.existsSync(LEGACY_REFERENCE_PATH), true)
  assert.match(fs.readFileSync(SKILL_PATH, 'utf8'), /legacy-rigorous\.md/)
})
~~~

- [ ] **Step 2: Run the test and verify RED**

Run: node --test tests/orchestration.test.js

Expected: FAIL because the old skill still contains active readiness commands, the serialized package gate, and no user design-choice phase.

- [ ] **Step 3: Create the legacy-only reference**

Create references/legacy-rigorous.md with four sections: explicit load conditions, the existing artifact-to-template map, the existing validator command, and a migration boundary forbidding implicit conversion between legacy and v2.

- [ ] **Step 4: Rewrite SKILL.md as the v2 source of truth**

Keep the YAML header. In order, define role routing, intake, targeted discovery, requirement baseline, work-package ownership and waves, the user design-choice gate, governance routing, implementation and verification, boundary rules, budgets, and recovery.

The design-choice contract is:

~~~text
designMode: provided-specific | use-current-basis
designReferences: concrete links or existing project paths
appliesTo: work-package ids
manualVisualChecks: observable checks only
~~~

New Rigorous runs add technical risk depth but still use this contract and never create the legacy design-matrix chain. Mention references/legacy-rigorous.md only under explicit legacy recovery.

- [ ] **Step 5: Run the test and verify GREEN**

Run: node --test tests/orchestration.test.js

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add SKILL.md references/legacy-rigorous.md tests/orchestration.test.js
git commit -m "feat: define lean v2 orchestration"
~~~

---

### Task 2: Simplify active role prompts

**Files:**
- Modify: tests/token-efficiency.test.js
- Modify: agents/requirements-analyst.md
- Modify: agents/task-decomposer.md
- Modify: agents/architect.md
- Modify: agents/developer.md
- Modify: agents/code-reviewer.md
- Modify: agents/project-scanner.md

**Interfaces:**
- Consumes: the Task 1 v2 contract.
- Produces: six role prompts that accept minimal work-package context and do not restate the full pipeline.

- [ ] **Step 1: Replace token-efficiency tests**

Define AGENT_PATHS and the individual role paths as JSDoc-documented constants. Add:

~~~javascript
/** 返回文件的非空行数。 */
function countNonEmptyLines(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length
}

test('主 Skill 与角色提示词保持 v2 预算', () => {
  const skill = fs.readFileSync(SKILL_PATH, 'utf8')
  assert.ok(countNonEmptyLines(skill) <= 300)

  let activeAgentLines = 0
  for (const filePath of AGENT_PATHS) {
    const lineCount = countNonEmptyLines(
      fs.readFileSync(filePath, 'utf8'),
    )
    assert.ok(lineCount <= 140, filePath)
    activeAgentLines += lineCount
  }
  assert.ok(activeAgentLines <= 720)
})

test('活动提示词不使用机械代码拆分规则', () => {
  const active = [SKILL_PATH, ...AGENT_PATHS]
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.doesNotMatch(active, /出现 2 次以上的 UI 或逻辑[^\n]*抽取/)
  assert.doesNotMatch(active, /超过 300 行的巨型组件/)
  assert.doesNotMatch(active, /超过 50 行的函数需要拆分/)
  assert.doesNotMatch(active, /未使用[^\n]*useMemo[^\n]*热点/)
})

test('角色提示词使用所有权和证据决定边界', () => {
  const developer = fs.readFileSync(DEVELOPER_PATH, 'utf8')
  const architect = fs.readFileSync(ARCHITECT_PATH, 'utf8')
  const reviewer = fs.readFileSync(REVIEWER_PATH, 'utf8')
  assert.match(developer, /最小必要所有者/)
  assert.match(developer, /固定行数[^。\n]*(?:不是|不能)/)
  assert.match(architect, /共享契约/)
  assert.match(reviewer, /测量|证据/)
})
~~~

- [ ] **Step 2: Run the test and verify RED**

Run: node --test tests/token-efficiency.test.js

Expected: FAIL because current prompts exceed budgets and contain mechanical rules.

- [ ] **Step 3: Rewrite each role around unique responsibility**

- Requirements Analyst: grilling, facts versus decisions, concise acceptance baseline; no design-completeness judgment or design artifact generation.
- Technical Lead: outcomes, owned paths/contracts, dependsOn, file conflicts, parallelWave; Multi alone does not upgrade governance.
- Architect: minimum shared contracts and high-risk invariants only; no exhaustive component tree, reuse-count rule, or memoization map.
- Developer: obey designMode, use the smallest necessary state owner, follow existing structure, test changed behavior and real risks; no fixed layer sequence.
- Reviewer: review trigger reasons and direct impact; challenge wrong ownership and unjustified abstraction or memoization; no fixed thresholds.
- Scanner: targeted affected-path search first; build a full component index only for a real cross-module reuse investigation.

- [ ] **Step 4: Run the test and verify GREEN**

Run: node --test tests/token-efficiency.test.js

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add agents tests/token-efficiency.test.js
git commit -m "refactor: simplify v2 agent responsibilities"
~~~

---

### Task 3: Replace active v2 templates

**Files:**
- Create: tests/v2-templates.test.js
- Modify: templates/plan-template.md
- Modify: templates/task-breakdown-template.md

**Interfaces:**
- Consumes: designMode and parallelWave.
- Produces: the only default v2 plan contracts. Other templates remain legacy-compatible.

- [ ] **Step 1: Add failing template tests**

~~~javascript
test('PLAN 记录用户设计选择且不包含设计矩阵', () => {
  const plan = fs.readFileSync(PLAN_PATH, 'utf8')
  assert.match(plan, /designMode/)
  assert.match(plan, /provided-specific/)
  assert.match(plan, /use-current-basis/)
  assert.doesNotMatch(plan, /设计覆盖矩阵|components-readiness/)
  assert.ok(plan.split(/\r?\n/).length <= 80)
})

test('多工作包模板记录所有权和并行波次', () => {
  const breakdown = fs.readFileSync(BREAKDOWN_PATH, 'utf8')
  assert.match(breakdown, /parallelWave/)
  assert.match(breakdown, /拥有路径|文件所有权/)
  assert.match(breakdown, /dependsOn/)
  assert.match(breakdown, /共享写入|文件冲突/)
  assert.doesNotMatch(breakdown, /WP01-reviewer/)
})
~~~

PLAN_PATH and BREAKDOWN_PATH must be JSDoc-documented constants.

- [ ] **Step 2: Run the test and verify RED**

Run: node --test tests/v2-templates.test.js

Expected: FAIL because the templates lack designMode and parallelWave and prefill Reviewer scheduling.

- [ ] **Step 3: Rewrite plan-template.md**

Keep it below 80 lines with outcome and scope, acceptance, owned files, implementation decisions, user design choice, real risks, validation, rollback, and confirmation. Do not reference legacy design artifacts.

- [ ] **Step 4: Rewrite task-breakdown-template.md**

Use this work-package table:

~~~markdown
| WP | Outcome | Scope | Owned paths/contracts | Read-only dependencies | dependsOn | parallelWave | Acceptance | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
~~~

Add a separate shared-write and overlapping-file conflict check. Use wave 0 only for a necessary shared contract. Do not prefill Reviewer nodes or serialize same-wave starts behind user acceptance.

Keep the legacy validator's structural headings so npm run check and historical tooling remain compatible: 需求拆分就绪, 工作包清单, UC 与工作包映射, 工作包依赖与冲突, 编排决策, and 执行批次. Their v2 content follows the compact ownership-and-wave model above; do not restore the old full scheduling table.

- [ ] **Step 5: Run the test and verify GREEN**

Run: node --test tests/v2-templates.test.js

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add templates/plan-template.md templates/task-breakdown-template.md tests/v2-templates.test.js
git commit -m "refactor: add lean v2 execution templates"
~~~

---

### Task 4: Publish v2 metadata and migration guidance

**Files:**
- Modify: tests/terminology.test.js
- Modify: tests/init.test.js
- Modify: README.md
- Modify: manifest.json
- Modify: package.json
- Modify: bin/init.js
- Modify: install.sh

**Interfaces:**
- Consumes: the completed v2 runtime.
- Produces: version 2.0.0, public capability metadata, installer banners, and external-AGENTS guidance.

- [ ] **Step 1: Replace public-contract tests**

Add:

~~~javascript
test('公开元数据统一为 v2', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'))
  assert.equal(manifest.version, '2.0.0')
  assert.equal(packageJson.version, '2.0.0')
  assert.equal(
    manifest.capabilities.designDecision,
    'user-choice-before-ui-development',
  )
  assert.equal(manifest.capabilities.parallelism, 'dependency-waves')
  assert.equal(manifest.capabilities.legacyArtifactValidation, true)
})

test('README 公开设计选择、并行波次和迁移说明', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8')
  assert.match(readme, /provided-specific/)
  assert.match(readme, /use-current-basis/)
  assert.match(readme, /并行(?:批次|波次)/)
  assert.match(readme, /AGENTS\.md/)
  assert.match(readme, /固定行数/)
})
~~~

Document PACKAGE_PATH with JSDoc. In tests/init.test.js, assert that initialization output matches /v2\.0\.0/.

- [ ] **Step 2: Run the tests and verify RED**

Run: node --test tests/terminology.test.js tests/init.test.js

Expected: FAIL because metadata and banners still report 1.1.0.

- [ ] **Step 3: Align metadata and banners**

Set manifest.json and package.json to 2.0.0. Add:

~~~json
{
  "designDecision": "user-choice-before-ui-development",
  "parallelism": "dependency-waves",
  "legacyArtifactValidation": true
}
~~~

Update bin/init.js and install.sh banners to v2.0.0. Do not change legacy template copying or validation.

- [ ] **Step 4: Rewrite README as a concise v2 guide**

Cover flow, role routing, design choice, parallel safety, boundary-based component/Hook/state rules, evidence-based memoization, artifacts, legacy compatibility, installation, and migration. Explain that an external fixed-line AGENTS rule still overrides the Skill and must be changed separately.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: node --test tests/terminology.test.js tests/init.test.js

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add README.md manifest.json package.json bin/init.js install.sh tests/terminology.test.js tests/init.test.js
git commit -m "docs: publish dev-flow v2 workflow"
~~~

---

### Task 5: Verify v2 and legacy compatibility

**Files:**
- Verify only; modify a file only when a check identifies an in-scope regression.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: fresh focused, full-suite, and installation evidence.

- [ ] **Step 1: Run focused v2 tests**

Run:

~~~bash
node --test tests/orchestration.test.js tests/token-efficiency.test.js tests/v2-templates.test.js tests/terminology.test.js tests/init.test.js
~~~

Expected: PASS.

- [ ] **Step 2: Run legacy validator tests**

Run: node --test tests/validate-artifact.test.js

Expected: PASS without changing the validator or legacy templates.

- [ ] **Step 3: Run the complete suite**

Run: npm test

Expected: PASS with zero failures.

- [ ] **Step 4: Run installation checks**

Run: npm run check

Expected: PASS.

- [ ] **Step 5: Check budgets and forbidden active rules**

~~~bash
wc -l SKILL.md agents/*.md README.md templates/plan-template.md templates/task-breakdown-template.md
rg -n "出现 2 次以上的 UI 或逻辑|超过 300 行的巨型组件|超过 50 行的函数需要拆分|未使用.*useMemo.*热点" SKILL.md agents README.md templates/plan-template.md templates/task-breakdown-template.md
~~~

Expected: line budgets pass and rg returns no matches.

- [ ] **Step 6: Check patch hygiene and preserved user state**

~~~bash
git diff --check
git status --short
~~~

Expected: no whitespace errors; .understand-anything/ remains untracked and untouched.

- [ ] **Step 7: Commit only necessary verification corrections**

If a correction was required, stage only the corrected v2 files and commit with message fix: resolve v2 verification findings. If no correction was required, do not create an empty commit.
