# Design Coverage and Review Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace architecture adversarial review with a user-confirmed, responsibility-annotated architecture and per-UI-component design readiness gate, while making every code-review severity user-selectable and limiting repair re-review to actual selected changes and their direct impact.

**Architecture:** `COMPONENTS.md` becomes the canonical owner of the work package responsibility tree and UI design coverage matrix. TDD and global architecture retain risk assessment and explicit user confirmation but no adversarial-review stage; development receives a separate `components-readiness` validation gate after automatic design-node hydration. Code review keeps full first-pass analysis, records user disposition for every severity, and uses narrowly scoped incremental re-review after selected repairs.

**Tech Stack:** Node.js 18+, CommonJS CLI scripts, Node built-in test runner, Markdown skill/agent/template artifacts, POSIX shell install checks.

**Spec:** `docs/superpowers/specs/2026-08-28-design-coverage-and-review-gates-design.md`

## Global Constraints

- Do not execute Git commands; project instructions explicitly prohibit all Git operations.
- Comments and JSDoc added to JavaScript must be written in Chinese.
- Do not use `any`; this repository task does not require new TypeScript production code.
- Preserve the user-provided requirement boundary; do not rewrite historical run artifacts or historical specs/plans.
- TDD and global architecture must have structure validation and explicit user confirmation, but no architecture adversarial review, `AR-xx` issues, or architecture-review repair loop.
- Every visible UI component must be `complete` or explicitly `waived` before development; non-visual files use `not-applicable`.
- P0, P1, and P2 describe impact only; all repair choices belong to the user.
- Repair re-review is mandatory and limited to user-selected, actually modified items and their direct impact.

---

### Task 1: Add the canonical component architecture and design coverage artifact

**Files:**
- Create: `templates/components-template.md`
- Modify: `scripts/validate-artifact.js`
- Modify: `tests/validate-artifact.test.js`
- Modify: `install.sh`

**Interfaces:**
- Consumes: existing `components` artifact type and `validateArtifact(type, filePath)` CLI behavior.
- Produces: a canonical `COMPONENTS.md` contract with sections `页面级组件树`, `职责目录树`, `设计覆盖矩阵`, and `通用组件清单`; a new `components-readiness` validator type for the development admission gate.

- [ ] **Step 1: Add failing component artifact tests**

Add real CLI tests to `tests/validate-artifact.test.js` using the existing `runValidator` helper:

```js
test("组件方案缺少职责目录树或设计覆盖矩阵时拒绝通过", () => {
  const result = runValidator(
    "components",
    "# 组件方案\n## 页面级组件树\n└── OrderCard，职责：展示订单。\n## 通用组件清单\nStatusBadge。\n## Props 与 State\nProps: orderId；State: loading。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /职责目录树|设计覆盖矩阵/);
});

test("职责目录树缺少变更类型工作包和文件作用时拒绝通过", () => {
  const result = runValidator(
    "components",
    "# 组件方案\n## 页面级组件树\n└── OrderCard，职责：展示订单。\n## 职责目录树\nsrc/pages/orders/OrderCard/index.tsx\n## 设计覆盖矩阵\n| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |\n|---|---|---|---|---|---|---|\n| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |\n## 通用组件清单\nStatusBadge。\n## Props 与 State\nProps: orderId；State: loading。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /新增|修改|复用|不变|职责/);
});
```

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```bash
node --test --test-name-pattern='组件方案缺少|职责目录树缺少' tests/validate-artifact.test.js
```

Expected: both tests fail because the current `components` validator only requires a component tree and shared component list.

- [ ] **Step 3: Create the component template**

Create `templates/components-template.md` with concrete instructional sections:

```markdown
# 组件拆分方案

## 页面级组件树

## 职责目录树

每个目录和文件使用 `# [新增|修改|复用|不变][WP编号|共享] 单一职责；允许或禁止的改动范围` 备注。

## 设计覆盖矩阵

| UI 组件 | 文件路径 | 所属工作包 | 精确设计节点 | 必需状态 | 完整度 | 处置 |
|---------|---------|-----------|-------------|---------|--------|------|

完整度只允许 `complete`、`blocked`、`waived`、`not-applicable`。

## 通用组件清单

