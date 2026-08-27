# Dev Flow Token Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Dev Flow 改为项目级索引复用、工作包最小上下文和增量复审，降低重复 Token 消耗，同时保留真实 P0 与硬风险门禁。

**Architecture:** `.dev-flow/project/` 保存跨需求项目资产，`.dev-flow/runs/{需求编号}/work-packages/{WP编号}/` 保存需求和工作包资产。每个 Agent 以 `HANDOFF.md` 和 `COMPONENT-SLICE.md` 为默认输入；首轮审查覆盖当前 WP，后续轮次只审未关闭问题、本轮变更和相关证据，命中明确触发器才恢复完整审查。

**Tech Stack:** Node.js 18+、CommonJS、`node:test`、Markdown Skill/Agent/模板、POSIX shell。

**Spec:** `docs/superpowers/specs/2026-08-27-token-efficient-flow-design.md`

## Global Constraints

- 所有新增或修改的注释使用中文；新增常量和函数写 JSDoc。
- 禁止 `any`、无关重构、`console.log` 调试残留和未使用代码。
- 不执行任何 Git 命令，不创建提交、分支或 PR。
- 保留真实 P0、权限、安全、不可逆操作、复杂异步状态和关键共享契约门禁。
- 旧 `.dev-flow/artifacts/` 内容只读兼容，不自动删除或覆盖。
- 当前基线中 `tests/init.test.js` 对忽略规则期望 `/.dev-flow/`，实现实际写入 `.dev-flow/`；本计划不借 Token 优化修改该独立行为，执行全量测试时单独报告。
- 代码修改严格执行 RED → GREEN → REFACTOR；每个任务先观察目标测试失败。

## File Structure

### New files

- `templates/handoff-template.md`：工作包最小上下文入口和读取清单。
- `templates/component-slice-template.md`：当前 WP 可复用组件、Hooks 和工具切片。
- `tests/token-efficiency.test.js`：目录、模板、路径和流程契约测试。

### Modified files

- `bin/init.js`：初始化 `project/`、`runs/`，保留旧目录只读兼容。
- `install.sh`：检查新目录和新模板，使用临时文件完成校验器自检。
- `manifest.json`：登记新模板、新产物类型和新目录能力。
- `scripts/scan-project.js`：输出稳定源码指纹，支持项目索引失效判断。
- `scripts/validate-artifact.js`：增加 `handoff`、`component-slice` 和增量复审契约校验。
- `templates/component-index-template.md`：记录指纹、索引版本和项目级生命周期。
- `templates/review-report-template.md`：增加复审模式、输入范围、问题状态和级别变更证据。
- `agents/project-scanner.md`：维护项目索引并生成 WP 切片。
- `agents/architect.md`：默认读取 HANDOFF 和组件切片。
- `agents/developer.md`：默认读取当前 WP 的最小技术上下文。
- `agents/code-reviewer.md`：首轮完整、后续增量；删除 P1 自动升级规则。
- `SKILL.md`：统一目录、上下文协议、治理路由、兼容和复审规则。
- `README.md`：说明新目录、Token 优化行为和全局 Skill 同步要求。
- `tests/init.test.js`：只增加新目录与旧产物保护测试，不改现有忽略规则断言。
- `tests/validate-artifact.test.js`：覆盖两个新产物和复审证据规则。

---

### Task 1: Add minimal-context artifact contracts

**Files:**
- Create: `templates/handoff-template.md`
- Create: `templates/component-slice-template.md`
- Modify: `scripts/validate-artifact.js`
- Modify: `tests/validate-artifact.test.js`

**Interfaces:**
- Consumes: 现有 `runValidator(type, content)` 测试入口和 `VALIDATION_RULES` 结构。
- Produces: `handoff` 与 `component-slice` 两个 CLI artifact type；后续 Agent 和初始化任务依赖这两个名称。

- [ ] **Step 1: Write failing validator tests for HANDOFF**

在 `tests/validate-artifact.test.js` 增加以下测试：

