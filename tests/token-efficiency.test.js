const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

/** 项目扫描 CLI 的绝对路径。 */
const SCAN_CLI_PATH = path.resolve(__dirname, "../scripts/scan-project.js");

/**
 * 创建包含一个组件的临时前端项目。
 *
 * @returns {string} 临时项目绝对路径。
 */
function createScannableProject() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-flow-scan-"));
  fs.mkdirSync(path.join(projectDir, "src", "components"), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectDir, "src", "components", "Badge.tsx"),
    "export const Badge = () => null;\n",
    "utf8",
  );
  return projectDir;
}

/**
 * 执行扫描并解析 JSON 输出。
 *
 * @param {string} projectDir 临时项目绝对路径。
 * @returns {{ sourceFingerprint: string }} 扫描结果。
 */
function runScan(projectDir) {
  const result = spawnSync(process.execPath, [SCAN_CLI_PATH, projectDir], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

/**
 * 断言每个流程标记恰好出现一次，且按给定顺序严格递增。
 *
 * @param {string} content 待检查的流程正文
 * @param {string[]} markers 按预期执行顺序排列的唯一标记
 * @returns {void}
 */
function assertUniqueMarkersInStrictOrder(content, markers) {
  let previousIndex = -1;

  for (const marker of markers) {
    const markerIndex = content.indexOf(marker);
    assert.notEqual(markerIndex, -1, `缺少唯一流程标记：${marker}`);
    assert.equal(content.lastIndexOf(marker), markerIndex, `流程标记重复：${marker}`);
    assert.ok(markerIndex > previousIndex, `流程标记顺序错误：${marker}`);
    previousIndex = markerIndex;
  }
}

/**
 * 断言流程正文中的真实动作按执行先后出现，避免仅移动人工标记绕过顺序契约。
 *
 * @param {string} content 待检查的流程正文
 * @param {{ label: string, pattern: RegExp }[]} actions 按预期执行顺序排列的动作
 * @returns {void}
 */
function assertActionsInStrictOrder(content, actions) {
  let previousIndex = -1;

  for (const { label, pattern } of actions) {
    const actionMatch = content.match(pattern);
    assert.ok(actionMatch && typeof actionMatch.index === "number", `缺少流程动作：${label}`);
    assert.ok(actionMatch.index > previousIndex, `流程动作顺序错误：${label}`);
    previousIndex = actionMatch.index;
  }
}

test("未修改源码时扫描指纹稳定，源码变化后指纹改变", () => {
  const projectDir = createScannableProject();
  const first = runScan(projectDir);
  const second = runScan(projectDir);

  assert.match(first.sourceFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(second.sourceFingerprint, first.sourceFingerprint);

  fs.writeFileSync(
    path.join(projectDir, "src", "components", "Badge.tsx"),
    "export const Badge = ({ label }) => label;\n",
    "utf8",
  );
  const changed = runScan(projectDir);
  assert.notEqual(changed.sourceFingerprint, first.sourceFingerprint);
});

test("执行角色统一要求先读 HANDOFF 和组件切片", () => {
  const requiredFiles = [
    "agents/architect.md",
    "agents/developer.md",
    "agents/code-reviewer.md",
  ];

  for (const relativePath of requiredFiles) {
    const content = fs.readFileSync(
      path.resolve(__dirname, "..", relativePath),
      "utf8",
    );
    assert.match(content, /先读取.*HANDOFF\.md/);
    assert.match(content, /COMPONENT-SLICE\.md/);
    assert.match(content, /section.*targeted.*full/s);
    assert.match(content, /扩大读取范围.*触发原因/);
  }
});

test("主 Flow 同时声明 fast 默认条件、旧路径只读兼容和全局副本同步", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

  assert.match(skill, /局部.*可逆.*无共享契约[\s\S]*默认.*fast/i);
  assert.match(skill, /\.dev-flow\/artifacts\/[\s\S]*只读兼容/i);
  assert.match(readme, /重新安装|同步全局 Skill/);
});

/** 验证所有治理路径在实现前执行可落地的 UI 组件级设计补水与硬准入门禁。 */
test("所有治理路径按可见 UI 组件补水并执行开发准入", () => {
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const skillDevelopmentSection = skill.match(
    /### 阶段 3：开发实现[\s\S]*?(?=\n### 阶段 4：)/,
  )?.[0] ?? "";
  const developerReadinessSection = developer.match(
    /### 第零步补充：设计源门禁与即时补水[\s\S]*?(?=\n### 第一步：)/,
  )?.[0] ?? "";

  const readinessMarkers = [
    "【顺序 1：读取确认 COMPONENTS】",
    "【顺序 2：分支补水与自动定位】",
    "【顺序 3：一次性 blocked】",
    "【顺序 4：components-readiness】",
    "【顺序 5：条件读取已审批 TDD】",
    "【顺序 6：测试与实现】",
  ];
  const readinessActions = [
    { label: "读取确认 COMPONENTS", pattern: /读取[^。\n]*COMPONENTS\.md/ },
    {
      label: "逐组件补水",
      pattern: /对[^。\n]*每个可见 UI 组件[^。\n]*补水分支/,
    },
    {
      label: "集中请求 blocked",
      pattern: /自动定位全部(?:执行)?(?:完成|完)后[^。\n]*一次性[^。\n]*(?:询问|请求)/,
    },
    {
      label: "运行 components-readiness",
      pattern: /node \.dev-flow\/scripts\/validate-artifact\.js components-readiness/,
    },
    {
      label: "条件读取核对已审批 TDD",
      pattern: /TDD\.md[^。\n]*(?:读取|核对)/,
    },
    { label: "测试与实现", pattern: /(?:逐组件实现|可见 UI 组件[^。\n]*逐项实现)/ },
  ];

  for (const content of [developerReadinessSection, skillDevelopmentSection]) {
    assertUniqueMarkersInStrictOrder(content, readinessMarkers);
    assertActionsInStrictOrder(content, readinessActions);
    assert.match(content, /设计覆盖矩阵/);
    assert.match(content, /自动定位.*精确.*子节点/s);
    assert.match(content, /一次性.*blocked.*组件/s);
    assert.match(content, /components-readiness/);
    assert.match(content, /非视觉.*not-applicable/s);
    assert.match(content, /inactive.*项目视觉基线.*真实.*路径/s);
    assert.match(content, /有.*设计源.*required.*逐组件.*waived/s);
  }

  assertUniqueMarkersInStrictOrder(fastSection, [
    "【fast 顺序 1：确认 COMPONENTS】",
    "【fast 顺序 2：Developer 仅设计补水】",
    "【fast 顺序 3：components-readiness】",
    "【fast 顺序 4：Developer 测试与实现】",
  ]);
  assertActionsInStrictOrder(fastSection, [
    {
      label: "Architect 产出并确认 COMPONENTS",
      pattern: /Architect[^。\n]*COMPONENTS\.md[^。\n]*用户明确确认/,
    },
    {
      label: "Developer 仅执行设计补水",
      pattern: /Developer[^。\n]*仅设计补水/,
    },
    {
      label: "Developer 运行 components-readiness",
      pattern: /Developer[^。\n]*components-readiness/,
    },
    {
      label: "readiness 通过后测试与实现",
      pattern: /components-readiness[^。\n]*通过[^。\n]*测试与实现/,
    },
  ]);
  assert.match(fastSection, /readiness[^。\n]*通过前[^。\n]*严禁[^。\n]*(?:测试|代码实现)/);
  assert.match(developerReadinessSection, /TDD\.md[^\n]*存在时[^\n]*(?:核对|读取)/);
  assert.match(developerReadinessSection, /fast[^\n]*没有 TDD[^\n]*不阻塞/);
  assert.match(developerReadinessSection, /components-readiness[\s\S]*TDD\.md[^\n]*存在时/);
  assert.doesNotMatch(skill, /优先级[^\n]*waived[^\n]*required/i);
});

/** 验证需求分析师与主 Flow 使用同一套任务级两态和逐组件豁免协议。 */
test("需求分析师仅允许任务级设计源两态并将 waived 限定到逐组件", () => {
  const requirementsAnalyst = fs.readFileSync(
    path.resolve(__dirname, "../agents/requirements-analyst.md"),
    "utf8",
  );

  assert.match(requirementsAnalyst, /设计源两态[^\n]*逐组件豁免/);
  assert.match(requirementsAnalyst, /有设计源[^\n]*required/);
  assert.match(requirementsAnalyst, /无设计源[^\n]*inactive/);
  assert.match(
    requirementsAnalyst,
    /waived[^\n]*不是任务级状态[^\n]*逐组件/,
  );
  assert.match(
    requirementsAnalyst,
    /用户原话摘要[^\n]*残余风险[^\n]*人工视觉验收范围/,
  );
  assert.doesNotMatch(requirementsAnalyst, /inactive\s*\/\s*required\s*\/\s*waived/i);
  assert.doesNotMatch(requirementsAnalyst, /状态为\s*`?waived`?/i);
  assert.doesNotMatch(requirementsAnalyst, /优先级[^\n]*waived[^\n]*required/i);
});

/** 验证 standard 只执行一次合并架构确认，并保持结构校验、确认、补水和实现的顺序。 */
test("standard 使用一次合并确认且随后才进入设计补水", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const standardSection = skill.match(/### `standard`[\s\S]*?(?=\n### )/)?.[0] ?? "";

  assert.match(standardSection, /一次[^。\n]*合并[^。\n]*(?:架构|方案)确认/);
  assert.match(standardSection, /不得[^。\n]*分别[^。\n]*确认/);
  assertActionsInStrictOrder(standardSection, [
    { label: "组件结构校验", pattern: /components[^。\n]*结构校验/ },
    { label: "TDD proposal 校验", pattern: /tdd-proposal/ },
    { label: "一次合并确认", pattern: /一次[^。\n]*合并[^。\n]*确认/ },
    { label: "设计补水", pattern: /开发前设计补水/ },
    { label: "测试与实现", pattern: /测试与实现/ },
  ]);
});

/** 验证 fast 只合并前置方案确认，代码审查与用户处置保持完整独立。 */
test("fast 独立执行完整代码审查、用户选择与限定复审", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";

  assert.match(
    fastSection,
    /只有组件方案与按需存在的架构方案确认可以合并[^。\n]*代码审查处置门禁始终独立/,
  );
  assertActionsInStrictOrder(fastSection, [
    {
      label: "首轮完整代码审查",
      pattern: /首轮完整[^。\n]*代码与交付质量审查/,
    },
    { label: "审查候选校验", pattern: /review-proposal/ },
    {
      label: "所有级别用户选择",
      pattern: /P0\/P1\/P2[^。\n]*用户[^。\n]*选择/,
    },
    {
      label: "跳过修改记录",
      pattern: /跳过此次修改[^。\n]*WAIVED_BY_USER/,
    },
    {
      label: "仅修复选中项",
      pattern: /仅修复[^。\n]*选中/,
    },
    {
      label: "限定复审",
      pattern: /selected-change-recheck[^。\n]*(?:限定|直接影响)/,
    },
    { label: "证据交付", pattern: /证据交付/ },
  ]);
});
