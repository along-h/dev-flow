const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

/** 初始化 CLI 的绝对路径。 */
const INIT_CLI_PATH = path.resolve(__dirname, '../bin/init.js')

/** Dev Flow 应写入目标项目的忽略规则。 */
const DEV_FLOW_IGNORE_RULE = '.dev-flow/'

/**
 * 创建独立的临时目标项目。
 *
 * @returns {string} 临时项目绝对路径。
 */
function createTargetProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-flow-init-'))
}

/**
 * 在目标项目执行初始化命令。
 *
 * @param {string} targetDir 目标项目绝对路径。
 * @param {{ upgrade?: boolean }} [options] 是否执行安全升级。
 * @returns {import("node:child_process").SpawnSyncReturns<string>} 命令执行结果。
 */
function runInit(targetDir, options = {}) {
  const commandArgs = [INIT_CLI_PATH, 'init', '--dir', targetDir]
  if (options.upgrade) commandArgs.push('--upgrade')
  return spawnSync(
    process.execPath,
    commandArgs,
    {
      encoding: 'utf8',
    },
  )
}

test('初始化输出 v2.0.0 版本', () => {
  const targetDir = createTargetProject()

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /v2\.0\.0/)
})

test('初始化会创建 .dev-flow 运行目录而不是 dev-flow 目录', () => {
  const targetDir = createTargetProject()

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(
    fs.existsSync(
      path.join(targetDir, '.dev-flow', 'scripts', 'scan-project.js'),
    ),
    true,
  )
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'project')), true)
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'runs')), true)
  assert.equal(fs.existsSync(path.join(targetDir, 'dev-flow')), false)
})

test('初始化会创建项目资产和需求运行目录', () => {
  const targetDir = createTargetProject()

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'project')), true)
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'runs')), true)
  assert.equal(
    fs.existsSync(
      path.join(targetDir, '.dev-flow', 'templates', 'handoff-template.md'),
    ),
    true,
  )
  assert.equal(
    fs.existsSync(
      path.join(
        targetDir,
        '.dev-flow',
        'templates',
        'component-slice-template.md',
      ),
    ),
    true,
  )
})

test('初始化不会覆盖既有旧版需求产物', () => {
  const targetDir = createTargetProject()
  const legacyArtifactsDir = path.join(targetDir, '.dev-flow', 'artifacts')
  fs.mkdirSync(legacyArtifactsDir, { recursive: true })
  fs.writeFileSync(
    path.join(legacyArtifactsDir, 'PRD.md'),
    'legacy-prd',
    'utf8',
  )

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(
    fs.readFileSync(path.join(legacyArtifactsDir, 'PRD.md'), 'utf8'),
    'legacy-prd',
  )
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'project')), true)
  assert.equal(fs.existsSync(path.join(targetDir, '.dev-flow', 'runs')), true)
})

test('初始化会创建 .gitignore 并忽略本地 .dev-flow 目录', () => {
  const targetDir = createTargetProject()

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(
    fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8'),
    `${DEV_FLOW_IGNORE_RULE}\n`,
  )
})

test('初始化会保留既有 .gitignore 内容并补充忽略规则', () => {
  const targetDir = createTargetProject()
  fs.writeFileSync(path.join(targetDir, '.gitignore'), 'node_modules/', 'utf8')

  const result = runInit(targetDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(
    fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8'),
    `node_modules/\n${DEV_FLOW_IGNORE_RULE}\n`,
  )
})

test('重复初始化不会重复添加 .dev-flow 忽略规则', () => {
  const targetDir = createTargetProject()

  const firstResult = runInit(targetDir)
  const secondResult = runInit(targetDir)

  assert.equal(firstResult.status, 0, firstResult.stderr || firstResult.stdout)
  assert.equal(
    secondResult.status,
    0,
    secondResult.stderr || secondResult.stdout,
  )
  const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8')
  assert.equal(gitignore.match(/^\.dev-flow\/$/gm)?.length, 1)
})

test('默认重复初始化不会覆盖既有 runtime 文件', () => {
  const targetDir = createTargetProject()
  const firstResult = runInit(targetDir)
  const validatorPath = path.join(
    targetDir,
    '.dev-flow',
    'scripts',
    'validate-artifact.js',
  )
  fs.writeFileSync(validatorPath, 'legacy-validator', 'utf8')

  const secondResult = runInit(targetDir)

  assert.equal(firstResult.status, 0, firstResult.stderr || firstResult.stdout)
  assert.equal(secondResult.status, 0, secondResult.stderr || secondResult.stdout)
  assert.equal(fs.readFileSync(validatorPath, 'utf8'), 'legacy-validator')
})

test('安全升级只刷新受管 runtime 并保留项目与运行产物', () => {
  const targetDir = createTargetProject()
  const firstResult = runInit(targetDir)
  assert.equal(firstResult.status, 0, firstResult.stderr || firstResult.stdout)

  const projectAssetPath = path.join(targetDir, '.dev-flow', 'project', 'COMPONENT-INDEX.md')
  const runArtifactPath = path.join(targetDir, '.dev-flow', 'runs', 'REQ-001', 'PRD.md')
  const legacyArtifactPath = path.join(targetDir, '.dev-flow', 'artifacts', 'PRD.md')
  const validatorPath = path.join(targetDir, '.dev-flow', 'scripts', 'validate-artifact.js')
  const componentsTemplatePath = path.join(
    targetDir,
    '.dev-flow',
    'templates',
    'components-template.md',
  )
  const manifestPath = path.join(targetDir, '.dev-flow', 'manifest.json')
  const installPath = path.join(targetDir, '.dev-flow', 'install.sh')

  for (const artifactPath of [projectAssetPath, runArtifactPath, legacyArtifactPath]) {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
    fs.writeFileSync(artifactPath, `business:${path.basename(artifactPath)}`, 'utf8')
  }
  for (const runtimePath of [validatorPath, componentsTemplatePath, manifestPath, installPath]) {
    fs.writeFileSync(runtimePath, `legacy:${path.basename(runtimePath)}`, 'utf8')
  }

  const upgradeResult = runInit(targetDir, { upgrade: true })

  assert.equal(upgradeResult.status, 0, upgradeResult.stderr || upgradeResult.stdout)
  assert.match(upgradeResult.stdout, /安全升级|受管 runtime/)
  assert.equal(
    fs.readFileSync(validatorPath, 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '../scripts/validate-artifact.js'), 'utf8'),
  )
  assert.equal(
    fs.readFileSync(componentsTemplatePath, 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '../templates/components-template.md'), 'utf8'),
  )
  assert.equal(
    fs.readFileSync(manifestPath, 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'),
  )
  assert.equal(
    fs.readFileSync(installPath, 'utf8'),
    fs.readFileSync(path.resolve(__dirname, '../install.sh'), 'utf8'),
  )
  for (const artifactPath of [projectAssetPath, runArtifactPath, legacyArtifactPath]) {
    assert.equal(
      fs.readFileSync(artifactPath, 'utf8'),
      `business:${path.basename(artifactPath)}`,
    )
  }

  const validatorResult = spawnSync(process.execPath, [validatorPath, '--list'], {
    cwd: targetDir,
    encoding: 'utf8',
  })
  assert.equal(validatorResult.status, 0, validatorResult.stderr || validatorResult.stdout)
  assert.match(validatorResult.stdout, /components-readiness/)
})
