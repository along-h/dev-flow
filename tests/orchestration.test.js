const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow 主技能文件路径。 */
const SKILL_PATH = path.resolve(__dirname, "../SKILL.md");

/** 旧版 Rigorous 显式兼容入口路径。 */
const LEGACY_REFERENCE_PATH = path.resolve(
  __dirname,
  "../references/legacy-rigorous.md",
);

test("v2 在 UI 实现前取得用户设计选择", () => {
  const skill = fs.readFileSync(SKILL_PATH, "utf8");
  const requirementsIndex = skill.indexOf("需求基线");
  const breakdownIndex = skill.indexOf("工作包拆分");
  const designChoiceIndex = skill.indexOf("开发前设计选择");
  const implementationIndex = skill.indexOf("实现与验证");

  assert.ok(requirementsIndex >= 0);
  assert.ok(requirementsIndex < breakdownIndex);
  assert.ok(breakdownIndex < designChoiceIndex);
  assert.ok(designChoiceIndex < implementationIndex);
  assert.match(skill, /provided-specific/);
  assert.match(skill, /use-current-basis/);
});

test("同一依赖波次允许安全并行", () => {
  const skill = fs.readFileSync(SKILL_PATH, "utf8");

  assert.match(skill, /同一(?:批次|波次)[\s\S]{0,500}并行/);
  assert.match(skill, /无共享写入/);
  assert.match(skill, /文件[^。\n]*冲突/);
  assert.doesNotMatch(
    skill,
    /当前工作包[^。\n]*验收[^。\n]*才[^。\n]*下一个工作包/,
  );
});

test("v2 默认流程不调用旧设计矩阵门禁", () => {
  const skill = fs.readFileSync(SKILL_PATH, "utf8");

  assert.doesNotMatch(skill, /node[^\n]*components-readiness/);
  assert.doesNotMatch(skill, /输出[^。\n]*DESIGN-SOURCES\.md/);
});

test("旧流程只有显式兼容入口", () => {
  assert.equal(fs.existsSync(LEGACY_REFERENCE_PATH), true);
  assert.match(fs.readFileSync(SKILL_PATH, "utf8"), /legacy-rigorous\.md/);
});