```javascript
test("HANDOFF 缺少读取清单和下一动作时拒绝通过", () => {
  const result = runValidator(
    "handoff",
    "# WP01 交接\n## 当前目标\n完成订单筛选。\n## 范围与非目标\n只修改订单列表。\n## 已确认决策与契约\n筛选条件写入 URL。\n## 风险与阻塞项\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /读取清单|下一动作/);
});

test("HANDOFF 包含最小上下文契约时通过", () => {
  const result = runValidator(
    "handoff",
    "# WP01 交接\n## 当前目标与覆盖 UC\n完成订单筛选，覆盖 UC01。\n## 范围与非目标\n范围为订单列表；不修改订单详情。\n## 已确认决策与接口契约\n筛选条件写入 URL，接口为 GET /api/orders。\n## 系统不变量与风险\n权限边界不变；未关闭风险为无。\n## 当前阻塞项\n无。\n## 允许读取清单\n| 路径 | 读取模式 | 范围 | 理由 | 失效条件 |\n|---|---|---|---|---|\n| src/pages/orders | targeted | OrderList | 当前实现 | 范围变化 |\n## 代码与测试范围\nsrc/pages/orders 和订单筛选测试。\n## 下一动作与停止条件\n先写筛选测试；发现共享契约变化时停止。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});
```

- [ ] **Step 2: Run HANDOFF tests and verify RED**

Run:

```bash
node --test --test-name-pattern="HANDOFF" tests/validate-artifact.test.js
```

Expected: FAIL，因为 `handoff` 尚未出现在 `VALIDATION_RULES`。

- [ ] **Step 3: Write failing validator tests for component slices**

增加以下测试：

```javascript
test("组件切片缺少索引版本和生成条件时拒绝通过", () => {
  const result = runValidator(
    "component-slice",
    "# WP01 组件切片\n## 候选组件\n| 名称 | 导入路径 | 用途 |\n|---|---|---|\n| StatusBadge | @/components/StatusBadge | 展示状态 |\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /索引版本|生成条件|来源/);
});

test("组件切片包含来源和候选资源时通过", () => {
  const result = runValidator(
    "component-slice",
    "# WP01 组件切片\n## 索引来源\n完整索引：.dev-flow/project/COMPONENT-INDEX.md；索引版本：sha256:abc123。\n## 生成条件\n模块路径 src/pages/orders；关键词为订单、状态。\n## 候选组件\n| 名称 | 类型 | 导入路径 | 用途 | 关键 Props | 可复用性 | 证据 |\n|---|---|---|---|---|---|---|\n| StatusBadge | 组件 | @/components/StatusBadge | 展示状态 | status | 可直接复用 | 索引匹配 |\n## 未命中与定向回查\n无。\n",
  );

  assert.equal(result.status, 0, result.stdout);
});
```

- [ ] **Step 4: Run component-slice tests and verify RED**

Run:

```bash
node --test --test-name-pattern="组件切片" tests/validate-artifact.test.js
```

Expected: FAIL，因为 `component-slice` 尚未注册。

- [ ] **Step 5: Add the two validation rules**

在 `VALIDATION_RULES` 中加入：

```javascript
handoff: {
  label: "工作包最小上下文交接",
  requiredSections: [
    { pattern: /当前目标.*覆盖 UC/i, label: "当前目标与覆盖 UC" },
    { pattern: /范围.*非目标/i, label: "范围与非目标" },
    { pattern: /已确认决策.*接口契约/i, label: "已确认决策与接口契约" },
    { pattern: /系统不变量.*风险/i, label: "系统不变量与风险" },
    { pattern: /当前阻塞项/i, label: "当前阻塞项" },
    { pattern: /允许读取清单/i, label: "允许读取清单" },
    { pattern: /代码.*测试范围/i, label: "代码与测试范围" },
    { pattern: /下一动作.*停止条件/i, label: "下一动作与停止条件" },
  ],
  requiredFields: [],
  formatRules: [
    {
      desc: "读取清单必须包含路径、读取模式、范围、理由和失效条件",
      check: (content) =>
        /路径/i.test(content) &&
        /读取模式/i.test(content) &&
        /范围/i.test(content) &&
        /理由/i.test(content) &&
        /失效条件/i.test(content) &&
        /\b(section|targeted|full)\b/i.test(content),
    },
  ],
},

"component-slice": {
  label: "工作包组件上下文切片",
  requiredSections: [
    { pattern: /索引来源/i, label: "索引来源" },
    { pattern: /生成条件/i, label: "生成条件" },
    { pattern: /候选组件|候选资源/i, label: "候选资源" },
    { pattern: /未命中.*定向回查/i, label: "未命中与定向回查" },
  ],
  requiredFields: [],
  formatRules: [
    {
      desc: "组件切片必须记录完整索引路径和版本",
      check: (content) =>
        /COMPONENT-INDEX\.md/i.test(content) && /索引版本/i.test(content),
    },
    {
      desc: "候选资源必须包含导入路径、用途、可复用性和证据",
      check: (content) =>
        /导入路径/i.test(content) &&
        /用途/i.test(content) &&
        /可复用性/i.test(content) &&
        /证据/i.test(content),
    },
  ],
},
```

