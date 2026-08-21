# 第一性原理与对抗性审查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将第一性原理、风险分级、独立对抗审查、反例测试和交付证据门禁嵌入 Dev Flow。

**Architecture:** 扩展现有产物模板与 Agent 规则，不增加低风险任务的文件或用户门控。确定性脚本只验证结构性要求，语义正确性继续由独立挑战视角和用户门控判断。

**Tech Stack:** Markdown Skill 指令、Node.js 18、`node:test`。

**Spec:** `docs/superpowers/specs/2026-08-20-first-principles-adversarial-review-design.md`

## Global Constraints

- 注释使用中文。
- 禁止使用 `any`。
- 修改遵循最小改动原则。
- 禁止执行任何 Git 操作。
- 不增加常规用户门控。

---

### Task 1: 校验规则 RED 测试

**Files:**
- Create: `tests/validate-artifact.test.js`
- Modify: `scripts/validate-artifact.js`

**Interfaces:**
- Consumes: CLI `node scripts/validate-artifact.js <type> <file>`。
- Produces: 对第一性原理、风险评估、对抗审查和运行证据章节的结构校验。

- [x] 写入使用临时目录和真实 CLI 的失败路径测试。
- [x] 运行 `node --test tests/validate-artifact.test.js`，确认新增要求尚未实现而失败。
- [x] 为 `prd`、`tdd`、`global-architecture`、`review` 增加最小校验规则。
- [x] 再次运行测试并确认通过。

### Task 2: 需求与架构产物契约

**Files:**
- Modify: `templates/prd-template.md`
- Modify: `templates/tdd-template.md`
- Modify: `templates/global-architecture-template.md`
- Modify: `templates/review-report-template.md`

**Interfaces:**
- Consumes: 现有 PRD、TDD、全局架构和审查模板。
- Produces: 第一性原理画布、风险评分、挑战结论、反例验证和运行证据槽位。

- [x] 在 PRD 模板中增加目标、事实/假设、最小方案和停止条件。
- [x] 在架构模板中增加风险评分与对抗性审查结论。
- [x] 在审查模板中增加依据层级、反例验证和运行证据。
- [x] 使用校验脚本验证填充后的代表性产物。

### Task 3: Agent 行为规则

**Files:**
- Modify: `agents/requirements-analyst.md`
- Modify: `agents/architect.md`
- Modify: `agents/developer.md`
- Modify: `agents/code-reviewer.md`

**Interfaces:**
- Consumes: 扩展后的模板契约。
- Produces: 事实/假设分离、风险路由、反例优先测试、可挑战 TDD 的审查行为。

- [x] 将需求 Agent 的“追问为什么”固化为第一性原理分析步骤。
- [x] 要求架构师在用户确认前完成风险评估和对抗审查。
- [x] 要求开发者从假设与不变量派生反例测试。
- [x] 将审查依据改为分层标准，并要求证据支持阻塞项。

### Task 4: 主编排与文档同步

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 各 Agent 新行为和产物结构。
- Produces: 单工作流、多工作流和交付阶段的一致编排规则。

- [x] 更新角色、状态机、上下文包和三层质量防线。
- [x] 将对抗审查嵌入现有架构门控，并定义风险路由和回环条件。
- [x] 将最终交付升级为证据门禁。
- [x] 更新 README 的能力、流程和产物说明。

### Task 5: 行为回归与完整验证

**Files:**
- Verify: all modified files

**Interfaces:**
- Consumes: 完整更新后的 Dev Flow。
- Produces: RED/GREEN 行为评测和命令验证证据。

- [x] 用与 RED 相同的压力场景重新评测 Skill 行为。
- [x] 修复评测发现的新合理化漏洞。
- [x] 运行 `node --test tests/validate-artifact.test.js`。
- [x] 运行现有安装检查和代表性产物校验。
- [x] 逐项核对设计验收标准并报告未验证项。
