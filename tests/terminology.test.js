const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

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