- [ ] **Step 6: Create the HANDOFF template**

`templates/handoff-template.md` 使用测试中的全部章节，并在读取清单中提供以下固定列：

```markdown
# {WP编号} 最小上下文交接

## 当前目标与覆盖 UC

## 范围与非目标

## 已确认决策与接口契约

## 系统不变量与风险

## 当前阻塞项

## 允许读取清单

| 路径 | 读取模式 | 范围 | 理由 | 失效条件 |
|------|---------|------|------|---------|
| `{精确路径}` | `section` / `targeted` / `full` | `{章节、符号或搜索词}` | `{当前任务需要}` | `{重新加载条件}` |

## 代码与测试范围

## 下一动作与停止条件
```

- [ ] **Step 7: Create the component-slice template**

`templates/component-slice-template.md` 使用以下结构：

```markdown
# {WP编号} 组件上下文切片

## 索引来源

- 完整索引：`.dev-flow/project/COMPONENT-INDEX.md`
- 索引版本：`{源码指纹}`

## 生成条件

- 模块路径：`{路径列表}`
- 业务关键词：`{关键词列表}`
- 候选名称：`{组件、Hook 或工具名称}`

## 候选资源

| 名称 | 类型 | 导入路径 | 用途 | 关键 Props/签名 | 可复用性 | 证据 |
|------|------|---------|------|----------------|---------|------|

## 未命中与定向回查

记录未命中项、使用的搜索词和是否需要定向读取完整索引。
```

- [ ] **Step 8: Run validator tests and template validation**

Run:

```bash
node --test tests/validate-artifact.test.js
node scripts/validate-artifact.js handoff templates/handoff-template.md
node scripts/validate-artifact.js component-slice templates/component-slice-template.md
```

Expected: 全部退出码为 0。

---

### Task 2: Introduce project and run directory boundaries

**Files:**
- Modify: `bin/init.js`
- Modify: `install.sh`
- Modify: `manifest.json`
- Modify: `tests/init.test.js`
- Modify: `tests/token-efficiency.test.js`

**Interfaces:**
- Consumes: Task 1 产生的两个模板和 artifact type。
- Produces: `.dev-flow/project/`、`.dev-flow/runs/`；旧 `.dev-flow/artifacts/` 只读兼容检测。

- [ ] **Step 1: Add failing initialization tests**

在 `tests/init.test.js` 增加：

```javascript
test("初始化会创建项目资产和需求运行目录", () => {
  const targetDir = createTargetProject();

  const result = runInit(targetDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(targetDir, ".dev-flow", "project")), true);
  assert.equal(fs.existsSync(path.join(targetDir, ".dev-flow", "runs")), true);
  assert.equal(
    fs.existsSync(path.join(targetDir, ".dev-flow", "templates", "handoff-template.md")),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(targetDir, ".dev-flow", "templates", "component-slice-template.md"),
    ),
    true,
  );
});

test("初始化不会覆盖既有旧版需求产物", () => {
  const targetDir = createTargetProject();
  const legacyArtifactsDir = path.join(targetDir, ".dev-flow", "artifacts");
  fs.mkdirSync(legacyArtifactsDir, { recursive: true });
  fs.writeFileSync(path.join(legacyArtifactsDir, "PRD.md"), "legacy-prd", "utf8");

  const result = runInit(targetDir);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.readFileSync(path.join(legacyArtifactsDir, "PRD.md"), "utf8"),
    "legacy-prd",
  );
  assert.equal(fs.existsSync(path.join(targetDir, ".dev-flow", "project")), true);
  assert.equal(fs.existsSync(path.join(targetDir, ".dev-flow", "runs")), true);
});
```

