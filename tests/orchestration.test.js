const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

/** Dev Flow Agent 清单文件路径。 */
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");

/** Dev Flow 公开说明文件路径。 */
const README_PATH = path.resolve(__dirname, "../README.md");

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

/** HANDOFF 模板路径。 */
const HANDOFF_TEMPLATE_PATH = path.resolve(__dirname, "../templates/handoff-template.md");

/** 任务拆分模板路径。 */
const TASK_BREAKDOWN_TEMPLATE_PATH = path.resolve(__dirname, "../templates/task-breakdown-template.md");

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

test("复杂度矩阵选择最小充分 Agent 集合", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const matrixLines = skillContent.split("\n");
  const directRoute = matrixLines.find((line) => line.includes("| `direct-development`")) ?? "";
  const fastUiRoute = matrixLines.find((line) => line.includes("| Fast UI |")) ?? "";

  assert.match(skillContent, /direct-development[\s\S]{0,600}developer[\s\S]{0,300}code-reviewer/i);
  assert.match(skillContent, /Fast UI[\s\S]{0,600}Developer[^\n]*方案[\s\S]{0,300}用户确认[\s\S]{0,300}Reviewer/i);
  assert.match(skillContent, /Standard[\s\S]{0,800}task-decomposer[\s\S]{0,300}developer[\s\S]{0,300}Liu[^\n]*审核/i);
  assert.match(skillContent, /Rigorous[\s\S]{0,800}task-decomposer[\s\S]{0,300}architect[\s\S]{0,300}developer/i);
  assert.match(skillContent, /Multi 无共享架构[\s\S]{0,800}task-decomposer[\s\S]{0,400}developer[\s\S]{0,300}code-reviewer/i);
  assert.match(skillContent, /Multi 有共享架构[\s\S]{0,800}architect[\s\S]{0,400}developer[\s\S]{0,300}code-reviewer/i);
  assert.match(directRoute, /developer[^|]*code-reviewer/i);
  assert.doesNotMatch(directRoute, /requirements-analyst|task-decomposer|architect/i);
  assert.match(fastUiRoute, /developer[^|]*用户确认[^|]*developer[^|]*code-reviewer/i);
  assert.doesNotMatch(fastUiRoute, /requirements-analyst|task-decomposer|architect/i);
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

test("README 公开清晰度分流和复杂度自适应调度", () => {
  const readmeContent = fs.readFileSync(README_PATH, "utf8");

  assert.match(readmeContent, /需求清晰度/);
  assert.match(readmeContent, /clear[\s\S]{0,500}跳过[^\n]*(?:Lin|需求分析师)/i);
  assert.match(readmeContent, /unclear[\s\S]{0,500}(?:Lin|requirements-analyst)/i);
  assert.match(readmeContent, /direct-development[\s\S]{0,600}Developer[\s\S]{0,300}Reviewer/i);
  assert.match(readmeContent, /agentSchedule/);
  assert.match(readmeContent, /stopWhen[\s\S]{0,400}重新编排/);
});