## Props 与 State
```

Include one complete annotated tree example matching the spec and one matrix row for each legal completeness state. Explain that `not-applicable` is only for non-visual files and `waived` requires the user's exact decision plus manual visual acceptance.

- [ ] **Step 4: Enforce the component proposal structure**

Extend `VALIDATION_RULES.components.requiredSections` in `scripts/validate-artifact.js`:

```js
{ pattern: /职责目录树|Responsibility Tree/i, label: "职责目录树" },
{ pattern: /设计覆盖矩阵|Design Coverage Matrix/i, label: "设计覆盖矩阵" },
```

Add format rules that require all four change markers somewhere in the annotated example/template or at least one applicable marker in a real artifact, require `WP\d+|共享`, require a responsibility phrase, require the seven matrix columns, and reject completeness values outside `complete|blocked|waived|not-applicable`.

- [ ] **Step 5: Add the development readiness validator tests**

```js
test("组件设计仍有 blocked 项时开发准入拒绝通过", () => {
  const content = buildValidComponentsArtifact(
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | 尚未定位 | normal/loading/error | blocked | 请求精确节点 |",
  );
  const result = runValidator("components-readiness", content);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /blocked|开发准入/);
});

test("complete、明确 waived 和非视觉 not-applicable 允许开发准入", () => {
  const rows = [
    "| OrderCard | src/pages/orders/OrderCard/index.tsx | WP01 | https://design.example/node/1 | normal/loading/error | complete | 按规格开发 |",
    "| LegacyBanner | src/pages/orders/LegacyBanner/index.tsx | WP01 | 无 | normal | waived | 用户于 2026-08-28 明确豁免；人工视觉验收 |",
    "| types.ts | src/pages/orders/types.ts | WP01 | 不适用 | 不适用 | not-applicable | 非视觉文件 |",
  ].join("\n");
  const result = runValidator("components-readiness", buildValidComponentsArtifact(rows));

  assert.equal(result.status, 0, result.stdout);
});
```

Add `buildValidComponentsArtifact(matrixRows)` as a test-only fixture builder containing a fixed valid tree and hand-authored matrix headings. It must not reuse validator logic.

- [ ] **Step 6: Run readiness tests and verify RED**

Run:

```bash
node --test --test-name-pattern='开发准入' tests/validate-artifact.test.js
```

Expected: FAIL with unknown artifact type `components-readiness`.

- [ ] **Step 7: Implement `components-readiness`**

Reuse the component structural rules through a small rule factory rather than duplicating them:

```js
function createComponentRules({ requireReady }) {
  return {
    label: requireReady ? "组件设计开发准入" : "组件拆分方案",
    requiredSections: COMPONENT_REQUIRED_SECTIONS,
    requiredFields: [],
    formatRules: [
      ...COMPONENT_FORMAT_RULES,
      ...(requireReady ? [COMPONENT_DESIGN_READY_RULE] : []),
    ],
  };
}
```

`COMPONENT_DESIGN_READY_RULE` must reject `blocked`, accept `complete` and `not-applicable`, and only accept `waived` when the row contains `用户` plus `明确|原话|豁免` and `人工视觉验收|残余风险`.

- [ ] **Step 8: Register and install-check the new template and validator**

Update `install.sh` so the template loop includes `components-template`, and the validation table includes:

```sh
"components:components-template" \
```

Do not validate the placeholder template as `components-readiness`; readiness only applies to filled runtime artifacts.

- [ ] **Step 9: Run Task 1 verification**

Run:

```bash
node --test tests/validate-artifact.test.js
node scripts/validate-artifact.js components templates/components-template.md
sh install.sh --check-only
```

Expected: all commands exit 0.

---

### Task 2: Remove architecture adversarial review and retain explicit user confirmation

**Files:**
- Modify: `tests/validate-artifact.test.js`
- Modify: `scripts/validate-artifact.js`
- Modify: `templates/tdd-template.md`
- Modify: `templates/global-architecture-template.md`
- Modify: `agents/architect.md`

**Interfaces:**
- Consumes: `hasConfirmedArchitectureProposal(content)` and the responsibility/design contracts from Task 1.
- Produces: final `tdd` and `global-architecture` artifacts that require `CONFIRMED` user evidence but contain no adversarial-review sections.

- [ ] **Step 1: Replace obsolete architecture-review validator tests**

Delete tests whose required behavior is architecture adversarial review, including assertions for `架构对抗审查`, `BLOCK` disposition, and `SELECTED_FOR_REVISION`. Add:

```js
test("用户确认且职责目录树已引用设计覆盖版本的最终 TDD 无需架构对抗审查", () => {
  const result = runValidator("tdd", VALID_CONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW);
  assert.equal(result.status, 0, result.stdout);
});

test("最终 TDD 缺少用户明确确认时拒绝通过", () => {
  const result = runValidator("tdd", UNCONFIRMED_TDD_WITHOUT_ADVERSARIAL_REVIEW);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /用户已确认技术方案/);
});

