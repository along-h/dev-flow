const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const VALIDATOR_PATH = resolve(__dirname, "../scripts/validate-artifact.js");

/**
 * 使用真实 CLI 校验临时产物，避免测试脚本内部实现细节。
 *
 * @param {string} type 产物类型
 * @param {string} content 产物内容
 * @returns {{ status: number | null, stdout: string }} CLI 执行结果
 */
function runValidator(type, content) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "dev-flow-validator-"));
  const artifactPath = join(temporaryDirectory, `${type}.md`);
  writeFileSync(artifactPath, content, "utf8");

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, type, artifactPath], {
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test("PRD 缺少第一性原理分析时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /第一性原理/);
});

test("第一性原理章节缺少可执行字段时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n稍后补充。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /成功指标|事实.*证据|假设.*验证|最小.*方案|停止.*条件/);
});

test("第一性原理字段仍是占位内容时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n成功指标：待补充。事实证据来源：...。假设验证方式：TODO。最小方案：{方案}。停止条件：稍后补充。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /占位/);
});

test("PRD 缺少需求拆分就绪判断时拒绝通过", () => {
  const result = runValidator(
    "prd",
    "# PRD\n## 第一性原理分析\n成功指标有目标值。事实有证据来源。假设有验证方式。最小可行方案明确。停止条件明确。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 验收标准。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /拆分就绪/);
});

test("TDD 缺少风险评估和对抗性审查时拒绝通过", () => {
  const result = runValidator(
    "tdd",
    "# TDD\n## 组件树\n## 数据流\n## API 契约\nGET /api/items\ninterface Item {}\n## 性能策略。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /风险评估|对抗性审查/);
});

test("全局架构缺少风险评估和对抗性审查时拒绝通过", () => {
  const result = runValidator(
    "global-architecture",
    "# 全局架构\n## 统一数据模型\n## 共享组件\ninterface SharedProps {}\n## 全局路由与布局\nsrc/ pages/ components/\n## 各 UC 架构边界。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /风险评估|对抗性审查/);
});

test("TDD 对抗审查缺少独立审查来源和 BLOCK 处置时拒绝通过", () => {
  const result = runValidator(
    "tdd",
    "# TDD\n## 组件树\n## 数据流\n## API 契约\nGET /api/items\ninterface Item {}\n## 性能策略\n## 风险评估\n影响、可能性、不确定性。异步风险判定：不适用，证明：纯静态展示。\n## 对抗性审查\n结论：ACCEPT。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /审查者|输入边界|BLOCK.*处置/);
});

test("异步路径将乱序或重复提交评为 8 分时拒绝通过", () => {
  const result = runValidator(
    "tdd",
    "# TDD\n## 组件树\n## 数据流\n包含 mutation 提交。\n## API 契约\nPOST /api/items\ninterface Item {}\n## 性能策略\n## 风险评估\n影响、可能性、不确定性。异步风险判定：乱序响应 8 分，重复提交 8 分。\n## 对抗性审查\n审查者：code-reviewer。输入边界：目标、约束和产物。BLOCK 处置：不适用。结论：ACCEPT。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /乱序响应.*重复提交.*至少为9分/);
});

test("审查报告缺少反例验证和运行证据时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 问题清单\n当前没有问题。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /反例验证|运行证据/);
});

test("运行证据缺少本轮命令、退出码或结果摘要时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n稍后补充。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /实际命令|退出码|结果摘要/);
});

test("运行证据仍是占位内容时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n本轮实际命令：{项目实际命令}，执行时间：待补充，退出码：...，结果摘要：TODO，原始输出：稍后补充。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /占位/);
});

test("旧版一 UC 一任务的拆分方案拒绝通过", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## UC 任务清单\n| UC | 任务 |\n| --- | --- |\n| UC01 | 查看订单 |\n## 跨 UC 依赖分析\n无。\n## 执行顺序\nUC01。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /需求拆分就绪|工作包|UC.*映射|编排决策|升级触发/);
});

test("工作包与二维编排信息完整的拆分方案通过校验", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## 需求拆分就绪\n结论：READY。高影响未知项已有验证计划。\n## 工作包清单\n| 工作包 | 范围 | 独立验收 |\n| --- | --- | --- |\n| WP01 | 订单工作台 | 是 |\n## UC 与工作包映射\n| UC | 工作包 |\n| --- | --- |\n| UC01 | WP01 |\n## 工作包依赖分析\nWP01 无依赖。\n## 编排决策\ntopology: single-workstream。governance: standard。理由：共享订单状态。升级触发：修改全局订单契约。\n## 执行顺序\nWP01。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});

test("被依赖说明不会被误判为工作包循环依赖", () => {
  const templatePath = resolve(__dirname, "../templates/task-breakdown-template.md");
  const result = spawnSync(
    process.execPath,
    [VALIDATOR_PATH, "task-breakdown", templatePath],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stdout);
});

test("显式双向工作包依赖拒绝通过", () => {
  const result = runValidator(
    "task-breakdown",
    "# 任务拆分方案\n## 需求拆分就绪\nREADY，高影响未知项已有验证计划。\n## 工作包清单\n| 工作包 | 覆盖 UC |\n| --- | --- |\n| WP01 | UC01 |\n| WP02 | UC02 |\n## UC 与工作包映射\nUC01 → WP01，UC02 → WP02。\n## 工作包依赖分析\n- WP01 依赖 WP02\n- WP02 依赖 WP01\n## 编排决策\ntopology: multi-workstream，governance: standard，理由：独立验收。升级触发：共享契约变化。\n## 执行顺序\n待解除循环依赖。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /循环依赖/);
});

test("包含新增质量契约的代表性产物通过校验", () => {
  const cases = [
    {
      type: "prd",
      content:
        "# PRD\n## 第一性原理分析\n成功指标有目标值。事实有证据来源。假设有验证方式。最小可行方案明确。停止/回退条件明确。\n## 用户故事\n## 页面清单\n## 设计规范\n颜色 字体 间距\n## 需求拆分就绪\n结论：READY。异常流程和验收标准明确，高影响未知项已有验证计划。\n## 验收标准。\n",
    },
    {
      type: "tdd",
      content:
        "# TDD\n## 组件树\n## 数据流\n## API 契约\nGET /api/items\ninterface Item {}\n## 性能策略\n## 风险评估\n影响、可能性、不确定性。异步风险判定：不适用，证明：纯静态展示。\n## 对抗性审查\n审查者：code-reviewer。输入边界：目标、约束和产物。BLOCK 处置：不适用。结论：ACCEPT。\n",
    },
    {
      type: "global-architecture",
      content:
        "# 全局架构\n## 统一数据模型\n## 共享组件\ninterface SharedProps {}\n## 全局路由与布局\nsrc/ pages/ components/\n## 各 UC 架构边界\n## 风险评估\n影响、可能性、不确定性。\n## 对抗性审查\n审查者：code-reviewer。输入边界：目标、约束和产物。BLOCK 处置：不适用。结论：ACCEPT。\n",
    },
    {
      type: "review",
      content:
        "# 审查报告\n## 审查摘要\n## 审查依据层级\n## 问题清单\n当前没有问题。\n## 反例验证\n乱序响应已验证。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为 5 项通过。\n",
    },
  ];

  for (const artifact of cases) {
    const result = runValidator(artifact.type, artifact.content);
    assert.equal(result.status, 0, `${artifact.type} 校验失败：${result.stdout}`);
  }
});

test("审查模板中的问题编号引用不会被误判为独立问题", () => {
  const templatePath = resolve(__dirname, "../templates/review-report-template.md");
  const result = spawnSync(process.execPath, [VALIDATOR_PATH, "review", templatePath], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stdout);
});
