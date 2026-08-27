#!/usr/bin/env node

/**
 * 项目扫描脚本 (scan-project)
 *
 * 确定性扫描项目结构，输出 JSON。AI 读取 JSON 后补充语义字段（用途、可复用性判断）。
 *
 * 用法：
 *   node scripts/scan-project.js [project-root]
 *   node scripts/scan-project.js /path/to/project
 *   node scripts/scan-project.js  (默认使用当前工作目录)
 *   node scripts/scan-project.js . --diff .dev-flow/project/COMPONENT-INDEX.md
 *
 * 输出：JSON 到 stdout
 *   - 正常模式：完整扫描结果
 *   - --diff 模式：完整扫描结果 + diff 块（added/removed/unchanged/changed）
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

// ============================================================
// 工具函数
// ============================================================

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function safeGlob(pattern, cwd) {
  try {
    const result = execSync(
      `find "${cwd}" -path "${pattern}" -maxdepth 7 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    return result ? result.split("\n") : [];
  } catch {
    return [];
  }
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

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
    hash.update(path.relative(projectRoot, filePath).replace(/\\/g, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

/**
 * 汇总本轮实际读取的组件、工具、Hook 和 Skill 源文件。
 *
 * @param {string} projectRoot 项目根目录。
 * @param {{ components: Array<{ absPath: string }>, utilsAndHooks: Array<{ relPath: string }>, skills: Array<{ path: string }> }} scanResult 扫描结果。
 * @returns {string[]} 源文件绝对路径列表。
 */
function collectScannedSourceFiles(projectRoot, scanResult) {
  const componentFiles = scanResult.components
    .map((component) => findIndexFile(component.absPath))
    .filter(Boolean);
  const utilityFiles = scanResult.utilsAndHooks.map((item) =>
    path.resolve(projectRoot, item.relPath),
  );
  const skillFiles = scanResult.skills.map((item) =>
    path.resolve(projectRoot, item.path),
  );

  return [...componentFiles, ...utilityFiles, ...skillFiles].filter(
    (filePath) => exists(filePath) && fs.statSync(filePath).isFile(),
  );
}

// ============================================================
// 第 1 步：检测项目结构
// ============================================================

function detectProjectStructure(root) {
  const pkg = readJSON(path.join(root, "package.json"));

  const result = {
    name: pkg?.name || path.basename(root),
    packageManager: detectPackageManager(root),
    hasPackageJson: pkg !== null,
    framework: null,
    language: null,
    buildTool: null,
    stateManagement: null,
    cssSolution: null,
    componentLibrary: null,
  };

  // 检测框架
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depKeys = Object.keys(deps);

    if (depKeys.includes("next")) {
      result.framework = "Next.js";
      result.buildTool = "next";
    } else if (depKeys.includes("react") || depKeys.includes("react-dom")) {
      result.framework = "React";
    } else if (depKeys.includes("vue")) {
      if (depKeys.includes("nuxt")) {
        result.framework = "Nuxt";
        result.buildTool = "nuxt";
      } else {
        result.framework = "Vue";
      }
    } else if (depKeys.includes("svelte")) {
      result.framework = "Svelte";
    } else if (depKeys.includes("angular")) {
      result.framework = "Angular";
    }

    // 检测构建工具
    if (depKeys.includes("vite")) result.buildTool = result.buildTool || "Vite";
    if (depKeys.includes("webpack")) result.buildTool = result.buildTool || "Webpack";
    if (depKeys.includes("turbo")) result.buildTool = result.buildTool || "Turbopack";

    // 检测语言
    if (exists(path.join(root, "tsconfig.json"))) result.language = "TypeScript";
    else if (depKeys.includes("typescript")) result.language = "TypeScript";
    else result.language = "JavaScript";

    // 检测状态管理
    if (depKeys.includes("zustand")) result.stateManagement = "Zustand";
    else if (depKeys.includes("redux") || depKeys.includes("@reduxjs/toolkit")) result.stateManagement = "Redux Toolkit";
    else if (depKeys.includes("pinia")) result.stateManagement = "Pinia";
    else if (depKeys.includes("vuex")) result.stateManagement = "Vuex";
    else if (depKeys.includes("jotai")) result.stateManagement = "Jotai";
    else if (depKeys.includes("valtio")) result.stateManagement = "Valtio";
    else if (depKeys.includes("mobx")) result.stateManagement = "MobX";
    else if (depKeys.includes("recoil")) result.stateManagement = "Recoil";

    // 检测 CSS 方案
    if (depKeys.includes("tailwindcss")) result.cssSolution = "Tailwind CSS";
    else if (depKeys.includes("styled-components")) result.cssSolution = "styled-components";
    else if (depKeys.includes("@emotion/react")) result.cssSolution = "Emotion";
    else if (depKeys.includes("sass") || depKeys.includes("node-sass")) result.cssSolution = "Sass/SCSS";
    else if (depKeys.includes("less")) result.cssSolution = "Less";
    else if (exists(path.join(root, "postcss.config.js"))) result.cssSolution = "PostCSS";
    else result.cssSolution = "CSS Modules（默认）";

    // 检测第三方 UI 组件库
    result.componentLibrary = detectComponentLibrary(deps);
  }

  return result;
}