test("用户确认且共享职责目录树完整的全局架构无需架构对抗审查", () => {
  const result = runValidator(
    "global-architecture",
    VALID_CONFIRMED_GLOBAL_ARCHITECTURE_WITHOUT_ADVERSARIAL_REVIEW,
  );
  assert.equal(result.status, 0, result.stdout);
});
```

Fixtures must include real GET/POST contracts, a concrete interface, risk text without placeholders, a responsibility tree with change/work-package/responsibility annotations, and a confirmation sentence dated `2026-08-28`.

- [ ] **Step 2: Run architecture tests and verify RED**

Run:

```bash
node --test --test-name-pattern='无需架构对抗审查|缺少用户明确确认' tests/validate-artifact.test.js
```

Expected: confirmed artifacts fail because current validators require architecture adversarial review and disposition sections.

- [ ] **Step 3: Simplify final TDD validation**

In `VALIDATION_RULES.tdd`:

- Remove required sections `架构对抗审查` and `审查问题处置`.
- Remove conclusion, reviewer/input boundary, settled-review, and adversarial placeholder rules.
- Keep `hasConfirmedArchitectureProposal(content)` but rename its rule description to `最终 TDD 必须记录用户已确认技术方案`.
- Require `职责目录树` and a `COMPONENTS.md` design coverage version reference such as `设计覆盖版本：COMPONENTS.md v2`.

Remove `hasSettledArchitectureReview` after confirming no remaining callers.

- [ ] **Step 4: Simplify global architecture validation**

Apply the same removal to `VALIDATION_RULES["global-architecture"]`. Require its shared responsibility tree and a mapping from each shared visible component to a concrete work package design matrix, for example `SharedStatusBadge → WP01 COMPONENTS.md`.

- [ ] **Step 5: Rewrite architecture templates**

In both templates:

- Remove the complete architecture adversarial review and review disposition sections.
- Keep risk assessment.
- Add the applicable annotated responsibility tree.
- In TDD, add `设计覆盖版本：COMPONENTS.md vN` and state that a component responsibility change returns to component confirmation.
- Keep `技术方案确认` as the final architecture gate.
- Renumber subsequent headings consistently.

- [ ] **Step 6: Rewrite the architect role**

Update `agents/architect.md` so both single- and multi-workstream flows end at structure validation plus explicit user confirmation. Require:

- A complete annotated responsibility tree in component/TDD output.
- The canonical design matrix in `COMPONENTS.md`.
- Shared visual component ownership in global architecture.
- Return to component confirmation when TDD changes an established responsibility.

Delete instructions that invoke `code-reviewer` in architecture mode or generate `AR-xx` issues.

- [ ] **Step 7: Run Task 2 verification**

Run:

```bash
node --test tests/validate-artifact.test.js
node scripts/validate-artifact.js tdd templates/tdd-template.md
node scripts/validate-artifact.js global-architecture templates/global-architecture-template.md
rg -n "架构对抗审查|AR-[0-9]|SELECTED_FOR_REVISION" agents/architect.md templates/tdd-template.md templates/global-architecture-template.md
```

Expected: tests and validators exit 0; `rg` returns no matches and therefore exits 1.

---

### Task 3: Enforce automatic design hydration and batched missing-node requests before development

**Files:**
- Modify: `agents/developer.md`
- Modify: `templates/design-sources-template.md`
- Modify: `templates/module-design-spec-template.md`
- Modify: `SKILL.md`
- Modify: `tests/token-efficiency.test.js`

**Interfaces:**
- Consumes: confirmed `COMPONENTS.md`, its design coverage version, `DESIGN-SOURCES.md`, top-level design sources, and the `components-readiness` CLI type.
- Produces: refreshed component-level design evidence and a hard development admission check with no remaining `blocked` UI rows.

- [ ] **Step 1: Add a failing development-admission contract test**

Extend `tests/token-efficiency.test.js` using the repository's existing instruction-contract style:

```js
test("开发阶段按可见 UI 组件自动定位并集中请求缺失设计节点", () => {
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");

  for (const content of [developer, skill]) {
    assert.match(content, /设计覆盖矩阵/);
    assert.match(content, /自动定位.*精确.*子节点/s);
    assert.match(content, /一次性.*blocked.*组件/s);
    assert.match(content, /components-readiness/);
    assert.match(content, /非视觉.*not-applicable/s);
  }
});
```

This test protects the executable instruction boundary because agents consume these Markdown files directly.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test --test-name-pattern='开发阶段按可见 UI 组件' tests/token-efficiency.test.js
```

Expected: FAIL because current development instructions operate at module level and do not invoke `components-readiness`.

- [ ] **Step 3: Update design source templates**