- [ ] **Step 2: Run new initialization tests and verify RED**

Run:

```bash
node --test --test-name-pattern="项目资产|旧版需求产物" tests/init.test.js
```

Expected: 第一个测试因缺少 `project/` 和 `runs/` 失败。

- [ ] **Step 3: Modify init directory creation**

在 `bin/init.js` 增加目录常量：

```javascript
/** 跨需求复用的项目资产目录名称。 */
const PROJECT_ASSETS_DIR_NAME = "project";

/** 每次需求运行的隔离目录名称。 */
const PROJECT_RUNS_DIR_NAME = "runs";

/** 旧版运行产物目录名称，只做兼容检测。 */
const LEGACY_ARTIFACTS_DIR_NAME = "artifacts";
```

模板复制完成后创建：

```javascript
fs.mkdirSync(path.join(projectPipelineDir, PROJECT_ASSETS_DIR_NAME), {
  recursive: true,
});
fs.mkdirSync(path.join(projectPipelineDir, PROJECT_RUNS_DIR_NAME), {
  recursive: true,
});
console.log(`  ${C.G}✓${C.N} project/ (跨需求项目资产)`);
console.log(`  ${C.G}✓${C.N} runs/ (需求与工作包产物)`);
```

如果 `.dev-flow/` 已存在，不整体跳过升级；改为仅补齐缺失的 `scripts/`、`templates/`、`project/` 和 `runs/`。复制单个已有文件前先跳过，确保 `artifacts/` 和用户产物不被覆盖。

- [ ] **Step 4: Update manifest paths and capabilities**

将 `manifest.json` 的产物配置改为：

```json
"artifacts": {
  "project": ".dev-flow/project/",
  "runs": ".dev-flow/runs/",
  "legacyReadOnly": ".dev-flow/artifacts/"
}
```

在 `templates` 数组加入两个新模板；在 `capabilities` 加入：

```json
"contextProtocol": "handoff-sliced",
"reviewMode": ["full-first-round", "incremental-recheck"]
```

- [ ] **Step 5: Update install checks**

`install.sh` 在项目目录检查 `project`、`runs`，在 Skill 目录只检查模板文件。模板循环增加：

```text
handoff-template
component-slice-template
```

模板校验映射增加：

```text
handoff:handoff-template
component-slice:component-slice-template
```

校验器空内容自检改用 `mktemp` 创建临时文件并在结束时清理，不再依赖 `artifacts/_test_empty.md`。

- [ ] **Step 6: Run initialization and package checks**

Run:

```bash
node --test --test-name-pattern="项目资产|旧版需求产物" tests/init.test.js
npm run check
```

Expected: 新增初始化测试通过；安装检查识别两个新模板和目录。

---

### Task 3: Add stable scan fingerprints and project-level index metadata

**Files:**
- Modify: `scripts/scan-project.js`
- Modify: `templates/component-index-template.md`
- Modify: `agents/project-scanner.md`
- Create: `tests/token-efficiency.test.js`

**Interfaces:**
- Consumes: `scan-project.js` 当前 JSON 输出中的项目、组件、Hooks、包和 Skill 数据。
- Produces: `sourceFingerprint: string`；`.dev-flow/project/COMPONENT-INDEX.md` 和 `.dev-flow/project/SCAN-META.json` 契约。

- [ ] **Step 1: Write a failing fingerprint stability test**

`tests/token-efficiency.test.js` 使用临时项目运行真实扫描 CLI：

```javascript
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

/** 项目扫描 CLI 的绝对路径。 */
const SCAN_CLI_PATH = path.resolve(__dirname, "../scripts/scan-project.js");

/** 创建包含一个组件的临时前端项目。 */
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

/** 执行扫描并解析 JSON 输出。 */
function runScan(projectDir) {
  const result = spawnSync(process.execPath, [SCAN_CLI_PATH, projectDir], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
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
```

