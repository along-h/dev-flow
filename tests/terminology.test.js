const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

/** Dev Flow manifest 路径。 */
const MANIFEST_PATH = path.resolve(__dirname, "../manifest.json");

/** npm package 元数据路径。 */
const PACKAGE_PATH = path.resolve(__dirname, "../package.json");

/** Dev Flow 公开说明路径。 */
const README_PATH = path.resolve(__dirname, "../README.md");

test("公开元数据统一为 v2", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));

  assert.equal(manifest.version, "2.0.0");
  assert.equal(packageJson.version, "2.0.0");
  assert.ok(packageJson.files.includes("references/"));
  assert.equal(
    manifest.capabilities.designDecision,
    "user-choice-before-ui-development",
  );
  assert.equal(manifest.capabilities.parallelism, "dependency-waves");
  assert.equal(manifest.capabilities.legacyArtifactValidation, true);
});

test("README 公开设计选择、并行波次和迁移说明", () => {
  const readme = fs.readFileSync(README_PATH, "utf8");

  assert.match(readme, /provided-specific/);
  assert.match(readme, /use-current-basis/);
  assert.match(readme, /并行(?:批次|波次)/);
  assert.match(readme, /AGENTS\.md/);
  assert.match(readme, /固定行数/);
});
