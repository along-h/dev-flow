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
 *   npx dev-flow init --upgrade (只覆盖 Dev Flow 受管 runtime)
 */

const fs = require('fs')
const path = require('path')

/** 项目内 Dev Flow 的本地运行目录名称。 */
const PROJECT_PIPELINE_DIR_NAME = '.dev-flow'

/** 跨需求复用的项目资产目录名称。 */
const PROJECT_ASSETS_DIR_NAME = 'project'

/** 每次需求运行的隔离目录名称。 */
const PROJECT_RUNS_DIR_NAME = 'runs'

/** 旧版运行产物目录名称，只做兼容检测。 */
const LEGACY_ARTIFACTS_DIR_NAME = 'artifacts'

/** 项目需要持久化到 .gitignore 的忽略规则。 */
const PROJECT_PIPELINE_IGNORE_RULE = '.dev-flow/'

// ─── 颜色 ────────────────────────────────────────────────
const C = {
  R: '\x1b[0;31m',
  G: '\x1b[0;32m',
  Y: '\x1b[1;33m',
  B: '\x1b[0;34m',
  N: '\x1b[0m',
}

// ─── 参数解析 ────────────────────────────────────────────
/**
 * 解析初始化 CLI 参数。
 *
 * @param {string[]} argv 命令行参数。
 * @returns {{ targetDir: string, checkOnly: boolean, upgrade: boolean }} 初始化选项。
 */
function parseArgs(argv) {
  const args = { targetDir: '.', checkOnly: false, upgrade: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      args.targetDir = argv[++i]
    } else if (argv[i] === '--check') {
      args.checkOnly = true
    } else if (argv[i] === '--upgrade') {
      args.upgrade = true
    }
  }
  return args
}

// ─── 工具函数 ────────────────────────────────────────────
/**
 * 递归复制 Dev Flow 受管目录；默认只补缺失文件，升级时覆盖同名受管文件。
 *
 * @param {string} src 受管源目录。
 * @param {string} dest 项目内目标目录。
 * @param {{ overwrite?: boolean }} [options] 是否覆盖同名受管文件。
 * @returns {string[]} 本轮复制或覆盖的相对文件名。
 */
function copyDir(src, dest, options = {}) {
  if (!fs.existsSync(src)) return []
  const copied = []
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copied.push(...copyDir(srcPath, destPath, options))
    } else if (options.overwrite || !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
      copied.push(path.relative(dest, destPath))
    }
  }
  return copied
}

/**
 * 判断当前 Node.js 主版本是否满足运行要求。
 *
 * @returns {boolean} 是否为 Node.js 18 或更高版本。
 */
function checkNodeVersion() {
  const v = process.versions.node.split('.').map(Number)
  return v[0] >= 18
}

/**
 * 确保目标项目忽略本地 Dev Flow 运行目录。
 *
 * @param {string} targetDir 目标项目绝对路径。
 * @returns {"created" | "updated" | "unchanged"} 本次更新结果。
 */
function ensureGitignore(targetDir) {
  const gitignorePath = path.join(targetDir, '.gitignore')
  const currentContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : ''
  const currentRules = currentContent.split(/\r?\n/)

  if (currentRules.includes(PROJECT_PIPELINE_IGNORE_RULE)) {
    return 'unchanged'
  }

  const separator =
    currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n' : ''
  fs.writeFileSync(
    gitignorePath,
    `${currentContent}${separator}${PROJECT_PIPELINE_IGNORE_RULE}\n`,
    'utf8',
  )

  return currentContent.length === 0 ? 'created' : 'updated'
}