- [ ] **Step 2: Run fingerprint test and verify RED**

Run:

```bash
node --test --test-name-pattern="扫描指纹" tests/token-efficiency.test.js
```

Expected: FAIL，因为 `sourceFingerprint` 尚不存在。

- [ ] **Step 3: Implement deterministic fingerprinting**

在 `scan-project.js` 引入：

```javascript
const crypto = require("node:crypto");
```

新增函数：

```javascript
/**
 * 根据扫描覆盖的源码文件生成稳定指纹。
 *
 * @param {string} projectRoot 项目根目录。
 * @param {string[]} sourceFiles 已扫描源码文件的绝对路径。
 * @returns {string} 带算法前缀的源码指纹。
 */
function createSourceFingerprint(projectRoot, sourceFiles) {
  const hash = crypto.createHash("sha256");
  const normalizedFiles = [...new Set(sourceFiles)].sort();

  for (const filePath of normalizedFiles) {
    hash.update(path.relative(projectRoot, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
```

扫描组件、Hooks、工具和项目 Skill 时收集已读取源码文件，最终 JSON 顶层写入 `sourceFingerprint`。不要把 `scanTime`、绝对临时目录或文件遍历顺序加入指纹。

- [ ] **Step 4: Update index and scan metadata contracts**

`component-index-template.md` 顶部元数据改为：

```markdown
> 项目根目录：{project_root}
> 索引版本：{sourceFingerprint}
> 最后扫描时间：{timestamp}
> 生命周期：项目级；源码指纹不变时跨需求复用
```

`project-scanner.md` 明确写入：

```json
{
  "sourceFingerprint": "sha256:实际扫描指纹",
  "scannedAt": "ISO-8601 时间",
  "componentIndex": ".dev-flow/project/COMPONENT-INDEX.md"
}
```

Scanner 比较 `SCAN-META.json.sourceFingerprint` 与新扫描结果；相同则不执行 AI 语义补充，不重写索引。不同则仅补充增量新增或变更资源。

- [ ] **Step 5: Run scan tests**

Run:

```bash
node --test --test-name-pattern="扫描指纹" tests/token-efficiency.test.js
node scripts/scan-project.js .
```

Expected: 测试通过；CLI 输出包含格式正确的 `sourceFingerprint`。

---

### Task 4: Enforce HANDOFF-first context loading across agents

**Files:**
- Modify: `SKILL.md`
- Modify: `agents/project-scanner.md`
- Modify: `agents/architect.md`
- Modify: `agents/developer.md`
- Modify: `agents/code-reviewer.md`
- Modify: `README.md`
- Modify: `tests/token-efficiency.test.js`

**Interfaces:**
- Consumes: Task 1 的 HANDOFF/组件切片契约、Task 2 的目录、Task 3 的索引版本。
- Produces: 所有执行角色统一的 `section | targeted | full` 读取行为和扩读触发器。

- [ ] **Step 1: Add a failing flow-contract test**

在 `tests/token-efficiency.test.js` 增加：

```javascript
test("执行角色统一要求先读 HANDOFF 和组件切片", () => {
  const requiredFiles = [
    "agents/architect.md",
    "agents/developer.md",
    "agents/code-reviewer.md",
  ];

  for (const relativePath of requiredFiles) {
    const content = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
    assert.match(content, /先读取.*HANDOFF\.md/);
    assert.match(content, /COMPONENT-SLICE\.md/);
    assert.match(content, /section.*targeted.*full/s);
    assert.match(content, /扩大读取范围.*触发原因/);
  }
});
```

- [ ] **Step 2: Run the role contract test and verify RED**

Run:

```bash
node --test --test-name-pattern="执行角色" tests/token-efficiency.test.js
```

Expected: FAIL，因为角色仍要求默认读取完整 PRD、TDD 和组件索引。

- [ ] **Step 3: Replace the global context package in SKILL.md**

上下文 Schema 增加：

```json
"contextEntry": ".dev-flow/runs/{需求编号}/work-packages/WP01/HANDOFF.md",
"componentSlice": ".dev-flow/runs/{需求编号}/work-packages/WP01/COMPONENT-SLICE.md",
"allowedReads": [
  {
    "path": "src/pages/orders",
    "mode": "targeted",
    "scope": "OrderList",
    "reason": "当前工作包实现范围",
    "invalidateWhen": "工作包范围变化"
  }
]
```