Add component granularity to `templates/design-sources-template.md`: exact component/node mapping, extraction timestamp, applicable states, and linked module spec. Add the same node hierarchy and state fields to `templates/module-design-spec-template.md` so the evidence is independently reviewable.

- [ ] **Step 4: Rewrite the developer admission sequence**

In `agents/developer.md`, require this exact order:

1. Read confirmed `COMPONENTS.md` and its design matrix.
2. Mark non-visual rows `not-applicable` without asking the user.
3. For each visible UI row, automatically locate an exact child node from the registered top-level design source.
4. Refresh node link, hierarchy path, extraction time, layout, typography, spacing, states, responsive differences, and overflow behavior.
5. Batch all remaining `blocked` rows into one user question with component/page/missing facts/required link.
6. Accept `waived` only for a specifically named component with the user's explicit words and manual acceptance scope.
7. Run `node .dev-flow/scripts/validate-artifact.js components-readiness .dev-flow/runs/REQ-001/work-packages/WP01/COMPONENTS.md`, replacing the example run and work-package IDs with the active paths supplied by HANDOFF.
8. Stop before tests or implementation if validation fails.
9. Implement each UI component against the refreshed exact node specification.

- [ ] **Step 5: Update the main flow**

Mirror the same sequence in `SKILL.md` Stage 3. Replace the current module-only immediate hydration language with UI-component coverage, automatic child-node discovery, one batched request, and the readiness command. Preserve `inactive` and user-explicit `waived` behavior, but do not let `inactive` bypass a design source that the user actually provided.

- [ ] **Step 6: Run Task 3 verification**

Run:

```bash
node --test tests/token-efficiency.test.js tests/validate-artifact.test.js
node scripts/validate-artifact.js design-sources templates/design-sources-template.md
node scripts/validate-artifact.js module-design-spec templates/module-design-spec-template.md
```

Expected: all commands exit 0.

---

### Task 4: Unify code-review user disposition and constrain repair re-review

**Files:**
- Modify: `tests/validate-artifact.test.js`
- Modify: `scripts/validate-artifact.js`
- Modify: `templates/review-report-template.md`
- Modify: `agents/code-reviewer.md`
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: stable review issue IDs, user decisions, repair file list, direct caller/contract/test impact, and fresh run evidence.
- Produces: `REVIEW.md` with complete user disposition and narrowly scoped incremental re-review.

- [ ] **Step 1: Re-run the already-created review RED/GREEN tests**

The interrupted earlier task already added tests named:

- `代码审查存在问题但缺少用户处置记录时拒绝通过`
- `用户明确跳过 P0 修改并记录残余风险时允许继续`
- `修复后的复审缺少用户选中项和直接影响范围时拒绝通过`

Run:

```bash
node --test --test-name-pattern='代码审查存在问题|用户明确跳过 P0|修复后的复审' tests/validate-artifact.test.js
```

Expected: establish the current workspace state. Do not rewrite passing tests; complete only the missing production behavior. The first and third tests were observed RED before the partial validator edit, satisfying the TDD failure requirement.

- [ ] **Step 2: Complete review validation rules**

Ensure `VALIDATION_RULES.review`:

- Requires `审查问题处置`.
- Allows `NO_CHANGES_REQUESTED` for no issues.
- Allows `WAIVED_BY_USER` for every severity only when user decision and residual risk are recorded.
- Rejects unresolved issue rows without a user decision.
- For round 2+, requires `incremental`, `用户选中修改的问题`, `本轮实际修改项`, `直接影响范围`, and `相关测试证据`.
- Does not restore a full review during a repair loop; architecture or work-package boundary changes return to architecture confirmation instead.

- [ ] **Step 3: Rewrite the review report template**

Replace `未关闭问题` and `用户确认修改的 P1/P2` with:

```markdown
- 用户选中修改的问题：P0-1、P2-1 / 无
- 本轮实际修改项：稳定问题编号、精确文件和逻辑
- 直接影响范围：直接调用方、直接契约、直接受影响测试
- 相关测试证据：本轮命令、退出码和输出位置
```

Add a mandatory disposition table for all severities:

```markdown
## 审查问题处置

| 问题编号 | 级别 | 用户决定 | 状态 | 用户依据与残余风险 |
|---------|------|---------|------|------------------|
| P0-1 | P0 | 修改 / 不修改 / 跳过此次修改 | SELECTED_FOR_REVISION / WAIVED_BY_USER | 明确决定与风险 |
```

Rename P0 presentation from `必须修改` to `高影响问题`; retain its impact definition. State that no selected items or explicit skip continues to the next phase after risk recording.

