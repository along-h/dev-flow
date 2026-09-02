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

test("执行角色按治理深度读取最小上下文", () => {
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
    assert.match(content, /PLAN\.md|HANDOFF\.md/);
    assert.match(content, /Fast\/Standard|Rigorous/i);
    assert.match(content, /section.*targeted.*full/s);
    assert.match(content, /(?:扩大读取范围|扩大范围|扩大原因|记录原因)/);
  }
});

test("Developer 按治理深度产出方案且高风险时停止升级", () => {
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );

  assert.match(developer, /fast[\s\S]*Developer[\s\S]*PLAN\.md/);
  assert.match(developer, /standard[\s\S]*Developer[\s\S]*PLAN\.md/);
  assert.match(developer, /Liu[\s\S]*审核/);
  assert.match(developer, /共享契约|权限|安全|不可逆|复杂状态/);
  assert.match(developer, /停止[\s\S]*Liu[\s\S]*(?:重新路由|升级)/);
  assert.doesNotMatch(developer, /不得自行补写架构事实/);
});

test("Architect 只接受共享架构或 Rigorous 高风险任务", () => {
  const architect = fs.readFileSync(
    path.resolve(__dirname, "../agents/architect.md"),
    "utf8",
  );

  assert.match(architect, /Chen（按需架构专家）/);
  assert.match(architect, /shared-architecture/);
  assert.match(architect, /rigorous-review/);
  assert.match(architect, /不得默认参与|不默认参与/);
  assert.doesNotMatch(architect, /对每个工作包分两个阶段执行/);
});

test("主 Flow 同时声明 fast 默认条件、旧路径只读兼容和全局副本同步", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

  assert.match(skill, /局部.*可逆[\s\S]*默认.*fast/i);
  assert.match(skill, /\.dev-flow\/artifacts\/[\s\S]*只读兼容/i);
  assert.match(readme, /重新安装|同步全局 Skill/);
});

/** 验证只有 Rigorous 使用逐组件设计补水，Fast/Standard 使用视觉簇。 */
test("只有 Rigorous 使用逐组件设计补水与开发准入", () => {
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const rigorousDevelopmentSection = skill.match(
    /### 阶段 3：开发实现[\s\S]*?(?=\n### 阶段 4：)/,
  )?.[0] ?? "";
  const developerReadinessSection = developer.match(
    /### Rigorous 第零步补充：设计源门禁与即时补水[\s\S]*?(?=\n### 第一步：)/,
  )?.[0] ?? "";

  const readinessMarkers = [
    "【顺序 1：读取确认 COMPONENTS】",
    "【顺序 2：分支补水与自动定位】",
    "【顺序 3：一次性 blocked】",
    "【顺序 4：components-readiness】",
    "【顺序 5：读取已审批 TDD】",
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
      pattern: /(?:读取|核对)[^。\n]*TDD/,
    },
    { label: "测试与实现", pattern: /(?:逐组件实现|可见 UI 组件[^。\n]*逐项实现)/ },
  ];

  for (const content of [developerReadinessSection, rigorousDevelopmentSection]) {
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

  assert.match(fastSection, /PLAN\.md/);
  assert.match(fastSection, /视觉簇/);
  assert.doesNotMatch(fastSection, /components-readiness|每个可见 UI 组件/);
  assert.doesNotMatch(skill, /优先级[^\n]*waived[^\n]*required/i);
});