增加统一规则：

1. 先读取 HANDOFF；
2. 再读取 HANDOFF 列出的 section/targeted 内容；
3. 默认读取 COMPONENT-SLICE，不全文读取项目索引；
4. 只有契约冲突、范围变化、真实 P0 证据不足、全局回归或小文件切片失真时使用 full；
5. 扩大读取范围必须记录触发原因和新增范围。

将所有新产物路径替换为 `.dev-flow/project/` 或 `.dev-flow/runs/{需求编号}/`；旧路径只出现在兼容章节。

- [ ] **Step 4: Update each role with a positive read recipe**

Architect、Developer、Reviewer 的输入章节按固定顺序改为：

```markdown
1. 当前工作包 `HANDOFF.md`。
2. 当前工作包 `COMPONENT-SLICE.md`。
3. HANDOFF 明确列出的章节、代码范围和测试范围。
4. 命中扩读触发器时使用的完整产物路径和触发原因。
```

删除“强制读取完整 COMPONENT-INDEX.md”以及默认完整读取 PRD/TDD 的表达。保留“需要更多证据时可按 HANDOFF 定向回查”的能力。

Scanner 增加生成切片的步骤：先按路径、关键词和候选名搜索完整索引，只把匹配行写入当前 WP 的 `COMPONENT-SLICE.md`；未命中时记录搜索条件，Architect 决定是否定向回查。

- [ ] **Step 5: Update README lifecycle documentation**

README 展示 `project/`、`runs/` 和 WP 目录，说明：

- 项目索引跨需求复用；
- 工作包使用 HANDOFF 恢复；
- 默认读取切片；
- 全局安装副本不会因仓库修改自动更新，验证后必须重新安装或同步。

- [ ] **Step 6: Run flow-contract and terminology tests**

Run:

```bash
node --test tests/token-efficiency.test.js tests/terminology.test.js
```

Expected: 全部通过。

---

### Task 5: Implement incremental re-review and evidence-based severity upgrades

**Files:**
- Modify: `agents/code-reviewer.md`
- Modify: `templates/review-report-template.md`
- Modify: `scripts/validate-artifact.js`
- Modify: `tests/validate-artifact.test.js`
- Modify: `SKILL.md`

**Interfaces:**
- Consumes: 工作包 HANDOFF、上轮 REVIEW、变更文件列表和测试证据。
- Produces: `reviewMode: full | incremental`；级别变更必须携带新证据。

- [ ] **Step 1: Write failing incremental-review validation tests**

在 `tests/validate-artifact.test.js` 增加：

```javascript
test("第二轮审查缺少增量输入范围时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n模式：incremental。\n## 问题状态\nP0-1 未关闭。\n## 问题清单\nP0-1 仍需修复。\n## 反例验证\n重复提交仍可复现。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为受影响测试通过。\n## 级别变更记录\n无。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /未关闭问题|本轮修改文件|相关测试证据/);
});

test("P1 升级 P0 缺少新证据时拒绝通过", () => {
  const result = runValidator(
    "review",
    "# 审查报告\n## 审查摘要\n审查轮次：第 2 轮。\n## 审查依据层级\n用户目标优先。\n## 复审模式与输入范围\n模式：incremental。未关闭问题：P1-1。本轮修改文件：src/a.ts。相关测试证据：node --test。\n## 问题状态\nP1-1 从 P1 升级为 P0。\n## 问题清单\nP0-1 必须修改。\n## 反例验证\n未发现新反例。\n## 运行证据\n本轮实际命令 node --test，退出码 0，结果摘要为通过。\n## 级别变更记录\nP1-1：P1→P0，原因是尚未修改。\n",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /新证据|可复现反例|影响升级/);
});
```

- [ ] **Step 2: Run the review tests and verify RED**

Run:

```bash
node --test --test-name-pattern="第二轮审查|P1 升级" tests/validate-artifact.test.js
```

Expected: FAIL，因为 review 规则尚未约束增量输入和升级证据。

- [ ] **Step 3: Extend review validation**

