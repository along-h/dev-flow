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
