#!/usr/bin/env node

/**
 * dev-flow init
 *
 * 从全局 skill 安装目录（或 npm 全局安装路径）将脚本、模板复制到目标项目。
 *
 * 用法：
 *   npx dev-flow init [--dir /path/to/project]
 *   npx dev-flow init           (默认当前目录)
 *   npx dev-flow init --check   (只校验，不复制)
 */

const fs = require("fs");
const path = require("path");

// ─── 颜色 ────────────────────────────────────────────────
const C = { R: "\x1b[0;31m", G: "\x1b[0;32m", Y: "\x1b[1;33m", B: "\x1b[0;34m", N: "\x1b[0m" };

// ─── 参数解析 ────────────────────────────────────────────
function parseArgs(argv) {
  const args = { targetDir: ".", checkOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) {
      args.targetDir = argv[++i];
    } else if (argv[i] === "--check") {
      args.checkOnly = true;
    }
  }
  return args;
}

// ─── 工具函数 ────────────────────────────────────────────
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return [];
  const copied = [];
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied.push(...copyDir(srcPath, destPath));
    } else {
      fs.copyFileSync(srcPath, destPath);
      copied.push(path.relative(dest, destPath));
    }
  }
  return copied;
}

function checkNodeVersion() {
  const v = process.versions.node.split(".").map(Number);
  return v[0] >= 18;
}

// ─── 主逻辑 ──────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(args.targetDir);

  // skill 目录 = 本脚本所在目录的父目录（bin/ → dev-flow/）
  const skillDir = path.resolve(__dirname, "..");

  console.log("");
  console.log(`${C.B}╔══════════════════════════════════════════════════════╗${C.N}`);
  console.log(`${C.B}║  Dev Flow · 专家开发团队  v1.0.0                    ║${C.N}`);
  console.log(`${C.B}║  Dev Flow — Expert Development Team                 ║${C.N}`);
  console.log(`${C.B}╚══════════════════════════════════════════════════════╝${C.N}`);
  console.log("");

  // ── 前置检查 ──
  if (!checkNodeVersion()) {
    console.log(`${C.R}✗ Node.js 版本过低，需要 >=18${C.N}`);
    process.exit(1);
  }
  console.log(`${C.G}✓${C.N} Node.js ${process.versions.node}`);

  // 检查 skill 目录完整性
  const required = ["SKILL.md", "manifest.json", "scripts/scan-project.js", "scripts/validate-artifact.js"];
  let missing = false;
  for (const f of required) {
    if (!fs.existsSync(path.join(skillDir, f))) {
      console.log(`${C.R}✗ 缺失: ${f}${C.N}`);
      missing = true;
    }
  }
  if (missing) {
    console.log(`${C.R}Skill 安装不完整，请重新安装: npx skills add <repo>${C.N}`);
    process.exit(1);
  }
  console.log(`${C.G}✓${C.N} Skill 文件完整`);

  // ── 复制到目标项目 ──
  if (args.checkOnly) {
    console.log("");
    console.log(`${C.B}══════════════════════════════════════════════════════${C.N}`);
    console.log(`${C.G}  ✅ 全部检查通过！${C.N}`);
    console.log("");
    console.log(`  运行以下命令完成项目初始化：`);
    console.log(`    ${C.Y}npx dev-flow init --dir /path/to/project${C.N}`);
    console.log("");
    process.exit(0);
  }

  const projectPipelineDir = path.join(targetDir, "dev-flow");

  if (fs.existsSync(projectPipelineDir)) {
    console.log(`${C.Y}⚠  dev-flow/ 已存在于目标项目，跳过复制。${C.N}`);
    console.log(`  如需重新初始化，请先删除: rm -rf ${projectPipelineDir}`);
  } else {
    console.log("");
    console.log(`${C.Y}[1/3] 复制脚本到项目...${C.N}`);
    const scriptsCopied = copyDir(
      path.join(skillDir, "scripts"),
      path.join(projectPipelineDir, "scripts")
    );
    for (const f of scriptsCopied) {
      console.log(`  ${C.G}✓${C.N} scripts/${f}`);
    }

    console.log("");
    console.log(`${C.Y}[2/3] 复制模板到项目...${C.N}`);
    const templatesCopied = copyDir(
      path.join(skillDir, "templates"),
      path.join(projectPipelineDir, "templates")
    );
    for (const f of templatesCopied) {
      console.log(`  ${C.G}✓${C.N} templates/${f}`);
    }

    console.log("");
    console.log(`${C.Y}[3/3] 创建 artifacts 目录...${C.N}`);
    fs.mkdirSync(path.join(projectPipelineDir, "artifacts"), { recursive: true });
    console.log(`  ${C.G}✓${C.N} artifacts/ (运行时产出)`);

    // 复制 install.sh 和 manifest.json
    fs.copyFileSync(
      path.join(skillDir, "install.sh"),
      path.join(projectPipelineDir, "install.sh")
    );
    fs.copyFileSync(
      path.join(skillDir, "manifest.json"),
      path.join(projectPipelineDir, "manifest.json")
    );
    console.log(`  ${C.G}✓${C.N} install.sh`);
    console.log(`  ${C.G}✓${C.N} manifest.json`);

    console.log("");
    console.log(`${C.B}══════════════════════════════════════════════════════${C.N}`);
    console.log(`${C.G}  ✅ 项目初始化完成！${C.N}`);
    console.log("");
    console.log(`  已创建: ${projectPipelineDir}`);
    console.log("");
    console.log(`  运行校验：`);
    console.log(`    ${C.Y}sh dev-flow/install.sh --check-only${C.N}`);
    console.log("");
    console.log(`  触发方式：直接描述前端开发需求即可，例如：`);
    console.log(`    ${C.Y}"开发一个词条审核页面，设计稿：https://mastergo.com/xxx"${C.N}`);
    console.log("");
  }
}

main();