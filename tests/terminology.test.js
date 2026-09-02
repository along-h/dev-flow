const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

/** Dev Flow 公开说明文件路径。 */
const README_PATH = path.resolve(__dirname, "../README.md");

/** Agent 清单文件路径。 */
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");

/** 开发后审查角色文件路径。 */
const REVIEWER_PATH = path.resolve(__dirname, "../agents/code-reviewer.md");

test("开发后阶段统一使用条件代码与交付质量审查术语", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const reviewerContent = fs.readFileSync(REVIEWER_PATH, "utf8");

  assert.match(skillContent, /阶段 4：条件代码与交付质量审查/);
  assert.doesNotMatch(skillContent, /等待架构审查|阶段 4：架构审查/);
  assert.match(reviewerContent, /^# 按需代码与交付质量审查 Agent（Code Reviewer）/);
});

test("manifest 区分四个常驻角色与两个按需专家", () => {
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
    "Scanner（项目扫描师）",
  ]);
  assert.deepEqual(optionalAgents, [
    { alias: "Wang（独立质量审查官）", id: "code-reviewer" },
    { alias: "Chen（按需架构专家）", id: "architect" },
  ]);
});

test("Liu 负责技术拆分、架构路由和 Standard 风险审核", () => {
  const taskDecomposer = fs.readFileSync(
    path.resolve(__dirname, "../agents/task-decomposer.md"),
    "utf8",
  );

  assert.match(taskDecomposer, /Liu（技术负责人）/);
  assert.match(taskDecomposer, /风险分级/);
  assert.match(taskDecomposer, /架构路由/);
  assert.match(
    taskDecomposer,
    /Standard[\s\S]*Developer[\s\S]*PLAN\.md/,
  );
  assert.match(taskDecomposer, /Orchestrator[^。\n]*最终[^。\n]*(?:路由|调度)/);
});

test("主 Flow 使用 manifest 中的 Liu Agent id", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skillContent, /阶段 2：工作包拆分与最终编排/);
  assert.match(skillContent, /agentSchedule[^\n]*task-decomposer|task-decomposer[^\n]*agentSchedule/);
  assert.doesNotMatch(skillContent, /\btechnical-lead\b/);
});

test("公开流程使用统一 PLAN 与条件 Reviewer", () => {
  for (const filePath of [SKILL_PATH, README_PATH]) {
    const content = fs.readFileSync(filePath, "utf8");

    assert.match(content, /PLAN\.md/);
    assert.match(content, /reviewTriggers/);
    assert.match(content, /Fast[\s\S]*Reviewer[^。\n]*不默认|Direct[^。\n]*Fast[^\n]*默认不进入 Review/i);
    assert.doesNotMatch(content, /架构对抗审查/);
  }
});

test("公开说明将 Architect 与 Reviewer 表述为按需能力", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const readmeContent = fs.readFileSync(README_PATH, "utf8");

  for (const content of [skillContent, readmeContent]) {
    assert.match(content, /按需架构专家/);
    assert.match(content, /Reviewer[\s\S]{0,200}(?:条件|按触发器|不默认)/i);
    assert.match(content, /fast[\s\S]*Developer[\s\S]*PLAN\.md/i);
    assert.match(content, /standard[\s\S]*Developer[\s\S]*Liu[\s\S]*审核/i);
    assert.match(content, /rigorous[\s\S]*Architect/i);
  }
});

test("manifest 声明基础验证与条件审查能力", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  assert.deepEqual(manifest.capabilities.qualityGate, [
    "gate-confirmation",
    "targeted-test",
    "lint",
    "typecheck",
    "build",
    "conditional-review",
  ]);
  assert.deepEqual(manifest.capabilities.reviewMode, [
    "conditional-triggered",
    "rigorous-required",
    "timeout-takeover",
  ]);
});

test("当前 runtime 不再包含旧架构处置或 P0 自动修改语义", () => {
  const runtimeFiles = [SKILL_PATH, README_PATH];
  for (const directoryName of ["agents", "templates"]) {
    const directoryPath = path.resolve(__dirname, "..", directoryName);
    for (const fileName of fs.readdirSync(directoryPath)) {
      runtimeFiles.push(path.join(directoryPath, fileName));
    }
  }

  for (const filePath of runtimeFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(content, /ACCEPT_WITH_RISK|架构对抗审查|AR-(?:xx|\d+)/i, filePath);
    assert.doesNotMatch(
      content,
      /P0[^\n]{0,32}必须修改|必须修改[^\n]{0,32}P0|P0[^\n]{0,32}自动(?:修改|修复)/i,
      filePath,
    );
  }
});

test("任务第零批以结构校验和用户确认为完成证据", () => {
  const taskTemplate = fs.readFileSync(
    path.resolve(__dirname, "../templates/task-breakdown-template.md"),
    "utf8",
  );
  const batchZeroRow = taskTemplate
    .split("\n")
    .find((line) => /\|\s*第 0 批\s*\|/.test(line)) ?? "";

  assert.match(batchZeroRow, /global-architecture-proposal/);
  assert.match(batchZeroRow, /global-architecture/);
  assert.match(batchZeroRow, /用户确认/);
  assert.doesNotMatch(batchZeroRow, /对抗审查|审查结论/);
});
