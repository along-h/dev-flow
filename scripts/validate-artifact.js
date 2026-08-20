#!/usr/bin/env node

/**
 * 产物格式校验脚本 (validate-artifact)
 *
 * 用法：
 *   node scripts/validate-artifact.js <artifact-type> <file-path>
 *   node scripts/validate-artifact.js prd artifacts/PRD.md
 *   node scripts/validate-artifact.js components artifacts/COMPONENTS.md
 *   node scripts/validate-artifact.js --list  (列出所有支持的产物类型)
 *
 * 输出：JSON
 *   { "pass": true/false, "errors": [...], "warnings": [...] }
 *   退出码：0 通过, 1 失败
 */

const fs = require("node:fs");
const path = require("node:path");

// ============================================================
// 校验规则定义
// ============================================================

/**
 * 每个产物类型定义了三层规则：
 *   requiredSections  — 必须包含的章节标题
 *   requiredFields    — 每行/每组件必须包含的字段
 *   formatRules       — 格式约束（正则匹配）
 */
const VALIDATION_RULES = {
  prd: {
    label: "PRD（需求文档）",
    requiredSections: [
      { pattern: /第一性原理|First Principles/i, label: "第一性原理分析" },
      { pattern: /用户故事|User Story/i, label: "用户故事" },
      { pattern: /页面.*清单|模块.*清单|UC.*清单/i, label: "页面/模块清单" },
      { pattern: /设计.*Token|设计.*规范|设计.*约束/i, label: "设计Token/规范" },
      { pattern: /验收.*标准|Acceptance Criteria/i, label: "验收标准" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "设计Token必须包含颜色体系",
        check: (content) =>
          /颜色|color|primary|--color/i.test(content),
      },
      {
        desc: "设计Token必须包含字体/字号",
        check: (content) =>
          /字体|字号|font|font-size|typography/i.test(content),
      },
      {
        desc: "设计Token必须包含间距体系",
        check: (content) =>
          /间距|spacing|padding|margin|gap/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含成功指标",
        check: (content) => /成功指标|Success Metric/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含事实证据",
        check: (content) => /事实[\s\S]{0,40}(证据|来源)/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含假设验证方式",
        check: (content) => /假设[\s\S]{0,60}验证/i.test(content),
      },
      {
        desc: "第一性原理分析必须包含最小方案和停止条件",
        check: (content) =>
          /最小.*方案|Minimum.*Solution/i.test(content) &&
          /停止.*条件|回退.*条件|Stop.*Condition/i.test(content),
      },
      {
        desc: "第一性原理分析不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /第一性原理|First Principles/i),
          ),
      },
    ],
  },

  "component-index": {
    label: "组件索引表",
    requiredSections: [
      { pattern: /项目结构概览|Project Overview/i, label: "项目结构概览" },
      { pattern: /组件索引|Component Index/i, label: "组件索引" },
      { pattern: /扫描日志|Scan Log/i, label: "扫描日志" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "组件索引必须包含表格（至少一个组件行）",
        check: (content) => {
          // 匹配 Markdown 表格行: | 组件名 | ... |
          const tableRows = content.match(/^\|.+\|.+\|$/gm);
          return tableRows && tableRows.length >= 2; // header + 至少一行
        },
      },
      {
        desc: "每个组件行必须包含'导入路径'列",
        check: (content) =>
          /导入路径|import.*path|import/i.test(content),
      },
    ],
  },

  components: {
    label: "组件拆分方案",
    requiredSections: [
      { pattern: /页面.*组件树|组件树|Component Tree/i, label: "页面级组件树" },
      { pattern: /通用组件|复用组件|Shared.*Component/i, label: "通用组件清单" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "组件树必须描述组件层级（嵌套结构）",
        check: (content) =>
          /├──|└──|──\s/i.test(content) || /<.*>/.test(content),
      },
      {
        desc: "每个组件必须有职责描述",
        check: (content) =>
          /职责|Responsibility|负责/i.test(content),
      },
      {
        desc: "每个组件必须有Props/State/数据来源",
        check: (content) =>
          /Props|props/i.test(content) && /State|state/i.test(content),
      },
    ],
  },

  tdd: {
    label: "TDD（技术设计文档）",
    requiredSections: [
      { pattern: /组件树|Component Tree/i, label: "组件树" },
      { pattern: /数据流|Data Flow|状态管理/i, label: "数据流设计" },
      { pattern: /API.*契约|接口.*契约|API.*Contract|services/i, label: "API契约" },
      { pattern: /性能|Performance|优化/i, label: "性能策略" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      { pattern: /对抗性审查|Adversarial Review/i, label: "对抗性审查" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "API契约必须包含请求方法(GET/POST/PUT/DELETE)",
        check: (content) =>
          /\b(GET|POST|PUT|DELETE|PATCH)\b/i.test(content),
      },
      {
        desc: "TypeScript类型定义必须存在（无any）",
        check: (content) =>
          /interface|type\s+\w+\s*=/i.test(content),
      },
      {
        desc: "对抗性审查必须包含明确结论",
        check: (content) =>
          /\b(BLOCK|ACCEPT_WITH_RISK|ACCEPT)\b/.test(content),
      },
      {
        desc: "对抗性审查必须记录审查者、独立输入边界和BLOCK处置",
        check: (content) =>
          /审查者|Reviewer/i.test(content) &&
          /输入边界|Input Boundary/i.test(content) &&
          /BLOCK.*处置|BLOCK.*Disposition/i.test(content),
      },
      {
        desc: "异步路径的乱序响应和重复提交必须至少为9分，或提供不适用证明",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) || hasValidAsyncRiskDecision(content),
      },
      {
        desc: "风险评估和对抗性审查不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (!hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ) &&
            !hasUnresolvedPlaceholder(
              extractMarkdownSection(content, /对抗性审查|Adversarial Review/i),
            )),
      },
    ],
  },

  review: {
    label: "审查报告",
    requiredSections: [
      { pattern: /审查摘要|Review Summary|概览/i, label: "审查摘要" },
      { pattern: /审查依据层级|Review Hierarchy/i, label: "审查依据层级" },
      { pattern: /问题.*列表|问题.*清单|Issue.*List|问题详情/i, label: "问题列表" },
      { pattern: /反例验证|Counterexample/i, label: "反例验证" },
      { pattern: /运行证据|Verification Evidence/i, label: "运行证据" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "每个问题必须有级别（P0/P1/P2）",
        check: (content) => {
          const issues = extractIssues(content);
          if (issues.length === 0) return true; // 无问题则通过
          return issues.every((i) => /\bP[012]\b/.test(i));
        },
        failDetail: (content) => {
          const issues = extractIssues(content);
          const badIssues = issues.filter((i) => !/\bP[012]\b/.test(i));
          return `以下问题缺少级别标注：${badIssues.map((i) => i.slice(0, 60)).join(" | ")}`;
        },
      },
      {
        desc: "每个问题必须有修复方案",
        check: (content) => {
          const issues = extractIssues(content);
          if (issues.length === 0) return true;
          return issues.every(
            (i) =>
              /修复|fix|改为|改为|改成|建议|方案/i.test(i)
          );
        },
      },
      {
        desc: "运行证据必须包含本轮实际命令、退出码和结果摘要",
        check: (content) =>
          /本轮|审查时间|执行时间/i.test(content) &&
          /实际命令/i.test(content) &&
          /退出码/i.test(content) &&
          /结果摘要|原始输出/i.test(content),
      },
      {
        desc: "运行证据不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          !hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /运行证据|Verification Evidence/i),
          ),
      },
    ],
  },

  "task-breakdown": {
    label: "任务拆分方案",
    requiredSections: [
      { pattern: /UC.*任务.*清单|任务.*清单|Task.*List/i, label: "UC任务清单" },
      { pattern: /跨.*UC.*依赖|依赖.*分析|Dependency/i, label: "跨UC依赖分析" },
      { pattern: /执行.*顺序|Execution.*Order|批次/i, label: "执行顺序" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "依赖关系不能有循环引用",
        check: (content) => {
          // 简单的循环检测：不能出现"A依赖B"且"B依赖A"在同一上下文
          // 更精确的检测需要图算法，这里做轻量级检查
          const deps = [];
          const depRegex = /(UC\d+).*?依赖.*?(UC\d+)/gi;
          let match;
          while ((match = depRegex.exec(content)) !== null) {
            deps.push({ from: match[1], to: match[2] });
          }
          // 检查是否有双向依赖
          for (const d of deps) {
            const reverse = deps.find((x) => x.from === d.to && x.to === d.from);
            if (reverse) return false;
          }
          return true;
        },
        failDetail: () => "检测到循环依赖（A依赖B且B依赖A）",
      },
    ],
  },

  "global-architecture": {
    label: "全局架构方案",
    requiredSections: [
      { pattern: /统一数据模型|数据模型|Data Model|types/i, label: "统一数据模型" },
      { pattern: /共享组件|Shared.*Component|组件库/i, label: "共享组件库" },
      { pattern: /路由|布局|Layout|Router/i, label: "全局路由/布局" },
      { pattern: /各.*UC.*架构.*边界|UC.*边界|架构.*边界/i, label: "各UC架构边界" },
      { pattern: /风险评估|Risk Assessment/i, label: "风险评估" },
      { pattern: /对抗性审查|Adversarial Review/i, label: "对抗性审查" },
    ],
    requiredFields: [],
    formatRules: [
      {
        desc: "目录结构必须有清晰的层级",
        check: (content) =>
          /src\/|pages\/|components\/|├──|└──/i.test(content),
      },
      {
        desc: "每个共享组件必须有Props契约",
        check: (content) =>
          /interface.*Props|type.*Props/i.test(content),
      },
      {
        desc: "对抗性审查必须包含明确结论",
        check: (content) =>
          /\b(BLOCK|ACCEPT_WITH_RISK|ACCEPT)\b/.test(content),
      },
      {
        desc: "对抗性审查必须记录审查者、独立输入边界和BLOCK处置",
        check: (content) =>
          /审查者|Reviewer/i.test(content) &&
          /输入边界|Input Boundary/i.test(content) &&
          /BLOCK.*处置|BLOCK.*Disposition/i.test(content),
      },
      {
        desc: "风险评估和对抗性审查不能保留占位内容",
        check: (content, filePath) =>
          isTemplateArtifact(filePath) ||
          (!hasUnresolvedPlaceholder(
            extractMarkdownSection(content, /风险评估|Risk Assessment/i),
          ) &&
            !hasUnresolvedPlaceholder(
              extractMarkdownSection(content, /对抗性审查|Adversarial Review/i),
            )),
      },
    ],
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从审查报告中提取每个问题块
 */
function extractIssues(content) {
  // 匹配问题块：以"###"或"|"或"P0/P1/P2"开头的段落
  const blocks = content.split(/\n(?=###\s|\*\*P[012]\*\*|P[012][：:])/);
  // 过滤掉太短的块（不是问题）
  return blocks.filter(
    (b) => b.length > 20 && (/\bP[012]\b/.test(b) || /###\s+问题/.test(b) || /问题\s*\d+/.test(b))
  );
}

/**
 * 判断当前校验对象是否为仓库模板，模板允许保留引导性占位符。
 *
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否为模板文件
 */
function isTemplateArtifact(filePath) {
  return /templates[\\/].+-template\.md$/i.test(filePath);
}

/**
 * 提取指定 Markdown 标题下的内容，供语义槽位校验使用。
 *
 * @param {string} content Markdown 内容
 * @param {RegExp} headingPattern 标题匹配规则
 * @returns {string} 章节内容
 */
function extractMarkdownSection(content, headingPattern) {
  const lines = content.split("\n");
  const headingIndex = lines.findIndex(
    (line) => /^#{1,6}\s+/.test(line) && headingPattern.test(line),
  );
  if (headingIndex === -1) return "";

  const headingLevel = lines[headingIndex].match(/^(#{1,6})\s+/)?.[1].length ?? 6;
  const sectionLines = [];

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const nextHeading = lines[index].match(/^(#{1,6})\s+/);
    if (nextHeading && nextHeading[1].length <= headingLevel) break;
    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n");
}

/**
 * 检查关键章节是否仍含未完成占位内容。
 *
 * @param {string} content 章节内容
 * @returns {boolean} 是否存在占位内容
 */
function hasUnresolvedPlaceholder(content) {
  return /\.\.\.|待补充|稍后补充|\bTBD\b|\bTODO\b|\{[^}\n]+\}/i.test(content);
}

/**
 * 校验异步风险是否给出最低分数或可核验的不适用证明。
 *
 * @param {string} content TDD 内容
 * @returns {boolean} 是否满足风险判定要求
 */
function hasValidAsyncRiskDecision(content) {
  const riskSection = extractMarkdownSection(content, /风险评估|Risk Assessment/i);
  const isNotApplicable =
    /异步风险判定[\s\S]{0,120}不适用[\s\S]{0,80}证明\s*[：:][^\n|]{4,}/i.test(
      riskSection,
    );
  if (isNotApplicable && !hasUnresolvedPlaceholder(riskSection)) return true;

  const validScore = "(?:9|1[0-9]|2[0-7])";
  const orderedScores = new RegExp(
    `乱序响应[^\\d]{0,20}${validScore}\\s*分[\\s\\S]{0,120}重复提交[^\\d]{0,20}${validScore}\\s*分`,
    "i",
  );
  const reversedScores = new RegExp(
    `重复提交[^\\d]{0,20}${validScore}\\s*分[\\s\\S]{0,120}乱序响应[^\\d]{0,20}${validScore}\\s*分`,
    "i",
  );
  return orderedScores.test(riskSection) || reversedScores.test(riskSection);
}

/**
 * 验证单个产物
 */
function validateArtifact(type, filePath) {
  const rules = VALIDATION_RULES[type];
  if (!rules) {
    return {
      pass: false,
      errors: [`未知的产物类型: "${type}"。支持的类型: ${Object.keys(VALIDATION_RULES).join(", ")}`],
      warnings: [],
    };
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return {
      pass: false,
      errors: [`文件不存在: ${filePath}`],
      warnings: [],
    };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const errors = [];
  const warnings = [];

  // 1. 检查必填章节
  for (const section of rules.requiredSections) {
    if (!section.pattern.test(content)) {
      errors.push(`缺少必填章节: "${section.label}"`);
    }
  }

  // 2. 检查必填字段
  for (const field of rules.requiredFields) {
    if (!field.pattern.test(content)) {
      errors.push(`缺少必填字段: "${field.label}"`);
    }
  }

  // 3. 检查格式规则
  for (const rule of rules.formatRules) {
    if (!rule.check(content, filePath)) {
      const detail = rule.failDetail ? rule.failDetail(content) : rule.desc;
      errors.push(`格式不满足: ${detail}`);
    }
  }

  // 4. 通用检查（所有产物）
  // 检查是否有空文件
  if (content.trim().length === 0) {
    errors.push("文件内容为空");
  }

  // 检查是否为纯占位符（模板未填充）
  const placeholderCount = (content.match(/\{[a-zA-Z_]+\}/g) || []).length;
  if (placeholderCount > 10) {
    warnings.push(`文件包含 ${placeholderCount} 个未填充的占位符，可能模板未填充`);
  }

  // 检查是否有明显的截断（最后一个字符不是换行或标点）
  const lastLine = content.trimEnd().split("\n").pop() || "";
  if (lastLine.length > 0 && !/[.!?。！？)\]\}」]$/.test(lastLine.trim())) {
    warnings.push("文件末尾可能被截断（最后一行没有结束标点）");
  }

  return {
    pass: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    meta: {
      type,
      label: rules.label,
      file: filePath,
      size: content.length,
      lines: content.split("\n").length,
    },
  };
}

// ============================================================
// 主入口
// ============================================================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
产物格式校验工具 (validate-artifact)

用法:
  node scripts/validate-artifact.js <artifact-type> <file-path>
  node scripts/validate-artifact.js --list

示例:
  node scripts/validate-artifact.js prd artifacts/PRD.md
  node scripts/validate-artifact.js components artifacts/COMPONENTS.md
  node scripts/validate-artifact.js tdd artifacts/TDD.md
  node scripts/validate-artifact.js review artifacts/REVIEW.md
  node scripts/validate-artifact.js task-breakdown artifacts/TASK-BREAKDOWN.md
  node scripts/validate-artifact.js global-architecture artifacts/GLOBAL-ARCHITECTURE.md
  node scripts/validate-artifact.js component-index artifacts/COMPONENT-INDEX.md

支持的产物类型: ${Object.keys(VALIDATION_RULES).join(", ")}

退出码: 0 = 通过, 1 = 失败
    `.trim());
    process.exit(0);
  }

  if (args.includes("--list")) {
    for (const [type, rules] of Object.entries(VALIDATION_RULES)) {
      console.log(`${type.padEnd(22)} ${rules.label}`);
    }
    process.exit(0);
  }

  if (args.length < 2) {
    console.error("错误: 需要指定产物类型和文件路径。使用 --help 查看用法。");
    process.exit(1);
  }

  const [type, filePath] = args;
  const result = validateArtifact(type, path.resolve(filePath));

  console.log(JSON.stringify(result, null, 2));

  process.exit(result.pass ? 0 : 1);
}

main();