- [ ] **Step 4: Remove architecture mode from the reviewer and unify selection**

Delete `模式 A：架构对抗审查` from `agents/code-reviewer.md`. Keep only code and delivery quality review. Change all severity handling so:

- The reviewer reports impact and an executable fix.
- The main agent presents P0/P1/P2 together after review completion.
- No issue enters repair automatically.
- Only selected items are repaired.
- Explicit skip records `WAIVED_BY_USER` and continues.
- Repair always triggers incremental re-review of selected actual modifications and direct impact.
- New issues inside that direct impact receive new IDs and return to the same user-selection gate.

- [ ] **Step 5: Update the main Stage 4 loop**

In `SKILL.md`, replace automatic P0 repair and separate P1/P2 handling with one disposition gate. Define the repair loop as `selected issues → repair → scoped incremental re-review → user disposition`. Preserve separate multi-workstream acceptance after issue disposition.

- [ ] **Step 6: Run Task 4 verification**

Run:

```bash
node --test tests/validate-artifact.test.js
node scripts/validate-artifact.js review templates/review-report-template.md
rg -n "P0.*自动|自动.*修复队列|模式 A：架构对抗审查|恢复完整审查" SKILL.md agents/code-reviewer.md templates/review-report-template.md
```

Expected: tests and template validation exit 0; `rg` returns no matches and therefore exits 1.

---

### Task 5: Align the public flow, manifest, and end-to-end contract

**Files:**
- Modify: `README.md`
- Modify: `SKILL.md`
- Modify: `manifest.json`
- Modify: `tests/terminology.test.js`
- Modify: `tests/token-efficiency.test.js`

**Interfaces:**
- Consumes: final contracts from Tasks 1–4.
- Produces: one consistent public and machine-readable description of the flow.

- [ ] **Step 1: Add failing end-to-end terminology tests**

Add assertions that current public files describe the new behavior:

```js
test("公开流程使用设计覆盖门禁且不再声明架构对抗审查", () => {
  const files = [SKILL_PATH, path.resolve(__dirname, "../README.md")];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /职责目录树/);
    assert.match(content, /设计覆盖矩阵/);
    assert.match(content, /components-readiness/);
    assert.doesNotMatch(content, /架构对抗审查/);
  }
});
```

Add a manifest assertion:

```js
assert.deepEqual(manifest.capabilities.qualityGate, [
  "validate-artifact",
  "component-design-readiness",
  "gate-confirmation",
  "user-selected-review-loop",
]);
```

- [ ] **Step 2: Run public contract tests and verify RED**

Run:

```bash
node --test tests/terminology.test.js tests/token-efficiency.test.js
```

Expected: FAIL because README, SKILL, and manifest still advertise architecture adversarial review and the old review loop.

- [ ] **Step 3: Rewrite README and complete SKILL consistency**

Update the pipeline diagram, stage table, governance descriptions, artifact table, and review sections so they describe:

- Annotated responsibility directory trees.
- Canonical UI component design coverage.
- Automatic node discovery plus one batched missing-design request.
- User confirmation as the only architecture decision gate.
- Full code review followed by user selection for every severity.
- Scoped repair re-review.

Remove every normative architecture adversarial-review statement. Historical documents under `docs/superpowers/specs/` and `docs/superpowers/plans/` remain unchanged except the current spec and plan.

- [ ] **Step 4: Update manifest capabilities and reviewer persona**

Set the reviewer persona to evidence-backed severity reporting without automatic repair language. Set:

```json
"qualityGate": [
  "validate-artifact",
  "component-design-readiness",
  "gate-confirmation",
  "user-selected-review-loop"
],
"reviewMode": ["full-first-round", "selected-change-recheck"]
```

Update the validator script description to mention `components-readiness` and selected-change review contracts.

- [ ] **Step 5: Run the full verification suite**

Run fresh commands:

```bash
npm test
npm run check
node scripts/validate-artifact.js components templates/components-template.md
node scripts/validate-artifact.js tdd templates/tdd-template.md
node scripts/validate-artifact.js global-architecture templates/global-architecture-template.md
node scripts/validate-artifact.js review templates/review-report-template.md
```

Expected: every command exits 0, with zero failed Node tests and all install/template checks passing.

- [ ] **Step 6: Perform the final requirement audit**

Verify each acceptance criterion from the spec against the resulting files and fresh command output. Report:

- Files created and modified.
- Architecture-review removal evidence.
- Responsibility-tree and design-readiness evidence.
- Review disposition and scoped re-review evidence.
- Full test/check command, exit code, and summary.
- Any residual risk or check not executed.

Do not claim completion if a required command fails.
