#!/bin/sh
# ============================================================
# Dev Flow · 专家开发团队 — 安装与校验脚本
# 用法: sh install.sh [--check-only]
# ============================================================

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PIPELINE_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
CHECK_ONLY=false

# 参数解析
if [ "$1" = "--check-only" ]; then
    CHECK_ONLY=true
fi

echo ""
echo "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo "${BLUE}║  Dev Flow · 专家开发团队  v1.1.0                    ║${NC}"
echo "${BLUE}║  Dev Flow — Expert Development Team                 ║${NC}"
echo "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ---------- 1. 结构完整性检查 ----------
echo "${YELLOW}[1/5] 检查文件结构...${NC}"

check_file() {
    if [ -f "$PIPELINE_DIR/$1" ]; then
        echo "  ${GREEN}✓${NC} $1"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗ 缺失${NC} $1"
        FAIL=$((FAIL + 1))
    fi
}

check_dir() {
    if [ -d "$PIPELINE_DIR/$1" ]; then
        echo "  ${GREEN}✓${NC} $1/"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗ 缺失${NC} $1/"
        FAIL=$((FAIL + 1))
    fi
}

# ── 运行上下文检测 ──
# SKILL.md 和 agents/ 只在 Skill 安装目录存在（~/.xiaobao/skills/dev-flow/）
# 项目内的 dev-flow/ 只包含 scripts/templates/artifacts/install.sh/manifest.json
# 因此：检测到 SKILL.md 存在 → 完整检查（Skill 目录）；不存在 → 项目检查
IS_SKILL_DIR=false
if [ -f "$PIPELINE_DIR/SKILL.md" ]; then
    IS_SKILL_DIR=true
    echo "  ${BLUE}ℹ${NC} 检测到 SKILL.md → 完整检查（Skill 安装目录）"
else
    echo "  ${BLUE}ℹ${NC} 未检测到 SKILL.md → 项目检查（跳过 SKILL.md/agents）"
fi

# 核心文件
check_file "manifest.json"
check_file "install.sh"
if [ "$IS_SKILL_DIR" = true ]; then
    check_file "SKILL.md"
    check_dir "agents"
fi

# 目录
check_dir "scripts"
check_dir "templates"
check_dir "artifacts"

# Agent 文件（仅 Skill 目录）
if [ "$IS_SKILL_DIR" = true ]; then
    for agent in requirements-analyst architect developer code-reviewer task-decomposer project-scanner; do
        check_file "agents/${agent}.md"
    done
fi

# 脚本文件
check_file "scripts/scan-project.js"
check_file "scripts/validate-artifact.js"

# 模板文件
for tmpl in prd-template component-index-template tdd-template review-report-template task-breakdown-template global-architecture-template; do
    check_file "templates/${tmpl}.md"
done

# ---------- 2. manifest.json 校验 ----------
echo ""
echo "${YELLOW}[2/5] 校验 manifest.json...${NC}"