test("主 Flow 按风险路由方案作者和审核者", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const standardSection = skill.match(/### `standard`[\s\S]*?(?=\n### )/)?.[0] ?? "";
  const rigorousSection = skill.match(/### `rigorous`[\s\S]*?(?=\n## )/)?.[0] ?? "";
  const multiSection = skill.match(/## 多工作流执行[\s\S]*?(?=\n## Rigorous)/)?.[0] ?? "";

  assert.match(fastSection, /Developer[^。\n]*PLAN\.md/);
  assert.doesNotMatch(fastSection, /Architect/);
  assert.match(standardSection, /Developer[^。\n]*PLAN\.md/);
  assert.match(standardSection, /Liu[^。\n]*审核/);
  assert.doesNotMatch(
    standardSection,
    /默认[^。\n]*Architect|Architect[^。\n]*默认/,
  );
  assertActionsInStrictOrder(standardSection, [
    { label: "Developer 提案", pattern: /Developer[^。\n]*PLAN\.md/ },
    { label: "Liu 技术审核", pattern: /Liu[^。\n]*审核/ },
    { label: "用户确认", pattern: /用户[^。\n]*确认/ },
  ]);
  assert.match(rigorousSection, /Architect/);
  assert.match(multiSection, /共享契约|共享架构/);
  assert.match(multiSection, /GLOBAL-ARCHITECTURE\.md/);
  assert.match(multiSection, /各工作包[^。\n]*(?:fast|standard|rigorous)/i);
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

/** 验证 Standard 只在 Fast 上增加真实风险治理。 */
test("standard 使用统一 PLAN 和一次方案确认", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const standardSection = skill.match(/### `standard`[\s\S]*?(?=\n### )/)?.[0] ?? "";

  assert.match(standardSection, /Fast[^。\n]*风险增量/);
  assertActionsInStrictOrder(standardSection, [
    { label: "Developer PLAN", pattern: /Developer[^。\n]*PLAN\.md/ },
    { label: "Liu 风险审核", pattern: /Liu[^。\n]*审核/ },
    { label: "一次方案确认", pattern: /一次方案确认/ },
    { label: "实现和验证", pattern: /实现和验证/ },
  ]);
});

/** 验证 Fast 默认自检交付，审查只由触发器插入。 */
test("fast 默认 Developer 自检且 Reviewer 为条件节点", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const fastSection = skill.match(/### `fast`[\s\S]*?(?=\n### )/)?.[0] ?? "";

  assertActionsInStrictOrder(fastSection, [
    { label: "PLAN", pattern: /PLAN\.md/ },
    { label: "用户确认", pattern: /用户[^。\n]*确认/ },
    { label: "实现和验证", pattern: /实现[^。\n]*验证/ },
    { label: "Developer 自检", pattern: /Developer[^。\n]*自检/ },
    { label: "直接交付", pattern: /未命中[^。\n]*reviewTriggers[^。\n]*直接交付/ },
  ]);
  assert.doesNotMatch(fastSection, /review-proposal|selected-change-recheck/);
});

test("Fast 与 Standard 默认只维护统一 PLAN", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );

  assert.match(skill, /Fast[^。\n]*Standard[^。\n]*PLAN\.md/);
  assert.match(skill, /Standard[^。\n]*(?:Fast[^。\n]*增量|风险增量)/);
  assert.match(developer, /fast[^\n]*PLAN\.md/i);
  assert.match(developer, /standard[^\n]*PLAN\.md/i);
  assert.match(
    skill,
    /单工作包[^。\n]*(?:不默认|无需)[^。\n]*(?:PRD|TASK-BREAKDOWN)[^。\n]*(?:TDD|HANDOFF)/,
  );
});

test("Fast 与 Standard 按视觉簇补水而不是递归逐组件提取", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const developer = fs.readFileSync(
    path.resolve(__dirname, "../agents/developer.md"),
    "utf8",
  );

  for (const content of [skill, developer]) {
    assert.match(content, /视觉簇/);
    assert.match(content, /复用且不修改[^。\n]*(?:只记录|无需)[^。\n]*(?:契约路径|精确子节点)/);
    assert.match(content, /不得[^。\n]*递归[^。\n]*(?:所有|每个)[^。\n]*可见/);
  }
});

test("默认上下文和治理产物具有硬预算", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");

  assert.match(skill, /Fast[^。\n]*150\s*行/);
  assert.match(skill, /Standard[^。\n]*300\s*行/);
  assert.match(skill, /单 Agent[^。\n]*15\s*KB/);
  assert.match(skill, /多个[^。\n]*full[^。\n]*(?:绕过|超限)/i);
});