function detectPackageManager(root) {
  if (exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(path.join(root, "yarn.lock"))) return "yarn";
  if (exists(path.join(root, "package-lock.json"))) return "npm";
  if (exists(path.join(root, "bun.lockb"))) return "bun";
  return "未知";
}

function detectComponentLibrary(deps) {
  const knownLibraries = {
    antd: "Ant Design",
    "@ant-design/pro-components": "Ant Design Pro",
    "element-plus": "Element Plus",
    "element-ui": "Element UI",
    "@arco-design/web-react": "Arco Design",
    "@arco-design/web-vue": "Arco Design",
    "@mui/material": "Material UI (MUI)",
    "@mui/icons-material": "Material UI Icons",
    "@nextui-org/react": "NextUI",
    "naive-ui": "Naive UI",
    "tdesign-react": "TDesign",
    "tdesign-vue-next": "TDesign",
    "tdesign-vue": "TDesign",
    vuetify: "Vuetify",
    "prime-react": "PrimeReact",
    "prime-vue": "PrimeVue",
    "shadcn-ui": "shadcn/ui",
    "@radix-ui/react-dialog": "Radix UI",
    "@chakra-ui/react": "Chakra UI",
    "ant-design-vue": "Ant Design Vue",
    "semi-ui": "Semi Design",
    "@douyinfe/semi-ui": "Semi Design",
  };

  const matched = [];
  for (const [pkg, label] of Object.entries(knownLibraries)) {
    if (deps[pkg]) {
      matched.push({ name: label, package: pkg, version: deps[pkg] });
    }
  }
  return matched.length > 0 ? matched : null;
}

// ============================================================
// 第 2 步：检测 Monorepo
// ============================================================