if command -v node > /dev/null 2>&1; then
    MANIFEST_CHECK=$(node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$PIPELINE_DIR/manifest.json', 'utf-8'));
const errors = [];
if (!m.name) errors.push('缺少 name');
if (!m.version) errors.push('缺少 version');
if (!m.entry) errors.push('缺少 entry');
if (!m.agents || m.agents.length === 0) errors.push('缺少 agents 清单');
if (!m.scripts || m.scripts.length === 0) errors.push('缺少 scripts 清单');
if (errors.length > 0) {
    errors.forEach(e => console.log('  ✗ ' + e));
    console.log('EXIT_ERROR');
} else {
    console.log('  ✓ manifest.json 格式正确');
    console.log('  - 名称: ' + m.displayName);
    console.log('  - 版本: ' + m.version);
    console.log('  - Agent 数: ' + m.agents.length);
    console.log('  - 脚本数: ' + m.scripts.length);
    console.log('  - 模板数: ' + m.templates.length);
}
" 2>&1)
    if echo "$MANIFEST_CHECK" | grep -q "EXIT_ERROR"; then
        echo "$MANIFEST_CHECK" | grep -v "EXIT_ERROR"
        FAIL=$((FAIL + 1))
    else
        echo "$MANIFEST_CHECK"
        PASS=$((PASS + 1))
    fi
else
    echo "  ${YELLOW}⚠ 跳过（需要 Node.js）${NC}"
fi

# ---------- 3. Node.js 版本检查 ----------
echo ""
echo "${YELLOW}[3/5] 检查 Node.js 运行时...${NC}"

if command -v node > /dev/null 2>&1; then
    NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    echo "  Node.js v${NODE_VERSION}"
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo "  ${GREEN}✓${NC} 版本满足要求 (>=18)"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗${NC} 版本过低，需要 >=18"
        FAIL=$((FAIL + 1))
    fi
else
    echo "  ${RED}✗${NC} 未检测到 Node.js"
    FAIL=$((FAIL + 1))
fi

# ---------- 4. 模板校验 ----------
echo ""
echo "${YELLOW}[4/5] 校验所有模板格式...${NC}"

if command -v node > /dev/null 2>&1; then
    VALIDATE_SCRIPT="$PIPELINE_DIR/scripts/validate-artifact.js"

    for entry in \
        "prd:prd-template" \
        "tdd:tdd-template" \
        "component-index:component-index-template" \
        "global-architecture:global-architecture-template" \
        "task-breakdown:task-breakdown-template" \
        "review:review-report-template"
    do
        TYPE="${entry%%:*}"
        TMPL="${entry##*:}"
        FILE="$PIPELINE_DIR/templates/${TMPL}.md"

        RESULT=$(node "$VALIDATE_SCRIPT" "$TYPE" "$FILE" 2>&1 || true)
        PASSED=$(echo "$RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).pass)" 2>/dev/null || echo "error")

        if [ "$PASSED" = "true" ]; then
            echo "  ${GREEN}✓${NC} ${TYPE}"
            PASS=$((PASS + 1))
        else
            echo "  ${RED}✗${NC} ${TYPE}"
            echo "$RESULT" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
(d.errors||[]).forEach(e=>console.log('      - '+e));
" 2>/dev/null
            FAIL=$((FAIL + 1))
        fi
    done
else
    echo "  ${YELLOW}⚠ 跳过（需要 Node.js）${NC}"
fi

# ---------- 5. 扫描脚本自检 ----------
echo ""
echo "${YELLOW}[5/5] 脚本自检...${NC}"

if command -v node > /dev/null 2>&1; then
    # 扫描脚本自检
    SCAN_OUTPUT=$(node "$PIPELINE_DIR/scripts/scan-project.js" "$PIPELINE_DIR" 2>&1 || true)
    SCAN_OK=$(echo "$SCAN_OUTPUT" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
console.log(d.scanTime ? 'true' : 'false');
" 2>/dev/null || echo "false")

    if [ "$SCAN_OK" = "true" ]; then
        echo "  ${GREEN}✓${NC} scan-project.js 正常运行"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗${NC} scan-project.js 异常"
        FAIL=$((FAIL + 1))
    fi

    # 校验脚本自检（故意传空内容，确认能报错）
    mkdir -p "$PIPELINE_DIR/artifacts"
    echo "" > "$PIPELINE_DIR/artifacts/_test_empty.md"
    # 故意传空内容，校验应返回 pass=false，但退出码是 1（set -e 下会中断）
    # 所以用 || true 兜底
    VALIDATE_TEST=$(node "$PIPELINE_DIR/scripts/validate-artifact.js" "prd" "$PIPELINE_DIR/artifacts/_test_empty.md" 2>&1 || true)
    VALIDATE_PASS=$(echo "$VALIDATE_TEST" | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).pass)" 2>/dev/null || echo "error")
    rm -f "$PIPELINE_DIR/artifacts/_test_empty.md"

    if [ "$VALIDATE_PASS" = "false" ]; then
        echo "  ${GREEN}✓${NC} validate-artifact.js 正常运行（空内容正确报错）"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗${NC} validate-artifact.js 异常（空内容应报错，got: ${VALIDATE_PASS}）"
        FAIL=$((FAIL + 1))
    fi
else
    echo "  ${YELLOW}⚠ 跳过（需要 Node.js）${NC}"
fi

# ---------- 总结 ----------
echo ""
echo "${BLUE}══════════════════════════════════════════════════════${NC}"

if [ "$FAIL" -eq 0 ]; then
    echo "${GREEN}  ✅ 全部检查通过！(${PASS} 项)${NC}"
    echo ""
    if [ "$CHECK_ONLY" = false ]; then
        echo "  插件已就绪，可以通过 Skill 系统加载 dev-flow。"
        echo ""
        echo "  触发方式：直接描述前端开发需求即可，例如："
        echo "    \"开发一个词条审核页面，设计稿：https://mastergo.com/xxx\""
        echo "    \"这批改动包含 3 个 UC，优先级最高的是 UC01\""
        echo ""
    fi
    exit 0
else
    echo "${RED}  ❌ 检查未通过！${NC}"
    echo "  通过: ${GREEN}${PASS}${NC}  失败: ${RED}${FAIL}${NC}"
    echo ""
    echo "  请修复上述问题后重新运行。"
    exit 1
fi