新增旧路径判断函数，保证迁移期旧报告仍可读取：

```javascript
/**
 * 判断文件是否位于旧版 artifacts 目录。
 *
 * @param {string} filePath 产物路径。
 * @returns {boolean} 是否为旧版只读产物。
 */
function isLegacyArtifactPath(filePath) {
  const normalizedPath = path.normalize(filePath);
  return normalizedPath.includes(
    `${path.sep}.dev-flow${path.sep}artifacts${path.sep}`,
  );
}
```

不要把三个新章节直接放入无条件 `requiredSections`，否则旧报告会失去兼容性。改为增加一条新格式结构规则和两条行为规则：

```javascript
{
  desc: "新格式审查报告必须包含复审范围、问题状态和级别变更记录",
  check: (content, filePath) =>
    isLegacyArtifactPath(filePath) ||
    (/复审模式.*输入范围/i.test(content) &&
      /问题状态/i.test(content) &&
      /级别变更记录/i.test(content)),
},
{
  desc: "第二轮及以后必须记录增量复审输入",
  check: (content, filePath) => {
    if (
      isLegacyArtifactPath(filePath) ||
      isTemplateArtifact(filePath) ||
      !/第\s*[2-9]\d*\s*轮/i.test(content)
    ) {
      return true;
    }
    const section = extractMarkdownSection(content, /复审模式.*输入范围/i);
    return (
      /incremental/i.test(section) &&
      /未关闭问题/i.test(section) &&
      /本轮修改文件/i.test(section) &&
      /相关测试证据/i.test(section)
    );
  },
},
{
  desc: "P1 升级 P0 必须记录新的高影响证据",
  check: (content, filePath) => {
    if (
      isLegacyArtifactPath(filePath) ||
      isTemplateArtifact(filePath) ||
      !/P1\s*(?:→|->|升级为)\s*P0/i.test(content)
    ) {
      return true;
    }
    const section = extractMarkdownSection(content, /级别变更记录/i);
    return /新证据|可复现反例|影响升级|违反.*不变量/i.test(section);
  },
},
```

- [ ] **Step 4: Update review template**

在审查摘要后加入：

```markdown
## 复审模式与输入范围

- 审查模式：`full` / `incremental`
- 审查轮次：第 {N} 轮
- 未关闭问题：{稳定问题编号；首轮写“首轮不适用”}
- 用户确认修改的 P1/P2：{编号或“无”}
- 本轮修改文件：{精确路径列表}
- 相关 TDD 章节：{章节列表或“fast 路径不适用”}
- 相关测试证据：{命令与结果位置}
- 恢复完整审查触发器：{未命中，或触发器与扩大范围}

## 问题状态

| 编号 | 上轮级别 | 当前级别 | 状态 | 关闭或保留证据 |
|------|---------|---------|------|---------------|

## 级别变更记录

没有级别变化时写“无”。P1 升级为 P0 时必须记录新的可复现反例、影响升级或违反的系统不变量。
```

- [ ] **Step 5: Replace reviewer re-review rules**

删除 `P1→P0` 自动升级规则，改为：

1. 首轮使用 `full`；
2. 第二轮以后使用 `incremental`；
3. 先验证未关闭问题，再检查修改影响范围内的新问题；
4. 不重新输出已关闭且未受影响的问题；
5. API、共享类型、路由、权限、全局状态、范围越界或新全局失败触发完整审查；
6. P1 只有新高影响证据才能升级 P0；
7. 第三轮仍有 P0 时停止自动回环并请求人工判断。

SKILL.md 的阶段 4 和多工作包循环同步同一规则。

- [ ] **Step 6: Run review validator and template checks**

Run:

```bash
node --test tests/validate-artifact.test.js
node scripts/validate-artifact.js review templates/review-report-template.md
```

Expected: 全部通过。

---

### Task 6: Align governance routing, compatibility, and release verification

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `install.sh`
- Modify: `tests/token-efficiency.test.js`
- Verify: all files listed in this plan

**Interfaces:**
- Consumes: Tasks 1–5 的目录、模板、扫描和复审能力。
- Produces: 对外一致的 Token 高效 Flow、兼容说明和验证证据。