function detectMonorepo(root) {
  const pkg = readJSON(path.join(root, "package.json"));
  const result = {
    isMonorepo: false,
    tool: null,
    packages: [],
  };

  // npm workspaces
  if (pkg?.workspaces) {
    result.isMonorepo = true;
    result.tool = "npm workspaces";
    result.packages = resolveWorkspaces(root, pkg.workspaces);
  }

  // pnpm workspace
  if (exists(path.join(root, "pnpm-workspace.yaml"))) {
    result.isMonorepo = true;
    result.tool = result.tool || "pnpm workspace";
    try {
      const yaml = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8");
      const match = yaml.match(/packages:\s*\n([\s\S]+?)(?:\n\w|$)/);
      if (match) {
        const patterns = match[1]
          .split("\n")
          .map((l) => l.trim().replace(/^-\s*/, "").replace(/["']/g, ""))
          .filter(Boolean);
        result.packages = resolveWorkspaces(root, patterns);
      }
    } catch { /* ignore */ }
  }

  // Lerna
  if (exists(path.join(root, "lerna.json"))) {
    result.isMonorepo = true;
    result.tool = result.tool || "Lerna";
    const lerna = readJSON(path.join(root, "lerna.json"));
    if (lerna?.packages) {
      result.packages = resolveWorkspaces(root, lerna.packages);
    }
  }

  // Nx
  if (exists(path.join(root, "nx.json"))) {
    result.isMonorepo = true;
    result.tool = result.tool || "Nx";
  }

  // Turborepo
  if (exists(path.join(root, "turbo.json"))) {
    result.isMonorepo = true;
    result.tool = result.tool || "Turborepo";
  }

  return result;
}

function resolveWorkspaces(root, patterns) {
  const packages = [];
  const arr = Array.isArray(patterns) ? patterns : [patterns];

  for (const pattern of arr) {
    const globPattern = pattern.replace(/\*/g, "*");
    const dirs = safeGlob(globPattern, root);
    for (const dir of dirs) {
      const pkgPath = path.join(dir, "package.json");
      if (exists(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          packages.push({
            name: pkg.name || path.basename(dir),
            path: path.relative(root, dir),
            absPath: dir,
            version: pkg.version,
            isPrivate: pkg.private === true,
          });
        } catch { /* ignore */ }
      }
    }
  }

  return packages;
}

// ============================================================
// 第 3 步：扫描组件目录
// ============================================================

function scanComponents(root, monorepo) {
  const components = [];

  // 3.1 项目内组件目录
  const projectComponentDirs = [
    "src/components",
    "components",
    "src/shared/components",
    "src/common/components",
    "app/components",
    "src/views/components",
    "src/widgets",
  ];

  for (const dir of projectComponentDirs) {
    const absDir = path.join(root, dir);
    if (!exists(absDir)) continue;

    const found = scanComponentDir(absDir, root, "项目内");
    components.push(...found);
  }

  // 3.2 Monorepo 子包组件目录
  for (const pkg of monorepo.packages) {
    const subDirs = [
      path.join(pkg.absPath, "src/components"),
      path.join(pkg.absPath, "components"),
      path.join(pkg.absPath, "lib"),
      path.join(pkg.absPath, "src"),
    ];

    for (const subDir of subDirs) {
      if (!exists(subDir)) continue;
      const found = scanComponentDir(subDir, root, `Monorepo包:${pkg.name}`);
      components.push(...found);
    }
  }

  // 3.3 去重（按路径）
  const seen = new Set();
  return components.filter((c) => {
    const key = c.absPath;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanComponentDir(dirPath, root, source) {
  const results = [];
  const entries = safeReadDir(dirPath);

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // 检查是否是组件目录（包含 index 文件）
      const hasIndex =
        exists(path.join(fullPath, "index.tsx")) ||
        exists(path.join(fullPath, "index.ts")) ||
        exists(path.join(fullPath, "index.jsx")) ||
        exists(path.join(fullPath, "index.js")) ||
        exists(path.join(fullPath, "index.vue"));

      if (hasIndex) {
        results.push(extractComponentInfo(fullPath, entry.name, root, source));
      } else {
        // 递归扫描子目录
        const subResults = scanComponentDir(fullPath, root, source);
        results.push(...subResults);
      }
    } else if (entry.isFile()) {
      // 独立的组件文件
      const ext = path.extname(entry.name);
      if ([".tsx", ".jsx", ".vue", ".ts", ".js"].includes(ext)) {
        // 排除 index 文件（已在目录级别处理）、测试文件、样式文件
        const baseName = path.basename(entry.name, ext);
        if (
          !["index", "styles", "style", "types", "constants", "utils"].includes(baseName) &&
          !entry.name.includes(".test.") &&
          !entry.name.includes(".spec.") &&
          !entry.name.includes(".stories.") &&
          !entry.name.endsWith(".d.ts")
        ) {
          results.push(extractComponentInfo(fullPath, baseName, root, source));
        }
      }
    }
  }

  return results;
}

function extractComponentInfo(filePath, name, root, source) {
  const relPath = path.relative(root, filePath);
  const importPath = inferImportPath(filePath, name, root, source);

  // 尝试提取 Props 类型
  const props = extractPropsInfo(filePath);

  return {
    name,
    importPath,
    relPath,
    absPath: filePath,
    source,
    props: props.length > 0 ? props : null,
    // 以下字段由 AI 补充
    _aiFields: {
      description: null, // 用途一句话
      reusability: null, // ✅ 可直接复用 / ⚠️ 需适配 / ❌ 不可复用
      skillRef: null, // 关联 Skill 路径
    },
  };
}

function inferImportPath(filePath, name, root, source) {
  // Monorepo 包
  if (source.startsWith("Monorepo包:")) {
    const pkgName = source.replace("Monorepo包:", "");
    const indexFile = findIndexFile(filePath);
    if (indexFile) {
      const subPath = path
        .relative(filePath, indexFile)
        .replace(/\\/g, "/")
        .replace(/\.(tsx?|jsx?|vue)$/, "");
      if (subPath === "index" || subPath === ".") {
        return `${pkgName}/${name}`;
      }
      return `${pkgName}/${name}/${subPath}`;
    }
    return `${pkgName}/${name}`;
  }

  // 项目内
  const relPath = path.relative(root, path.dirname(filePath));
  const normalized = relPath.replace(/\\/g, "/");
  return `@/${normalized}/${name}`;
}

function findIndexFile(dirPath) {
  if (fs.statSync(dirPath).isFile()) {
    return dirPath;
  }
  const candidates = ["index.tsx", "index.ts", "index.jsx", "index.js", "index.vue"];
  for (const c of candidates) {
    const fullPath = path.join(dirPath, c);
    if (exists(fullPath)) return fullPath;
  }
  return null;
}

function extractPropsInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const targetPath = stat.isDirectory() ? findIndexFile(filePath) : filePath;
    if (!targetPath) return [];

    const content = fs.readFileSync(targetPath, "utf-8");

    // 匹配 interface XxxProps / type XxxProps
    const propsRegex = /(?:interface|type)\s+(\w*Props)\s*(?:extends\s+[^{]+)?\s*\{([^}]+)\}/gs;
    const props = [];
    let match;

    while ((match = propsRegex.exec(content)) !== null) {
      const propsName = match[1];
      const body = match[2];

      // 提取每个字段
      const fieldRegex = /(\w+)(\?)?\s*:\s*([^;]+)/g;
      const fields = [];
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        fields.push({
          name: fieldMatch[1],
          optional: !!fieldMatch[2],
          type: fieldMatch[3].trim(),
        });
      }

      if (fields.length > 0) {
        props.push({ name: propsName, fields });
      }
    }

    return props;
  } catch {
    return [];
  }
}

// ============================================================
// 第 4 步：扫描内部 npm 包和第三方库
// ============================================================

function scanNpmPackages(root) {
  const pkg = readJSON(path.join(root, "package.json"));
  if (!pkg) return { internal: [], thirdParty: [] };

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const internal = [];
  const thirdParty = [];

  // 已知的公共 scope（非内部包）
  const publicScopes = new Set([
    "@types", "@ant-design", "@antv", "@babel", "@emotion", "@eslint",
    "@mui", "@next", "@radix-ui", "@reduxjs", "@storybook", "@tanstack",
    "@testing-library", "@typescript-eslint", "@vitejs", "@vue",
    "@arco-design", "@chakra-ui", "@nextui-org", "@douyinfe",
    "@floating-ui", "@headlessui", "@heroicons", "@iconify",
    "@nestjs", "@pmmmwh", "@popperjs", "@remix-run", "@rollup",
    "@sentry", "@swc", "@tailwindcss", "@trpc", "@vercel",
  ]);

  for (const [name, version] of Object.entries(allDeps)) {
    // 判断是否为内部包
    const isScoped = name.startsWith("@");
    const scope = isScoped ? name.split("/")[0] : null;
    const isWorkspace = version === "workspace:*" || version.startsWith("workspace:");
    const isFile = version.startsWith("file:");
    const isPublicScope = scope && publicScopes.has(scope);
    const isPrivate = isWorkspace || isFile || (isScoped && !isPublicScope);

    if (isPrivate) {
      internal.push({ name, version, reason: isWorkspace ? "workspace协议" : isFile ? "file协议" : "内部scope" });
    }
  }

  // 第三方 UI 库
  const uiLib = detectComponentLibrary(allDeps);
  if (uiLib) {
    thirdParty.push(...uiLib);
  }

  return { internal, thirdParty };
}

// ============================================================
// 第 5 步：扫描工具函数和 Hooks
// ============================================================

function scanUtilsAndHooks(root) {
  const utils = [];
  const scanDirs = ["src/hooks", "src/utils", "src/helpers", "src/shared", "src/lib", "src/common"];

  for (const dir of scanDirs) {
    const absDir = path.join(root, dir);
    if (!exists(absDir)) continue;

    const files = safeReadDir(absDir);
    for (const file of files) {
      if (file.name.startsWith(".") || file.name === "index.ts" || file.name === "index.js") continue;

      const fullPath = path.join(absDir, file.name);
      const ext = path.extname(file.name);

      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const name = path.basename(file.name, ext);
        const relPath = path.relative(root, fullPath);
        const importPath = `@/${relPath.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "")}`;

        utils.push({
          name,
          type: dir.includes("hook") ? "Hook" : "工具函数",
          importPath,
          relPath,
          _aiFields: {
            description: null,
          },
        });
      }
    }
  }

  return utils;
}

