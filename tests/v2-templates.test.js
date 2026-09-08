const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** v2 单工作包计划模板路径。 */
const PLAN_PATH = path.resolve(__dirname, "../templates/plan-template.md");

/** v2 多工作包拆分模板路径。 */
const BREAKDOWN_PATH = path.resolve(
  __dirname,
  "../templates/task-breakdown-template.md",
);

test("PLAN 记录用户设计选择且不包含设计矩阵", () => {
  const plan = fs.readFileSync(PLAN_PATH, "utf8");

  assert.match(plan, /designMode/);
  assert.match(plan, /provided-specific/);
  assert.match(plan, /use-current-basis/);
  assert.doesNotMatch(plan, /设计覆盖矩阵|components-readiness/);
  assert.ok(plan.split(/\r?\n/).length <= 80);
});

test("多工作包模板记录所有权和并行波次", () => {
  const breakdown = fs.readFileSync(BREAKDOWN_PATH, "utf8");

  assert.match(breakdown, /parallelWave/);
  assert.match(breakdown, /拥有路径|文件所有权/);
  assert.match(breakdown, /dependsOn/);
  assert.match(breakdown, /共享写入|文件冲突/);
  assert.doesNotMatch(breakdown, /WP01-reviewer/);
});