- [ ] **Step 1: Add a failing routing and compatibility contract test**

在 `tests/token-efficiency.test.js` 增加：

```javascript
test("主 Flow 同时声明 fast 默认条件、旧路径只读兼容和全局副本同步", () => {
  const skill = fs.readFileSync(path.resolve(__dirname, "../SKILL.md"), "utf8");
  const readme = fs.readFileSync(path.resolve(__dirname, "../README.md"), "utf8");

  assert.match(skill, /局部.*可逆.*无共享契约[\s\S]*默认.*fast/i);
  assert.match(skill, /\.dev-flow\/artifacts\/[\s\S]*只读兼容/i);
  assert.match(readme, /重新安装|同步全局 Skill/);
});
```

- [ ] **Step 2: Run contract test and verify RED**

Run:

```bash
node --test --test-name-pattern="主 Flow" tests/token-efficiency.test.js
```

Expected: FAIL，因为旧路径兼容和全局副本同步尚未完整写入。

- [ ] **Step 3: Finalize routing rules**

SKILL.md 明确：满足全部 fast 条件时默认 `fast`；只有权限、安全、不可逆操作、共享契约、复杂异步状态或高不确定性才升级。`standard` 保留轻量架构对抗审查，`rigorous` 保留完整风险治理，但三种路径都必须遵守 HANDOFF-first 读取协议。

结构校验、独立语义审查和运行证据仍然分离，不能以 Token 优化为由跳过真实失败。

- [ ] **Step 4: Add compatibility and rollout instructions**

SKILL.md 与 README 加入：

- 旧 `.dev-flow/artifacts/` 仅作为历史运行只读来源；
- 新需求写入 `.dev-flow/runs/{需求编号}/`；
- 旧组件索引可用于首次生成 `.dev-flow/project/COMPONENT-INDEX.md`，但不自动删除；
- 仓库 Skill 与 `/Users/hly/.agents/skills/dev-flow/` 不会自动同步；完成验证后用户需要重新安装或手动同步；
- 不在本实现中直接写全局安装目录。

- [ ] **Step 5: Update manifest descriptions**

在 `manifest.json` 的描述和能力中加入项目索引复用、最小上下文和增量复审。保持已有 Agent id、alias 和岗位名称不变。

- [ ] **Step 6: Run focused verification**

Run:

```bash
node --test tests/token-efficiency.test.js tests/terminology.test.js tests/validate-artifact.test.js
node scripts/validate-artifact.js handoff templates/handoff-template.md
node scripts/validate-artifact.js component-slice templates/component-slice-template.md
node scripts/validate-artifact.js review templates/review-report-template.md
python3 /Users/hly/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
npm run check
```

Expected: 所有命令退出码为 0。

- [ ] **Step 7: Run the complete test suite and classify baseline failures**

Run:

```bash
npm test
```

Expected for this feature: Token 效率、术语和产物校验测试全部通过。若仍只有既有 `.gitignore` 三项断言失败，记录实际值 `.dev-flow/` 与期望值 `/.dev-flow/`，不得将其误报为本功能通过，也不得在未获用户授权时扩大范围修复。

- [ ] **Step 8: Perform final residual scans**

Run:

```bash
rg -n "强制.*完整.*COMPONENT-INDEX|未修复.*升级.*P0|P1→P0|\.dev-flow/artifacts/(PRD|TDD|REVIEW|COMPONENTS)" SKILL.md README.md agents templates manifest.json
rg -n "TBD|TODO|稍后补充" SKILL.md README.md agents templates scripts tests
```

Expected: 第一条只命中明确标注的旧路径兼容说明或“禁止自动升级”规则；第二条不命中新实现中的未完成内容。模板中用于用户填写的花括号字段不视为未完成实现。

- [ ] **Step 9: Prepare delivery evidence**

交付摘要必须包含：

1. 新目录和兼容行为；
2. HANDOFF 与组件切片读取规则；
3. 首轮完整、后续增量复审规则；
4. P1 升级的新证据要求；
5. 实际运行命令、退出码和测试结果；
6. 已知基线失败；
7. 用户需要重新安装或同步全局 Skill 的明确提示。

不得执行 Git 操作。