// ─── 主逻辑 ──────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2))
  const targetDir = path.resolve(args.targetDir)

  // skill 目录 = 本脚本所在目录的父目录（bin/ → dev-flow/）
  const skillDir = path.resolve(__dirname, '..')

  console.log('')
  console.log(
    `${C.B}╔══════════════════════════════════════════════════════╗${C.N}`,
  )
  console.log(
    `${C.B}║  Dev Flow · 专家开发团队  v2.0.0                    ║${C.N}`,
  )
  console.log(
    `${C.B}║  Dev Flow — Expert Development Team                 ║${C.N}`,
  )
  console.log(
    `${C.B}╚══════════════════════════════════════════════════════╝${C.N}`,
  )
  console.log('')

  // ── 前置检查 ──
  if (!checkNodeVersion()) {
    console.log(`${C.R}✗ Node.js 版本过低，需要 >=18${C.N}`)
    process.exit(1)
  }
  console.log(`${C.G}✓${C.N} Node.js ${process.versions.node}`)

  // 检查 skill 目录完整性
  const required = [
    'SKILL.md',
    'manifest.json',
    'scripts/scan-project.js',
    'scripts/validate-artifact.js',
  ]
  let missing = false
  for (const f of required) {
    if (!fs.existsSync(path.join(skillDir, f))) {
      console.log(`${C.R}✗ 缺失: ${f}${C.N}`)
      missing = true
    }
  }
  if (missing) {
    console.log(
      `${C.R}Skill 安装不完整，请重新安装: npx skills add <repo>${C.N}`,
    )
    process.exit(1)
  }
  console.log(`${C.G}✓${C.N} Skill 文件完整`)

  // ── 复制到目标项目 ──
  if (args.checkOnly) {
    console.log('')
    console.log(
      `${C.B}══════════════════════════════════════════════════════${C.N}`,
    )
    console.log(`${C.G}  ✅ 全部检查通过！${C.N}`)
    console.log('')
    console.log(`  运行以下命令完成项目初始化：`)
    console.log(`    ${C.Y}npx dev-flow init --dir /path/to/project${C.N}`)
    console.log('')
    process.exit(0)
  }

  const projectPipelineDir = path.join(targetDir, PROJECT_PIPELINE_DIR_NAME)
  const legacyPipelineDir = path.join(targetDir, 'dev-flow')
  const isUpgrade = args.upgrade

  if (fs.existsSync(legacyPipelineDir)) {
    console.log(
      `${C.Y}⚠  检测到旧 dev-flow/ 目录；为保护已有产物，本次不会自动迁移或删除。${C.N}`,
    )
  }

  if (isUpgrade) {
    console.log(
      `${C.Y}⚠  正在执行安全升级：仅覆盖 scripts/、templates/、manifest.json 和 install.sh 受管 runtime；project/、runs/、artifacts/ 保持不变。${C.N}`,
    )
  }

  console.log('')
  console.log(`${C.Y}[1/3] ${isUpgrade ? '升级' : '补齐'}项目脚本...${C.N}`)
  const scriptsCopied = copyDir(
    path.join(skillDir, 'scripts'),
    path.join(projectPipelineDir, 'scripts'),
    { overwrite: isUpgrade },
  )
  for (const f of scriptsCopied) {
    console.log(`  ${C.G}✓${C.N} scripts/${f}`)
  }

  console.log('')
  console.log(`${C.Y}[2/3] ${isUpgrade ? '升级' : '补齐'}项目模板...${C.N}`)
  const templatesCopied = copyDir(
    path.join(skillDir, 'templates'),
    path.join(projectPipelineDir, 'templates'),
    { overwrite: isUpgrade },
  )
  for (const f of templatesCopied) {
    console.log(`  ${C.G}✓${C.N} templates/${f}`)
  }

  console.log('')
  console.log(`${C.Y}[3/3] 补齐项目资产目录...${C.N}`)
  fs.mkdirSync(path.join(projectPipelineDir, PROJECT_ASSETS_DIR_NAME), {
    recursive: true,
  })
  fs.mkdirSync(path.join(projectPipelineDir, PROJECT_RUNS_DIR_NAME), {
    recursive: true,
  })
  console.log(`  ${C.G}✓${C.N} project/ (跨需求项目资产)`)
  console.log(`  ${C.G}✓${C.N} runs/ (需求与工作包产物)`)

  if (fs.existsSync(path.join(projectPipelineDir, LEGACY_ARTIFACTS_DIR_NAME))) {
    console.log(`  ${C.Y}ℹ${C.N} artifacts/ (旧版产物只读保留)`)
  }

  // 默认只补齐缺失安装文件；显式升级只覆盖 Dev Flow 自身受管安装文件。
  if (isUpgrade || !fs.existsSync(path.join(projectPipelineDir, 'install.sh'))) {
    fs.copyFileSync(
      path.join(skillDir, 'install.sh'),
      path.join(projectPipelineDir, 'install.sh'),
    )
  }
  if (isUpgrade || !fs.existsSync(path.join(projectPipelineDir, 'manifest.json'))) {
    fs.copyFileSync(
      path.join(skillDir, 'manifest.json'),
      path.join(projectPipelineDir, 'manifest.json'),
    )
  }
  console.log(`  ${C.G}✓${C.N} install.sh`)
  console.log(`  ${C.G}✓${C.N} manifest.json`)

  console.log('')
  console.log(
    `${C.B}══════════════════════════════════════════════════════${C.N}`,
  )
  console.log(`${C.G}  ✅ 项目初始化完成！${C.N}`)
  console.log('')
  console.log(`  已创建或补齐: ${projectPipelineDir}`)
  console.log('')
  console.log(`  运行校验：`)
  console.log(`    ${C.Y}sh .dev-flow/install.sh --check-only${C.N}`)
  console.log('')

  const gitignoreResult = ensureGitignore(targetDir)
  const gitignoreMessage =
    gitignoreResult === 'unchanged'
      ? '.gitignore 已包含 .dev-flow/'
      : '.gitignore 已添加 .dev-flow/'
  console.log(`  ${C.G}✓${C.N} ${gitignoreMessage}`)
}

main()