// ============================================================
// 第 6 步：扫描项目 Skill
// ============================================================

function scanSkills(root) {
  const skills = [];
  const skillDirs = ["skills", ".codebuddy/skills", ".dev-flow/skills"];

  for (const dir of skillDirs) {
    const absDir = path.join(root, dir);
    if (!exists(absDir)) continue;

    const entries = safeReadDir(absDir);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const skillMdPath = path.join(absDir, entry.name, "SKILL.md");
      if (exists(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          // 提取 frontmatter 中的 description
          const descMatch = content.match(/description:\s*(.+)/);
          const nameMatch = content.match(/name:\s*(.+)/);

          skills.push({
            name: nameMatch ? nameMatch[1].trim() : entry.name,
            path: path.relative(root, skillMdPath),
            description: descMatch ? descMatch[1].trim() : null,
          });
        } catch { /* ignore */ }
      }
    }
  }

  return skills;
}

// ============================================================
// 第 7 步：增量 diff（对比已有 COMPONENT-INDEX.md）
// ============================================================

/**
 * 从 COMPONENT-INDEX.md 中提取已有组件的导入路径集合。
 * 解析 Markdown 表格（1.1 项目内组件、1.2 Monorepo 组件），
 * 第二列「导入路径」作为组件的唯一标识。
 */
