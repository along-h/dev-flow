# Dev Flow Fast Default and Conditional Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Dev Flow 改为默认 Fast、轻量 Standard 和按风险触发 Reviewer，同时保持 Rigorous 与旧产物兼容。

**Architecture:** 新增统一 `PLAN.md` 作为 Fast/Standard 的默认工作包产物；通过 `reuseScope` 和有副作用的异步风险信号决定升级。Reviewer 从固定尾节点改为 Orchestrator 条件插入节点，Developer 验证始终保留。

**Tech Stack:** Node.js 18+、CommonJS、`node:test`、Markdown Skill/Agent/模板。

**Spec:** `docs/superpowers/specs/2026-09-02-fast-default-conditional-review-design.md`

## Global Constraints

- 不删除旧产物校验能力，保持历史运行只读兼容。
- Fast/Standard 不因页面数量、工作包内部复用、设计稿或确定性本地 Promise 自动升级。
- 验证与 Review 分离；测试、Lint、类型检查和适用构建始终保留。
- 所有行为修改执行 RED → GREEN，并在完成前运行全量测试和安装检查。

---

### Task 1: 锁定新路由与条件审查契约

**Files:**
- Modify: `tests/orchestration.test.js`
- Modify: `tests/token-efficiency.test.js`

**Interfaces:**
- Produces: 对默认 Fast、`reuseScope`、本地 Promise、轻量 Standard 和条件 Reviewer 的可观察文本契约。

- [ ] 写入新断言，并删除与固定 Reviewer/完整 TDD 相冲突的旧断言。
- [ ] 运行两个测试文件，确认因实现尚未修改而失败。

### Task 2: 改造主流程与 Agent 指令

**Files:**
- Modify: `SKILL.md`
- Modify: `agents/developer.md`
- Modify: `agents/task-decomposer.md`
- Modify: `agents/code-reviewer.md`

**Interfaces:**
- Consumes: Task 1 的行为契约。
- Produces: 默认 Fast、轻量 Standard、视觉簇补水、条件 Reviewer 和超时接管规则。

- [ ] 最小修改路由矩阵、阶段产物、设计补水和交付审查章节。
- [ ] 更新 Developer/Liu/Reviewer 输入与停止条件。
- [ ] 运行 Task 1 测试并修正到通过。

### Task 3: 增加统一 PLAN 模板并同步公开能力

**Files:**
- Create: `templates/plan-template.md`
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `tests/orchestration.test.js`
- Modify: `tests/terminology.test.js`

**Interfaces:**
- Produces: Fast/Standard 共用的精简方案模板和一致的公开说明。

- [ ] 先增加模板/manifest/README 失败断言并观察失败。
- [ ] 创建 PLAN 模板并同步 manifest、README。
- [ ] 运行定向测试到通过。

### Task 4: 全量验证与一致性检查

**Files:**
- Verify: all modified files

**Interfaces:**
- Consumes: Tasks 1–3 的最终状态。

- [ ] 运行 `npm test`。
- [ ] 运行 `npm run check`。
- [ ] 搜索固定 Reviewer、Standard 完整 TDD、局部复用升级等旧语义并修正冲突。
- [ ] 检查 diff 仅包含本次流程调整和两份实施记录。
