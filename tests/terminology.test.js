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

test("开发后阶段统一使用代码与交付质量审查术语", () => {
  const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
  const reviewerContent = fs.readFileSync(REVIEWER_PATH, "utf8");

  assert.match(skillContent, /阶段 4：代码与交付质量审查/);
  assert.doesNotMatch(skillContent, /等待架构审查|阶段 4：架构审查/);
  assert.match(reviewerContent, /^# 代码与交付质量审查 Agent（Code Reviewer）/);
});

test("所有 Agent 的用户可见代号都携带岗位", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const visibleAliases = manifest.agents.map(({ alias }) => alias);

  assert.deepEqual(visibleAliases, [
    "Lin（需求分析师）",
    "Liu（任务拆分师）",
    "Chen（前端架构师）",
    "Zhang（前端开发工程师）",
    "Wang（独立质量审查官）",
    "Scanner（项目扫描师）",
  ]);
});

test("公开流程使用设计覆盖门禁且不再声明架构对抗审查", () => {
  for (const filePath of [SKILL_PATH, README_PATH]) {
    const content = fs.readFileSync(filePath, "utf8");

    assert.match(content, /职责目录树/);
    assert.match(content, /设计覆盖矩阵/);
    assert.match(content, /components-readiness/);
    assert.match(content, /用户[^。\n]*选择[^。\n]*(?:问题|修改)/);
    assert.match(content, /selected-change-recheck/);
    assert.doesNotMatch(content, /架构对抗审查/);
  }
});

test("manifest 声明设计准入与用户选择复审能力", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  assert.deepEqual(manifest.capabilities.qualityGate, [
    "validate-artifact",
    "component-design-readiness",
    "gate-confirmation",
    "user-selected-review-loop",
  ]);
  assert.deepEqual(manifest.capabilities.reviewMode, [
    "full-first-round",
    "selected-change-recheck",
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