function extractIndexedPaths(indexMdPath) {
  try {
    const content = fs.readFileSync(indexMdPath, "utf-8");
    const paths = new Set();

    // 匹配表格行：| 组件名 | 导入路径 | ...
    // 只提取含反引号包裹的导入路径（第二列）
    const tableRowRegex = /^\|.*\|.*\|.*\|.*\|.*\|.*\|\s*$/gm;
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过表头、分隔行、非表格行
      if (!trimmed.startsWith("|")) continue;
      if (/^\|[\s\-|]+\|$/.test(trimmed)) continue; // 分隔行
      if (/组件名.*导入路径/.test(trimmed)) continue; // 表头

      const cells = trimmed.split("|").map((c) => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);

      // 第二列是导入路径（含反引号）
      if (cells.length >= 2) {
        const importPath = cells[1].replace(/`/g, "").trim();
        if (importPath && !importPath.includes("---")) {
          paths.add(importPath);
        }
      }
    }

    return paths;
  } catch {
    return new Set();
  }
}

/**
 * 对比当前扫描结果与已有索引，输出 diff。
 */
function computeDiff(currentComponents, indexedPaths) {
  const added = [];
  const removed = [];
  const unchanged = [];
  const changed = [];

  // 当前扫描到的组件
  const currentPaths = new Set();
  const currentMap = new Map();

  for (const comp of currentComponents) {
    const p = comp.importPath;
    currentPaths.add(p);
    currentMap.set(p, comp);
  }

  // added：当前有、索引没有
  for (const p of currentPaths) {
    if (!indexedPaths.has(p)) {
      added.push(currentMap.get(p));
    }
  }

  // removed：索引有、当前没有
  for (const p of indexedPaths) {
    if (!currentPaths.has(p)) {
      removed.push({ importPath: p });
    }
  }

  // unchanged：两边都有
  for (const p of currentPaths) {
    if (indexedPaths.has(p)) {
      unchanged.push(currentMap.get(p));
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0;

  return {
    hasChanges,
    summary: {
      total: currentComponents.length,
      added: added.length,
      removed: removed.length,
      unchanged: unchanged.length,
      changed: changed.length,
    },
    added,
    removed,
    unchanged,
    changed,
  };
}

// ============================================================
// 主入口
// ============================================================

function parseArgs(argv) {
  const args = { root: ".", diffIndexPath: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--diff" && argv[i + 1]) {
      args.diffIndexPath = argv[i + 1];
      i++; // 跳过下一个参数
    } else if (!arg.startsWith("--")) {
      args.root = arg;
    }
  }

  return args;
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const root = path.resolve(args.root);
  const pkg = readJSON(path.join(root, "package.json"));

  const result = {
    scanTime: new Date().toISOString(),
    projectRoot: root,
    structure: detectProjectStructure(root),
    monorepo: detectMonorepo(root),
    components: [],
    utilsAndHooks: [],
    npmPackages: { internal: [], thirdParty: [] },
    skills: [],
    scanLog: [],
  };

  try {
    // 扫描组件
    result.components = scanComponents(root, result.monorepo);
    result.scanLog.push({
      step: "组件扫描",
      status: "ok",
      count: result.components.length,
      detail: `发现 ${result.components.length} 个组件`,
    });
  } catch (err) {
    result.scanLog.push({ step: "组件扫描", status: "error", detail: err.message });
  }

  try {
    // 扫描 npm 包
    result.npmPackages = scanNpmPackages(root);
    result.scanLog.push({
      step: "npm包解析",
      status: "ok",
      detail: `内部包: ${result.npmPackages.internal.length}, 第三方UI库: ${result.npmPackages.thirdParty.length}`,
    });
  } catch (err) {
    result.scanLog.push({ step: "npm包解析", status: "error", detail: err.message });
  }

  try {
    // 扫描工具函数和 Hooks
    result.utilsAndHooks = scanUtilsAndHooks(root);
    result.scanLog.push({
      step: "工具/Hooks扫描",
      status: "ok",
      count: result.utilsAndHooks.length,
      detail: `发现 ${result.utilsAndHooks.length} 个工具函数/Hooks`,
    });
  } catch (err) {
    result.scanLog.push({ step: "工具/Hooks扫描", status: "error", detail: err.message });
  }

  try {
    // 扫描 Skill
    result.skills = scanSkills(root);
    result.scanLog.push({
      step: "Skill扫描",
      status: "ok",
      count: result.skills.length,
      detail: `发现 ${result.skills.length} 个 Skill`,
    });
  } catch (err) {
    result.scanLog.push({ step: "Skill扫描", status: "error", detail: err.message });
  }

  result.sourceFingerprint = createSourceFingerprint(
    root,
    collectScannedSourceFiles(root, result),
  );

  // 增量 diff 模式
  if (args.diffIndexPath) {
    const indexAbsPath = path.isAbsolute(args.diffIndexPath)
      ? args.diffIndexPath
      : path.resolve(root, args.diffIndexPath);

    const indexedPaths = extractIndexedPaths(indexAbsPath);
    result.diff = computeDiff(result.components, indexedPaths);
    result.diff.indexPath = indexAbsPath;
    result.diff.indexExisted = exists(indexAbsPath);

    result.scanLog.push({
      step: "增量diff",
      status: "ok",
      detail: result.diff.indexExisted
        ? `对比 ${result.diff.summary.added} 新增 / ${result.diff.summary.removed} 移除 / ${result.diff.summary.unchanged} 未变`
        : "索引文件不存在，按全量扫描处理",
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
