const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

/** 需求分析师提示词路径。 */
const REQUIREMENTS_PATH = path.resolve(
  __dirname,
  "../agents/requirements-analyst.md",
);

/** 技术负责人提示词路径。 */
const DECOMPOSER_PATH = path.resolve(__dirname, "../agents/task-decomposer.md");

/** 架构师提示词路径。 */
const ARCHITECT_PATH = path.resolve(__dirname, "../agents/architect.md");

/** 开发者提示词路径。 */
const DEVELOPER_PATH = path.resolve(__dirname, "../agents/developer.md");

/** 审查者提示词路径。 */
const REVIEWER_PATH = path.resolve(__dirname, "../agents/code-reviewer.md");

/** 项目扫描师提示词路径。 */
const SCANNER_PATH = path.resolve(__dirname, "../agents/project-scanner.md");

/** 所有活动角色提示词路径。 */
const AGENT_PATHS = [
  REQUIREMENTS_PATH,
  DECOMPOSER_PATH,
  ARCHITECT_PATH,
  DEVELOPER_PATH,
  REVIEWER_PATH,
  SCANNER_PATH,
];

/**
 * 返回文件的非空行数。
 *
 * @param {string} content 文件内容。
 * @returns {number} 非空行数。
 */
function countNonEmptyLines(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length;
}

test("主 Skill 与角色提示词保持 v2 预算", () => {
  const skill = fs.readFileSync(SKILL_PATH, "utf8");
  assert.ok(countNonEmptyLines(skill) <= 300);

  let activeAgentLines = 0;
  for (const filePath of AGENT_PATHS) {
    const lineCount = countNonEmptyLines(fs.readFileSync(filePath, "utf8"));
    assert.ok(lineCount <= 140, filePath);
    activeAgentLines += lineCount;
  }
  assert.ok(activeAgentLines <= 720);
});

test("活动提示词不使用机械代码拆分规则", () => {
  const active = [SKILL_PATH, ...AGENT_PATHS]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(active, /出现 2 次以上的 UI 或逻辑[^\n]*抽取/);
  assert.doesNotMatch(active, /超过 300 行的巨型组件/);
  assert.doesNotMatch(active, /超过 50 行的函数需要拆分/);
  assert.doesNotMatch(active, /未使用[^\n]*useMemo[^\n]*热点/);
});

test("角色提示词使用所有权和证据决定边界", () => {
  const developer = fs.readFileSync(DEVELOPER_PATH, "utf8");
  const architect = fs.readFileSync(ARCHITECT_PATH, "utf8");
  const reviewer = fs.readFileSync(REVIEWER_PATH, "utf8");

  assert.match(developer, /最小必要所有者/);
  assert.match(developer, /固定行数[^。\n]*(?:不是|不能)/);
  assert.match(architect, /共享契约/);
  assert.match(reviewer, /测量|证据/);
});
